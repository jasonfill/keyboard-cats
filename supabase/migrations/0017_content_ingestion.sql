-- ---------------------------------------------------------------------------
-- Content ingestion: a document in, a working set out
-- ---------------------------------------------------------------------------
-- "Load it" is the step every other spec assumes is solved. It isn't: today it
-- means typing forty rows or pasting a tab-separated table, and the material a
-- parent actually holds is a PDF the teacher emailed.
--
-- Two rules shape the schema.
--
-- `accepted_at is null` **is** the draft state. No separate status column to
-- drift out of sync with it, and the predicate that gates assignment and
-- rewards is one `is not null`.
--
-- A generated set is a draft until a grown-up accepts it. A draft can be
-- practised — nothing is gated on a parent being awake — but it cannot be
-- assigned, cannot close a goal, and cannot earn a reward. Every one of those
-- is a statement made to a parent, and none of them may rest on unreviewed
-- machine output.
--
-- See docs/content-ingestion-spec.md.

create table if not exists public.content_sources (
  id               uuid        primary key default gen_random_uuid(),
  owner_user_id    uuid        references auth.users (id) on delete cascade,
  learner_id       uuid        references public.learners (id) on delete cascade,
  kind             text        not null,          -- 'upload' | 'link' | 'paste'
  origin           text        not null,          -- filename, or the URL
  mime             text        not null,
  bytes            integer     not null,
  pages            integer,
  -- A second upload of the same file is recognised and offered the existing
  -- result rather than billed again.
  sha256           text        not null,
  provider_file_id text,
  file_expires_at  timestamptz,
  source_map       jsonb,
  created_at       timestamptz not null default now(),
  -- Same ownership rule as every other piece of content, per 0011: a
  -- grown-up's library or a learner's own, never both.
  constraint content_sources_one_owner
    check ((learner_id is null) <> (owner_user_id is null)),
  constraint content_sources_kind_check check (kind in ('upload', 'link', 'paste'))
);

create index if not exists content_sources_owner_idx
  on public.content_sources (owner_user_id, created_at desc) where owner_user_id is not null;
create index if not exists content_sources_learner_idx
  on public.content_sources (learner_id, created_at desc) where learner_id is not null;
create index if not exists content_sources_sha_idx on public.content_sources (sha256);

create table if not exists public.content_jobs (
  id           uuid        primary key default gen_random_uuid(),
  source_id    uuid        not null references public.content_sources (id) on delete cascade,
  status       text        not null default 'queued',
  stage_detail jsonb       not null default '{}'::jsonb,
  claimed_at   timestamptz,
  heartbeat_at timestamptz,
  attempts     smallint    not null default 0,
  error        text,
  usage        jsonb,
  result       jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint content_jobs_status_check
    check (status in ('queued', 'reading', 'building', 'done', 'failed'))
);

create index if not exists content_jobs_claimable
  on public.content_jobs (status, created_at)
  where status in ('queued', 'reading', 'building');

drop trigger if exists content_jobs_touch on public.content_jobs;
create trigger content_jobs_touch
  before update on public.content_jobs
  for each row execute function public.touch_updated_at();

-- Where a set came from, and whether a human has looked at it.
alter table public.decks      add column if not exists source_id   uuid
  references public.content_sources (id) on delete set null;
alter table public.decks      add column if not exists accepted_at timestamptz;
alter table public.word_lists add column if not exists source_id   uuid
  references public.content_sources (id) on delete set null;
alter table public.word_lists add column if not exists accepted_at timestamptz;

comment on column public.decks.accepted_at is
  'Null is the draft state. A draft can be practised; it cannot be assigned or earn a reward.';

-- ---------------------------------------------------------------------------
-- A draft cannot be set as work
-- ---------------------------------------------------------------------------
-- The gate lives here rather than in the UI because it is a statement made to
-- a parent. `assignment_sets.target_id` is text (it also names spelling lists
-- and typing lessons), so this checks only the rows that name a deck.

create or replace function public.assignment_target_is_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.subject = 'quiz' and new.target_id is not null then
    if exists (
      select 1 from public.decks d
       where d.id::text = new.target_id
         and d.accepted_at is null
    ) then
      raise exception 'That set is still a draft. Look it over and accept it before setting it as work.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists assignment_sets_target_accepted on public.assignment_sets;
create trigger assignment_sets_target_accepted
  before insert or update on public.assignment_sets
  for each row execute function public.assignment_target_is_accepted();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
-- A source is readable by whoever can read the content it produced, which
-- mirrors `decks` exactly. Jobs follow their source.

alter table public.content_sources enable row level security;
alter table public.content_jobs    enable row level security;

drop policy if exists content_sources_select on public.content_sources;
create policy content_sources_select on public.content_sources
  for select to authenticated
  using (
    owner_user_id = (select auth.uid())
    or (learner_id is not null and public.can_access_learner(learner_id))
  );

drop policy if exists content_sources_delete on public.content_sources;
create policy content_sources_delete on public.content_sources
  for delete to authenticated
  using (
    owner_user_id = (select auth.uid())
    or (learner_id is not null and public.can_access_learner(learner_id))
  );

drop policy if exists content_jobs_select on public.content_jobs;
create policy content_jobs_select on public.content_jobs
  for select to authenticated
  using (exists (
    select 1 from public.content_sources s
     where s.id = content_jobs.source_id
       and (
         s.owner_user_id = (select auth.uid())
         or (s.learner_id is not null and public.can_access_learner(s.learner_id))
       )
  ));

-- Writes go through the API as the service role: a client may watch a job, and
-- may never create or advance one.
grant select, delete on public.content_sources to authenticated;
grant select on public.content_jobs to authenticated;
