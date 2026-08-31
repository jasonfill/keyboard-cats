-- ---------------------------------------------------------------------------
-- Make the audit trail actually authoritative
-- ---------------------------------------------------------------------------
-- 0006 recorded *whether* an answer was checked. This migration makes the
-- record hard to argue with, which is what a parent looking at a child's
-- history — and anything that pays out a reward — needs:
--
--   1. `attempts` becomes append-only. It was already described as "the record
--      of truth", but every linked user held update and delete on it, and a
--      learner is linked to their own profile. A child signed into their own
--      account could rewrite or erase their history.
--
--   2. Sessions record where their numbers came from. Until now the API stored
--      whatever totals the client sent. From here a session that arrives with
--      attempts has its counts derived from those attempts by the API, and
--      says so; one that cannot (typing, where the finest grain really is the
--      session) says that instead.
--
--   3. Sessions carry the verified-only counts alongside the headline ones, so
--      "how much of this was checked rather than self-graded" is a stored
--      number rather than something a reader has to reconstruct.
--
-- Idempotent, like every migration here.

-- ---------------------------------------------------------------------------
-- 1. Session provenance
-- ---------------------------------------------------------------------------

alter table public.sessions
  add column if not exists verified_items_total   int  not null default 0,
  add column if not exists verified_items_correct int  not null default 0,
  add column if not exists evidence               text not null default 'client';

comment on column public.sessions.evidence is
  'attempts = counts derived server-side from the submitted attempts; client = no attempts accompanied this session (typing); legacy = recorded before provenance was tracked.';
comment on column public.sessions.verified_items_total is
  'Distinct items in this session whose first attempt was system-checked rather than self-graded.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'sessions_evidence_check'
  ) then
    alter table public.sessions
      add constraint sessions_evidence_check
      check (evidence in ('attempts', 'client', 'legacy'));
  end if;
end;
$$;

-- Backfill. The verified counts are new information, so they are computed for
-- every historical session that has attempts to compute them from. The
-- headline items_total/items_correct/accuracy are deliberately NOT rewritten:
-- those numbers have already been shown to a parent, and quietly restating a
-- child's history is worse than labelling it. They are marked 'legacy' so a
-- reader can tell which rule produced them.
--
-- "First attempt at each item" is ordered by the attempts' own identity
-- column, which is insertion order — the order the round was actually played.
with first_attempts as (
  select distinct on (a.session_id, a.subject, a.item_key)
         a.session_id,
         a.correct,
         a.verified
    from public.attempts a
   where a.session_id is not null
   order by a.session_id, a.subject, a.item_key, a.id
),
rolled as (
  select session_id,
         count(*) filter (where verified)               as verified_total,
         count(*) filter (where verified and correct)   as verified_correct
    from first_attempts
   group by session_id
)
update public.sessions s
   set verified_items_total   = r.verified_total,
       verified_items_correct = r.verified_correct,
       evidence               = 'legacy'
  from rolled r
 where s.id = r.session_id
   and s.evidence = 'client';

-- ---------------------------------------------------------------------------
-- 2. Append-only attempts
-- ---------------------------------------------------------------------------
-- Insert and select stay open to anyone linked to the learner: a parent needs
-- to read the history, and the child's own device needs to write it. Nobody
-- gets to change or remove a row afterwards.

drop policy if exists attempts_update_linked on public.attempts;
drop policy if exists attempts_delete_linked on public.attempts;
drop policy if exists attempts_update_own    on public.attempts;
drop policy if exists attempts_delete_own    on public.attempts;

revoke update, delete on public.attempts from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Erasing progress on purpose
-- ---------------------------------------------------------------------------
-- "Erase my progress" still has to work, and deleting your own data is a right
-- rather than a loophole. It moves behind a definer function gated on
-- ownership, so the grown-up who owns the profile can wipe it and the child
-- practising on it cannot.
--
-- Ordered so the audit trail goes last: if this fails part way, what survives
-- is the record everything else can be rebuilt from.

create or replace function public.erase_learner_progress(p_learner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.owns_learner(p_learner_id) then
    raise exception 'Only the owner of that learner may erase their progress'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.sessions       where learner_id = p_learner_id;
  delete from public.item_mastery   where learner_id = p_learner_id;
  delete from public.list_progress  where learner_id = p_learner_id;
  delete from public.achievements   where learner_id = p_learner_id;
  delete from public.daily_activity where learner_id = p_learner_id;
  delete from public.high_scores    where learner_id = p_learner_id;
  delete from public.skill_states   where learner_id = p_learner_id;
  delete from public.attempts       where learner_id = p_learner_id;
end;
$$;

grant execute on function public.erase_learner_progress(uuid) to authenticated;
