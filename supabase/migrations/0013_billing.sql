-- ---------------------------------------------------------------------------
-- Billing: parents pay, coverage follows the learner
-- ---------------------------------------------------------------------------
-- `profiles.plan` asks "is this user Pro?", and that question has no answer for
-- a teacher with twenty-five students across twelve families. The question that
-- always has one is "is this learner covered?".
--
-- So what is bought is coverage of a specific child. Everyone linked to a
-- covered learner — parent, tutor, teacher — gets the covered feature set for
-- that learner, and only the parent pays. A teacher never sees a plan.
--
-- Schema only. No payment provider is wired here: subscriptions and credit
-- packs are weeks of external integration that help no learner and block
-- nothing until ingestion ships. What cannot wait is the meter, because cost
-- logging written after the fact is cost logging that never happened.
--
-- See docs/billing-spec.md.

create table if not exists public.subscriptions (
  id                   uuid        primary key default gen_random_uuid(),
  payer_id             uuid        not null references auth.users (id) on delete cascade,
  status               text        not null default 'active',
  -- No `seats` column. How many learners a subscription covers is
  -- `count(*) from learner_coverage`, and a stored copy is a second answer to
  -- a question that already has one — which is how a billed quantity and a
  -- covered-children list drift apart. It can arrive with the reconciliation
  -- that needs it.
  provider             text,                            -- 'stripe' | 'comp' | 'promo'
  provider_customer_id text,
  provider_sub_id      text,
  current_period_end   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint subscriptions_status_check check (status in ('active', 'past_due', 'cancelled'))
);

create index if not exists subscriptions_payer_idx on public.subscriptions (payer_id);

-- `learner_id` is the primary key, so a learner is covered by at most one
-- subscription. Two parents cannot both be billed for the same child by
-- accident, and "who is paying for this child?" has exactly one answer.
create table if not exists public.learner_coverage (
  learner_id      uuid        primary key references public.learners (id) on delete cascade,
  subscription_id uuid        not null references public.subscriptions (id) on delete cascade,
  since           timestamptz not null default now()
);

create index if not exists learner_coverage_sub_idx
  on public.learner_coverage (subscription_id);

drop trigger if exists subscriptions_touch on public.subscriptions;
create trigger subscriptions_touch
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- The one predicate every gate calls
-- ---------------------------------------------------------------------------
-- `past_due` counts as covered on purpose. A failed card is a payment problem,
-- not a reason to take a child's progress report away mid-week, and a dunning
-- window resolves most of them.

-- The legacy arm matters more than it looks. `profiles.plan` is how anybody is
-- Pro today — comped, promo, or hand-set — and no payment provider is wired
-- yet, so `learner_coverage` is empty. Without it, shipping this migration
-- would silently strip every existing Pro account of the things they have. It
-- comes out when billing actually ships and the rows exist.
create or replace function public.is_learner_covered(p_learner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.learner_coverage c
      join public.subscriptions s on s.id = c.subscription_id
     where c.learner_id = p_learner
       and s.status in ('active', 'past_due')
  )
  or exists (
    select 1
      from public.learners l
      join public.profiles p on p.id = l.owner_id
     where l.id = p_learner
       and p.plan = 'pro'
  );
$$;

