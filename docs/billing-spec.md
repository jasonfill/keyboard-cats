# Billing — parents pay, coverage follows the learner

**Status:** proposal · **Date:** 2026-08-31 · **Migration:** 0012b (see the registry in [build-sequence.md](build-sequence.md))

The decision that settles it: **parents pay, teachers and tutors never do, and
what is bought is coverage of a specific child.**

That one sentence resolves the blocker that has been sitting in the notes since
the tutor work landed. `profiles.plan` asks *"is this user Pro?"*, which has no
answer for a teacher with twenty-five students in twelve families. The right
question is **"is this learner covered?"** — and it always has an answer.

---

## 1. The model

```
  subscription  ──covers──▶  learner  ◀──linked──  parent, tutor, teacher
   (a paying parent)          (a child)              (anyone working with them)
```

- A **subscription** belongs to one paying user. Today that is always a parent
  — the person who owns the learner profiles.
- **Coverage** is a row joining a subscription to a learner. A learner is
  covered or not; there is no third state.
- **Everyone linked to a covered learner gets the covered feature set for that
  learner.** A tutor working with a covered child sees full history and the
  item-level report for that child, and pays nothing.
- A teacher with twenty-five students, twelve of them covered, gets the full
  feature set for twelve and the free set for thirteen. They are never asked to
  pay and never see a plan.

One predicate replaces every plan check in the app:

```sql
public.is_learner_covered(p_learner uuid) returns boolean
```

### Pricing

**$4 for the first learner, $2 for each additional learner on the same
subscription.** Marketed as *"$4 for one child, $8 for three"* — the same
arithmetic, and it scales to five children without inventing a new plan.

A flat family rate was the alternative and it is worse for the same money: it
prices a one-child family the same as a four-child family, and one-child
families are most of the market.

### Why this earns twice on shared content

A tutor's deck studied by six children in six families is covered six times,
because coverage is per learner. That is the correct incentive: the value
delivered scales with children, and so does the revenue, without anyone having
to meter content.

### It already accommodates districts

Coverage is granted *by a subscription* to *a learner*. A district plan is a
subscription with many covered learners and a different payer — no schema
change, no rewrite of any gate. That is the whole forward-compatibility story
and it costs nothing to have now.

---

## 2. What is gated, and the principle behind it

> **Never gate learning. Gate leverage, and gate marginal cost.**

This is the existing commitment — *"a spelling app that paywalls fourth grade
is not much use to the kid who needs fourth grade"* — extended to everything
the three specs add. A child on an uncovered learner can still learn
everything the app knows how to teach.

### Free for everyone, always

Learning, and the loop that brings people in.

| | Why it is free |
| --- | --- |
| Every activity, every ladder rung, the Mastery Path | it is the product's purpose |
| All curriculum: spelling, typing, generated banks | paywalling a grade is indefensible |
| Tracks, spaced review, retention scheduling | the engine is not a feature |
| **Setting work, and completing it** | see below |
| A learner's own view of their own progress | it is theirs |
| The last 30 days of history for a grown-up | enough to see it working |
| Three study decks and one word list of your own | unchanged from today |

**Assigning is free, deliberately and permanently.** A teacher who sets work
for twenty-five children causes twenty-five families to open the app and see
that somebody set work for their child. That is the acquisition channel, and
gating it would strangle the exact wedge this business runs on. A teacher can
run an entire class for nothing.

### Covered learner

Everything a grown-up wants *about that child*.

| | |
| --- | --- |
| Full history instead of 30 days | the record was always kept; coverage unlocks the view |
| Item-level mastery report — every miss, every word | |
| **Retention reporting** — the Checkpoint number | the headline claim, and the best reason to pay |
| **Rewards** — parent-set payouts and the ledger | grown-up leverage by definition |
| Printable progress sheets, CSV export | |
| Unlimited decks and word lists | |
| Per-track ability and level reporting | |

### Metered — real marginal cost

**Document ingestion only.** It is the one feature where a use costs money.

| | Documents / month | Pages | Size |
| --- | --- | --- | --- |
| Any account, uncovered | **2**, ever — not per month | 20 | 10 MB |
| Per covered learner | **+10 / month**, pooled on the payer | 100 | 25 MB |
| Any teacher or tutor account | **3 / month** | 100 | 25 MB |

Three things worth saying about that table.

**The free two are once, not monthly**, so the value is felt rather than
described, and the demo is the real product.

**Quota pools on the payer and scales with children**, so a parent covering
three learners gets thirty documents a month against one bill.

**Teachers get a standing allowance they never pay for.** They are the people
most likely to have a chapter PDF, and they are the reason families arrive.
Three a month is enough to be genuinely useful and small enough that abuse is
bounded. If the number is wrong we will know, because §4 logs everything.

---

## 3. Rules at the edges

These are the ones that get decided badly under time pressure, so they are
decided here.

1. **Nothing is ever deleted on lapse.** A parent who stops paying keeps every
   deck, every word list and every attempt. History beyond 30 days is *hidden*,
   not destroyed, and reappears intact on re-subscribing. Deleting a child's
   work for non-payment is not a business model.
2. **Limits apply to creating, never to keeping.** Forty decks made while
   covered stay usable after a lapse; the forty-first is refused. The message
   says which, plainly.
3. **A reward already earned is always payable.** Coverage lapsing cannot
   un-earn a promise — the same latching rule the rewards spec already sets,
   for the same reason.
