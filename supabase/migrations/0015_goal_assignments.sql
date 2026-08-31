-- ---------------------------------------------------------------------------
-- Goal assignments: work set as an outcome, not as an activity
-- ---------------------------------------------------------------------------
-- Until now a grown-up set *an activity on a target* — "do Learn on this deck".
-- That makes them choose between Learn and Test, which is a pedagogical
-- decision being outsourced to a parent at 9pm.
--
-- A goal is set instead: "master this set". Everything after that is derived —
-- which items are introduced when, what rung each is asked at, when the check
-- is offered.
--
-- The consequence for this schema is the whole reason it needs a migration.
-- `complete_matching_assignments` closes a task when a *session* lands that
-- matches subject + activity + target. A goal is not closed by a session; it is
-- closed by a **state** — this learner knows this material. One good afternoon
-- must not end a week's work.
--
-- What does not change: nobody ticks anything off. Closure is still derived,
-- still in the same transaction as the round that tipped it over, and still
-- stores the session id as the evidence. Only the predicate is different.

alter table public.assignment_sets
  add column if not exists goal jsonb;

comment on column public.assignment_sets.goal is
  'Present when this is a goal rather than an activity. { kind, fraction }.';

-- ---------------------------------------------------------------------------
-- Closing a goal
-- ---------------------------------------------------------------------------
-- Mastery here is the strict reading: answered correctly, unaided, on answers
-- the app checked. `item_mastery` already carries exactly that, and the same
-- band the rest of the product means by "mastered".

create or replace function public.close_met_goals(
  p_learner_id uuid,
  p_session_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  closed int := 0;
begin
  with goals as (
    select a.id           as assignment_id,
           s.target_id,
           coalesce((s.goal ->> 'fraction')::numeric, 0.9) as fraction
      from public.assignments a
      join public.assignment_sets s on s.id = a.set_id
     where a.learner_id = p_learner_id
       and a.status = 'open'
       and s.goal is not null
       and s.target_id is not null
  ),
  measured as (
    select g.assignment_id,
           g.fraction,
           count(*) filter (
             where m.mastery >= 0.8 and m.correct_streak >= 2
           )::numeric as mastered,
           count(*)::numeric as total
      from goals g
      join public.item_mastery m
        on m.learner_id = p_learner_id
       and m.subject = 'quiz'
       -- Item keys are `deckId:cardId`, which is what makes this a range scan
       -- rather than a scan of everything the learner has ever answered.
       and m.item_key like g.target_id || ':%'
     group by g.assignment_id, g.fraction
  )
  update public.assignments a
     set status = 'done',
         completed_at = now(),
         session_id = p_session_id,
         updated_at = now()
    from measured
   where a.id = measured.assignment_id
     and measured.total > 0
     and measured.mastered / measured.total >= measured.fraction;

  get diagnostics closed = row_count;
  return closed;
end;
$$;

grant execute on function public.close_met_goals(uuid, uuid) to authenticated;

-- A goal that was closed by a round which is later erased has to reopen, the
-- same as any other task. The existing BEFORE DELETE trigger on sessions
-- already does this by session id, so nothing new is needed — but a goal can
-- also *stop* being met when the mastery it rested on is rebuilt, and that is
-- deliberately not handled: a goal met is a goal met. Taking one back because
-- a cache was recomputed would be the worst kind of surprise.
