-- ---------------------------------------------------------------------------
-- Verified vs self-reported attempts
-- ---------------------------------------------------------------------------
-- `attempts` is the record everything else derives from, and until now it could
-- not tell the difference between "the system checked this answer" and "the
-- learner said they got it right". Flashcards are self-graded, so a learner who
-- taps "Got it" on a card they did not know was writing the same row as one who
-- typed the answer from memory.
--
-- That gap matters twice over:
--
--   * mastery and the review schedule were moving on an unverified claim, so a
--     learner could tap their way out of their own review queue;
--   * anything that hands out a reward has to be able to ask for evidence, and
--     evidence has to be a column, not an inference from `activity`.
--
-- `is_test` is a different axis and stays as it is: it means "no hints were
-- shown". An attempt can be hint-free and still be self-reported.
--
-- Idempotent, like every migration here.

alter table public.attempts
  add column if not exists verified boolean not null default true;

comment on column public.attempts.verified is
  'True when the system checked the answer; false when the learner self-graded (flashcards).';

-- Existing rows: flashcard rounds are the self-graded ones, and the mode is
-- already recorded in `activity`. Everything else was system-checked, which the
-- column default covers.
update public.attempts
   set verified = false
 where activity = 'flashcards'
   and verified;

-- Rewards, and any other "prove it" query, will want to count only the
-- evidence, so index for that rather than making them scan a learner's history.
create index if not exists attempts_user_verified_idx
  on public.attempts (learner_id, subject, verified, created_at desc);

-- ---------------------------------------------------------------------------
-- Rebuild mastery from evidence only
-- ---------------------------------------------------------------------------
-- Same function as 0003, with one clause added: self-reported attempts are not
-- part of the recomputation. The whole point of rebuilding from the audit trail
-- is to derive mastery from what was actually demonstrated, and a claim is not
-- a demonstration. A card only ever seen in flashcards rebuilds to no mastery,
-- which is the honest answer.

create or replace function public.rebuild_item_mastery(p_learner_id uuid, p_subject text)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  touched int;
begin
  if not public.can_access_learner(p_learner_id) then
    raise exception 'Not allowed to rebuild mastery for that learner'
      using errcode = 'insufficient_privilege';
  end if;

  with ranked as (
    select
      a.item_key,
      a.correct,
      a.difficulty,
      a.created_at,
      row_number() over (partition by a.item_key order by a.created_at desc) as recency
    from public.attempts a
    where a.learner_id = p_learner_id
      and a.subject = p_subject
      and a.is_test
      and a.verified
  ),
  rolled as (
    select
      item_key,
      sum(case when correct then power(0.72, recency - 1) else 0 end)
        / nullif(sum(power(0.72, recency - 1)), 0) as mastery,
      count(*)                                     as total_attempts,
      count(*) filter (where correct)              as total_correct,
      max(difficulty)                              as difficulty,
      max(created_at)                              as last_seen_at,
      min(created_at)                              as first_seen_at
    from ranked
    group by item_key
  )
  insert into public.item_mastery as m
    (learner_id, subject, item_key, difficulty, mastery, total_attempts, total_correct, first_seen_at, last_seen_at)
  select p_learner_id, p_subject, item_key, coalesce(difficulty, 2.0), coalesce(mastery, 0),
         total_attempts, total_correct, first_seen_at, last_seen_at
  from rolled
  on conflict (learner_id, subject, item_key) do update
    set mastery        = excluded.mastery,
        total_attempts = excluded.total_attempts,
        total_correct  = excluded.total_correct,
        last_seen_at   = excluded.last_seen_at;

  get diagnostics touched = row_count;
  return touched;
end;
$$;