grant execute on function public.is_learner_covered(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- What the model actually cost
-- ---------------------------------------------------------------------------
-- Written on every call, success or failure. A refused or errored call still
-- spent tokens, and a cost model built only from successes understates reality.
--
-- This has to exist before the first model call is ever made, not before the
-- quota gate ships: the numbers in the billing spec are estimates sized to
-- start from, and nothing can replace them if nobody was measuring.

create table if not exists public.llm_usage (
  id                    uuid        primary key default gen_random_uuid(),
  at                    timestamptz not null default now(),
  user_id               uuid        references auth.users (id) on delete set null,
  learner_id            uuid        references public.learners (id) on delete set null,
  subscription_id       uuid        references public.subscriptions (id) on delete set null,
  feature               text        not null,   -- 'ingest.read' | 'ingest.build' | 'enrich'
  source_id             uuid,
  job_id                uuid,
  model                 text        not null,
  input_tokens          integer     not null default 0,
  output_tokens         integer     not null default 0,
  cache_creation_tokens integer     not null default 0,
  cache_read_tokens     integer     not null default 0,
  -- From a versioned rate table in code, so historical rows keep the price
  -- that was true when they were written.
  est_cost_usd          numeric(10,5) not null default 0,
  duration_ms           integer,
  stop_reason           text,
  ok                    boolean     not null default true
);

create index if not exists llm_usage_month
  on public.llm_usage (subscription_id, at desc);
create index if not exists llm_usage_feature
  on public.llm_usage (feature, at desc);

comment on table public.llm_usage is
  'Every model call, success or failure. Sizing a quota against successes only understates it.';

-- ---------------------------------------------------------------------------
-- Credits
-- ---------------------------------------------------------------------------
-- Metered in credits rather than documents, because a document is not a unit
-- of cost and a page very nearly is. An allowance of ten documents a month
-- prices ten worksheets the same as ten chapters, and the chapters cost four
-- times as much — a loss on exactly the case the feature exists to serve.
--
-- An append-only ledger with the balance derived, the same treatment `attempts`
-- gets. Every dispute is then answerable from the record rather than from a
-- number somebody overwrote.

create table if not exists public.credit_ledger (
  id                  uuid        primary key default gen_random_uuid(),
  subscription_id     uuid        references public.subscriptions (id) on delete cascade,
  -- Teachers never pay and have no subscription, but they do get an allowance.
  user_id             uuid        references auth.users (id) on delete cascade,
  at                  timestamptz not null default now(),
  kind                text        not null,
  bucket              text        not null,
  -- Signed: grants and purchases positive, spend negative.
  credits             integer     not null,
  job_id              uuid,
  source_id           uuid,
  provider_payment_id text,
  note                text,
  constraint credit_ledger_kind_check check (kind in
    ('grant', 'purchase', 'reserve', 'consume', 'release', 'refund', 'expire')),
  -- `included` resets monthly and the remainder expires; `purchased` rolls
  -- over. Spending `included` first is not a detail: the reverse order burns a
  -- parent's bought credits while free ones expire underneath them.
  constraint credit_ledger_bucket_check check (bucket in ('included', 'purchased')),
  constraint credit_ledger_has_holder check (
    (subscription_id is null) <> (user_id is null)
  )
);

create index if not exists credit_ledger_sub_idx
  on public.credit_ledger (subscription_id, at desc) where subscription_id is not null;
create index if not exists credit_ledger_user_idx
  on public.credit_ledger (user_id, at desc) where user_id is not null;

comment on table public.credit_ledger is
  'Append-only. Balance is a sum, never a stored total anybody overwrites.';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- A payer reads their own subscription and their own ledger, and writes
-- neither: money moves through a provider webhook running as the service role,
-- never through a client. Coverage is readable by anyone who can already see
-- the learner, because "is this child covered?" is exactly the question every
-- gate asks.

alter table public.subscriptions   enable row level security;
alter table public.learner_coverage enable row level security;
alter table public.credit_ledger   enable row level security;
alter table public.llm_usage       enable row level security;

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated
  using (payer_id = (select auth.uid()));

drop policy if exists learner_coverage_select on public.learner_coverage;
create policy learner_coverage_select on public.learner_coverage
  for select to authenticated
  using (public.can_access_learner(learner_id));

drop policy if exists credit_ledger_select_own on public.credit_ledger;
create policy credit_ledger_select_own on public.credit_ledger
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.subscriptions s
       where s.id = credit_ledger.subscription_id
         and s.payer_id = (select auth.uid())
    )
  );

-- `llm_usage` is ours, not theirs: it is a cost record, and no policy grants
-- any authenticated read at all.

grant select on public.subscriptions    to authenticated;
grant select on public.learner_coverage to authenticated;
grant select on public.credit_ledger    to authenticated;
