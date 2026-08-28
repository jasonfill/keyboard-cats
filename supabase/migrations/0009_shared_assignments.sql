-- ---------------------------------------------------------------------------
-- One piece of work, many learners
-- ---------------------------------------------------------------------------
-- 0008 tied each task to a single learner, so setting the same work for three
-- children meant three unrelated rows: no way to edit them together, and no way
-- to ask the question a tutor actually asks — "who has done this yet?"
--
-- So the work and the doing of it separate:
--
--   assignment_sets  — what the work is. Defined once.
--   assignments      — one row per learner, carrying only their state.
--
-- The visibility rules fall out of that split, which matters most for a tutor
-- whose students are in different families:
--
--   * a set is readable by its creator and by anyone linked to a learner it
--     was given to — that is the work's text, and they need it;
--   * a set is editable only by its creator, so a parent in one family cannot
--     rewrite what a child in another family is looking at;
--   * the per-learner rows keep 0008's rule, so a parent sees their own child's
--     row and never learns who else the work was set for.

create table if not exists public.assignment_sets (
  id            uuid        primary key default gen_random_uuid(),
  created_by    uuid        references auth.users (id) on delete set null,

  subject       text        not null,
  activity      text        not null,
  target_id     text,
  size          int,

  title         text        not null,
  note          text,
  min_accuracy  int         check (min_accuracy is null or (min_accuracy between 1 and 100)),
  due_on        date,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.assignment_sets is
  'A piece of work, defined once and given to one or more learners.';

drop trigger if exists assignment_sets_touch on public.assignment_sets;
create trigger assignment_sets_touch
  before update on public.assignment_sets
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Move the definition off the per-learner rows
-- ---------------------------------------------------------------------------

alter table public.assignments
  add column if not exists set_id uuid references public.assignment_sets (id) on delete cascade;

-- Backfill: every task written under 0008 becomes a set of one. Guarded so a
-- second run does not mint a second set for the same row.
do $$
declare
  a record;
  new_set uuid;
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assignments' and column_name = 'title'
  ) then
    return; -- already migrated
  end if;

  for a in select * from public.assignments where set_id is null loop
    insert into public.assignment_sets
      (created_by, subject, activity, target_id, size, title, note, min_accuracy,
       due_on, created_at)
    values
      (a.created_by, a.subject, a.activity, a.target_id, a.size, a.title, a.note,
       a.min_accuracy, a.due_on, a.created_at)
    returning id into new_set;

    update public.assignments set set_id = new_set where id = a.id;
  end loop;
end;
$$;

alter table public.assignments
  drop column if exists subject,
  drop column if exists activity,
  drop column if exists target_id,
  drop column if exists size,
  drop column if exists title,
  drop column if exists note,
  drop column if exists min_accuracy,
  drop column if exists due_on,
  drop column if exists created_by;

alter table public.assignments alter column set_id set not null;

-- The same work is never given to the same learner twice; assigning again is
-- the same task, not a second one.
create unique index if not exists assignments_set_learner_idx
  on public.assignments (set_id, learner_id);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.assignment_sets enable row level security;

drop policy if exists assignment_sets_select on public.assignment_sets;
drop policy if exists assignment_sets_insert on public.assignment_sets;
drop policy if exists assignment_sets_update on public.assignment_sets;
drop policy if exists assignment_sets_delete on public.assignment_sets;

-- Readable by the person who wrote it, and by anyone who can see a learner it
-- was given to.
create policy assignment_sets_select on public.assignment_sets
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or exists (
      select 1 from public.assignments a
      where a.set_id = assignment_sets.id
        and public.can_access_learner(a.learner_id)
    )
  );

-- Anyone with an account may write one down; it does nothing until it is given
-- to a learner, and that step is where the real check happens.
create policy assignment_sets_insert on public.assignment_sets
  for insert to authenticated
  with check (created_by = (select auth.uid()));

-- Editing and removing stay with the author. A set can span families, and one
-- parent must not be able to rewrite work another family's child is looking at.
create policy assignment_sets_update on public.assignment_sets
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

create policy assignment_sets_delete on public.assignment_sets
  for delete to authenticated
  using (created_by = (select auth.uid()));

grant select, insert, update, delete on public.assignment_sets to authenticated;

-- ---------------------------------------------------------------------------
-- Closing a task, now that the work lives elsewhere
-- ---------------------------------------------------------------------------
-- Same rule as 0008, reading the definition through the set: a round closes a
-- task when it matches the work, and a score bar is judged on answers the app
-- checked, so a self-graded round can never clear one.

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

  checked := case
    when s.verified_items_total > 0
      then (s.verified_items_correct::numeric * 100) / s.verified_items_total
    else null
  end;

  with matched as (
    select a.id
      from public.assignments a
      join public.assignment_sets t on t.id = a.set_id
     where a.learner_id  = p_learner_id
       and a.status      = 'open'
       and t.subject     = s.subject
       and t.activity    = s.activity
       and (t.target_id is null or t.target_id is not distinct from s.list_id)
       and (t.min_accuracy is null or checked >= t.min_accuracy)
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

grant execute on function public.complete_matching_assignments(uuid, uuid) to authenticated;