4. **Coverage is checked at the moment of use, never cached in the client.**
   Every gate is `is_learner_covered()` server-side. The client may *show* a
   lock; it may never *be* the lock.
5. **A tutor may pay for a learner they do not own, if we ever choose to sell
   that.** The schema allows any subscription to cover any learner it is linked
   to. We only market to parents; that is policy, not architecture.
6. **A quota refusal happens before the money is spent.** An ingestion job that
   would breach the quota, the page cap or a deck limit is refused *before* the
   first model call, never after.

---

## 4. Cost logging — every call, from the first one

Nothing here is priced with confidence, and it should not be. The quota numbers
in §2 are estimates to start from and replace.

```sql
create table public.llm_usage (
  id                uuid primary key default gen_random_uuid(),
  at                timestamptz not null default now(),
  -- who and what for
  user_id           uuid references auth.users (id) on delete set null,
  learner_id        uuid references public.learners (id) on delete set null,
  subscription_id   uuid references public.subscriptions (id) on delete set null,
  feature           text not null,        -- 'ingest.read' | 'ingest.build' | 'enrich'
  source_id         uuid,                 -- the document, when there is one
  job_id            uuid,
  -- what it cost
  model             text not null,
  input_tokens          integer not null,
  output_tokens         integer not null,
  cache_creation_tokens integer not null default 0,
  cache_read_tokens     integer not null default 0,
  est_cost_usd      numeric(10,5) not null,
  duration_ms       integer,
  stop_reason       text,
  ok                boolean not null default true
);

create index llm_usage_month on public.llm_usage (subscription_id, at desc);
create index llm_usage_feature on public.llm_usage (feature, at desc);
```

**Written on every call, success or failure.** A refused or errored call still
cost tokens, and a cost model built only from successes understates reality.

Three numbers this has to be able to answer on day one:

- **Cost per document**, by page count — the number the quota is sized against.
- **Cache hit rate on the build fan-out.** The ingestion spec's caching is what
  makes a multi-topic document affordable. If `cache_read_tokens` is zero on
  the second topic call, something upstream is varying and the run costs
  roughly ten times what it should. **This should be an alert, not a dashboard
  someone remembers to look at.**
- **Cost per covered learner per month.** The gross-margin number. If it ever
  approaches $2 the pricing is wrong and we will know before it matters.

`est_cost_usd` is computed from a rate table in code, versioned, so historical
rows keep the price that was true when they were written.

---

## 5. Data model

```sql
create table public.subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  payer_id            uuid not null references auth.users (id) on delete cascade,
  status              text not null default 'active',   -- active | past_due | cancelled
  seats               integer not null default 1,       -- learners paid for
  provider            text,                             -- 'stripe' | 'comp' | 'promo'
  provider_customer_id text,
  provider_sub_id     text,
  current_period_end  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint subscriptions_status_check
    check (status in ('active','past_due','cancelled'))
);

create table public.learner_coverage (
  learner_id      uuid primary key references public.learners (id) on delete cascade,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  since           timestamptz not null default now()
);
```

`learner_coverage.learner_id` is the primary key, so **a learner is covered by
at most one subscription.** Two parents cannot both be billed for the same
child by accident, and "who is paying for this child?" has exactly one answer.

```sql
create or replace function public.is_learner_covered(p_learner uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.learner_coverage c
      join public.subscriptions s on s.id = c.subscription_id
     where c.learner_id = p_learner
       and s.status in ('active', 'past_due')
  );
$$;
```

`past_due` counts as covered on purpose. A failed card is a payment problem,
not a reason to take a child's progress report away mid-week; Stripe's dunning
window resolves most of them.

### What happens to `profiles.plan`

It stays, unused, until nothing reads it — then it goes. Every gate moves to
`is_learner_covered()`. `plans.ts` stops being `PlanId → limits` and becomes
two things: **what is free** and **what coverage adds**, with quota separate
because quota is per payer rather than per learner.

Seat count is derived from `learner_coverage`, never typed by anyone; Stripe's
quantity is updated when coverage rows change.

---

## 6. What this changes in the other specs

- **Activities spec, Plans** — rewritten around coverage. Rewards move from
  unstated to covered-learner. The "whole curriculum is free" commitment stands
  and now extends to every new activity.
- **Ingestion spec, §9** — the quota table above replaces the Pro/free split,
  and `documentsPerMonth` becomes a pooled, coverage-derived number rather than
  a `PlanLimits` constant.
- **Structure spec** — nothing. Tracks are free; a taxonomy is not a feature.
- **Build sequence** — billing lands in **stage 0.5**: after foundations,
  before ingestion, because ingestion cannot be metered against a model that
  does not exist. It does not block the ladder or tracks.

---

## 7. Open questions

1. **Annual pricing?** Probably, at two months free, but not before there is a
   renewal cohort to measure.
2. **What does a lapsed parent see?** A lock with the number behind it —
   *"Ava has retained 87% of what she has mastered"* with the detail greyed —
   is more honest and more effective than hiding that the number exists. Worth
   testing rather than assuming.
3. **Does a teacher ever want to pay** to cover an uncovered student they care
   about? The schema allows it. Whether to offer it is a product decision that
   can wait for someone to ask.
4. **The district model's payer** is an organisation, not a user. That is the
   only real schema addition it needs, and it is one nullable column on
   `subscriptions`. Not now.
