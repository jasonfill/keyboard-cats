-- ---------------------------------------------------------------------------
-- Assignments: work a grown-up sets, and the evidence that it was done
-- ---------------------------------------------------------------------------
-- A task list per learner. Each row names one piece of work — a deck to study,
-- a spelling list to be tested on, a typing lesson to play — and is closed by
-- the round that satisfied it rather than by anyone saying so.
--
-- Two decisions are worth stating, because they are what make the list worth
-- anything to a parent:
--
--   1. Nobody ticks a task off. `complete_matching_assignments` closes tasks
--      when a session lands that matches them, and stores the session id — so
--      "done" always has a round behind it that can be opened and read.
--
--   2. Assigning is not content management. `can_manage_learner_content`
--      deliberately counts a learner as able to manage their own decks; a
--      learner who could also set and edit their own homework would make the
--      list meaningless, so assignments use a stricter check.

create table if not exists public.assignments (
  id            uuid        primary key default gen_random_uuid(),
  learner_id    uuid        not null references public.learners (id) on delete cascade,
  created_by    uuid        references auth.users (id) on delete set null,

  -- What to do. `target_id` is the deck, spelling list, or typing lesson; null
  -- means the activity picks for itself, the way adaptive spelling does.
  subject       text        not null,
  activity      text        not null,
  target_id     text,
  size          int,

  -- What the learner reads on the card.
  title         text        not null,
  note          text,

  -- An optional bar to clear, measured on answers the app checked. A mode that
  -- checks nothing can never clear one, which is the honest result rather than
  -- a bug: see the constraint below.
  min_accuracy  int         check (min_accuracy is null or (min_accuracy between 1 and 100)),

  due_on        date,
  sort_order    int         not null default 0,

  -- State. Closed only by evidence.
  status        text        not null default 'open',
  completed_at  timestamptz,
  session_id    uuid        references public.sessions (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint assignments_status_check check (status in ('open', 'done', 'cancelled')),
  -- A done row without a session would be a claim rather than a record.
  constraint assignments_done_has_evidence check (
    status <> 'done' or (session_id is not null and completed_at is not null)
  )
);

create index if not exists assignments_learner_status_idx
  on public.assignments (learner_id, status, sort_order, created_at);

comment on table public.assignments is
  'Work set for a learner. Closed by the session that satisfied it, never by hand.';

drop trigger if exists assignments_touch on public.assignments;
create trigger assignments_touch
  before update on public.assignments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Who may set work
-- ---------------------------------------------------------------------------
-- Everyone linked to the learner can read the list — the child needs to see
-- their tasks. Setting, editing and removing them belongs to the grown-up who
-- owns the profile, or a guardian trusted with content. Deliberately *not*
-- `can_manage_learner_content`, which counts the learner themselves.

create or replace function public.can_assign_to_learner(p_learner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.learners l
    where l.id = p_learner
      and (
        l.owner_id = (select auth.uid())
        or exists (
          select 1 from public.guardian_links g
          where g.learner_id = l.id
            and g.guardian_id = (select auth.uid())
            and g.can_manage_content
        )
      )
  );
$$;

alter table public.assignments enable row level security;

drop policy if exists assignments_select on public.assignments;
drop policy if exists assignments_insert on public.assignments;
drop policy if exists assignments_update on public.assignments;
drop policy if exists assignments_delete on public.assignments;

create policy assignments_select on public.assignments
  for select to authenticated
  using (public.can_access_learner(learner_id));

create policy assignments_insert on public.assignments
  for insert to authenticated
  with check (public.can_assign_to_learner(learner_id));

create policy assignments_update on public.assignments
  for update to authenticated
  using (public.can_assign_to_learner(learner_id))
  with check (public.can_assign_to_learner(learner_id));

create policy assignments_delete on public.assignments
  for delete to authenticated
  using (public.can_assign_to_learner(learner_id));

grant select, insert, update, delete on public.assignments to authenticated;

-- ---------------------------------------------------------------------------
-- Closing a task
-- ---------------------------------------------------------------------------
-- Runs in the same transaction as the round that triggered it. Definer,
-- because the learner doing the work is exactly the person the update policy
-- keeps out — and the only way through here is to have actually played a
-- session that matches.
--
-- The score bar, when there is one, is read off the answers the app checked
-- rather than the headline: a round the learner graded themselves has no
-- checked answers, so it cannot clear a bar. That is the intended behaviour.

create or replace function public.complete_matching_assignments(
  p_learner_id uuid,
  p_session_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s       public.sessions%rowtype;
  checked numeric;
  closed  int;
begin
  if not public.can_access_learner(p_learner_id) then
    raise exception 'Not allowed to record work for that learner'
      using errcode = 'insufficient_privilege';
  end if;

  select * into s from public.sessions
   where id = p_session_id and learner_id = p_learner_id;
  if not found then
    return 0;
  end if;

  -- Accuracy over checked answers only. Null when nothing in the round was
  -- checked, which fails every comparison below and so clears no bar.
  checked := case
    when s.verified_items_total > 0
      then (s.verified_items_correct::numeric * 100) / s.verified_items_total
    else null
  end;

  with matched as (
    select a.id
      from public.assignments a
     where a.learner_id  = p_learner_id
       and a.status      = 'open'
       and a.subject     = s.subject
       and a.activity    = s.activity
       and (a.target_id is null or a.target_id is not distinct from s.list_id)
       and (a.min_accuracy is null or checked >= a.min_accuracy)
  )
  update public.assignments a
     set status       = 'done',
         completed_at = coalesce(s.ended_at, now()),
         session_id   = s.id
    from matched m
   where a.id = m.id;

  get diagnostics closed = row_count;
  return closed;
end;
$$;

grant execute on function public.can_assign_to_learner(uuid)                  to authenticated;
grant execute on function public.complete_matching_assignments(uuid, uuid)    to authenticated;

-- Erasing a learner's progress takes the sessions with it, so a task those
-- sessions closed has to go back to being open rather than claiming to be done
-- with nothing behind it.
--
-- This has to run *before* the delete, not after. The column's `on delete set
-- null` would otherwise leave the row saying 'done' with no session, which is
-- exactly what assignments_done_has_evidence forbids — so the constraint fires
-- first and the erase fails. Reopening the task ahead of time makes the FK
-- action a no-op and keeps the invariant true throughout.
create or replace function public.reopen_assignments_for_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.assignments
     set status = 'open', completed_at = null, session_id = null
   where session_id = old.id;
  return old;
end;
$$;

create index if not exists assignments_session_idx
  on public.assignments (session_id) where session_id is not null;

drop trigger if exists assignments_reopen_orphaned on public.sessions;
drop trigger if exists assignments_reopen_for_session on public.sessions;
create trigger assignments_reopen_for_session
  before delete on public.sessions
  for each row execute function public.reopen_assignments_for_session();
