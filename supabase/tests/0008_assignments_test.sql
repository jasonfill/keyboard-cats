-- ============================================================================
-- Assignment tests (0008 and 0009).
--
-- A task list is only worth setting if the child cannot set or close their own
-- work, and shared work is only safe to sell to tutors if one family cannot
-- see or rewrite another's. These pin both:
--
--   * a grown-up sets work; the learner cannot set their own
--   * the learner can read their list, and cannot edit it
--   * nobody marks work done — a matching round closes it, and the row then
--     points at that round
--   * a score bar is judged on answers the app checked, so a self-graded round
--     cannot clear one
--   * one piece of work can be given to several learners, and each carries its
--     own state
--   * across families, a parent sees their own child's row and no other, and
--     cannot edit work whose author is someone else
--
-- Run against a scratch database with 0001-0009 applied:
--   psql -f supabase/tests/0008_assignments_test.sql
-- ============================================================================

\set ON_ERROR_STOP on

create or replace function pg_temp.become(p_user uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
end;
$$;

create or replace function pg_temp.check(p_label text, p_got anyelement, p_want anyelement)
returns void language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'FAIL % — expected %, got %', p_label, p_want, p_got;
  end if;
  raise notice 'pass: %', p_label;
end;
$$;

create or replace function pg_temp.check_denied(p_label text, p_sql text, p_match text default '')
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_match <> '' and position(lower(p_match) in lower(sqlerrm)) = 0 then
      raise exception 'FAIL % — denied, but for the wrong reason: %', p_label, sqlerrm;
    end if;
    raise notice 'pass: % (denied: %)', p_label, left(sqlerrm, 60);
    return;
  end;
  raise exception 'FAIL % — the statement was allowed and should not have been', p_label;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
reset role;
insert into auth.users (id, email) values
  ('ffffffff-0000-0000-0000-000000000001', 'assign-parent@example.com'),
  ('ffffffff-0000-0000-0000-000000000002', 'assign-teen@example.com'),
  ('ffffffff-0000-0000-0000-000000000003', 'other-parent@example.com')
on conflict (id) do nothing;

\set parent '''ffffffff-0000-0000-0000-000000000001'''
\set teen   '''ffffffff-0000-0000-0000-000000000002'''
\set other  '''ffffffff-0000-0000-0000-000000000003'''
\set kid    '''ffffffff-0000-0000-0000-00000000000a'''
\set kid2   '''ffffffff-0000-0000-0000-00000000000f'''
\set otherkid '''ffffffff-0000-0000-0000-000000000010'''
\set setid  '''ffffffff-0000-0000-0000-000000000011'''
\set task   '''ffffffff-0000-0000-0000-00000000000b'''
\set task2  '''ffffffff-0000-0000-0000-000000000012'''
\set barset '''ffffffff-0000-0000-0000-000000000013'''
\set bartask '''ffffffff-0000-0000-0000-00000000000c'''
\set round  '''ffffffff-0000-0000-0000-00000000000d'''
\set selfround '''ffffffff-0000-0000-0000-00000000000e'''

set role authenticated;
select pg_temp.become(:parent);

insert into public.learners (id, owner_id, auth_user_id, auth_kind, display_name, birth_year)
values (:kid::uuid, :parent::uuid, :teen::uuid, 'self', 'Assigned Kid',
        extract(year from current_date)::int - 14)
on conflict (id) do nothing;

insert into public.learners (id, owner_id, display_name, birth_year)
values (:kid2::uuid, :parent::uuid, 'Second Kid', extract(year from current_date)::int - 9)
on conflict (id) do nothing;

select pg_temp.become(:other);
insert into public.learners (id, owner_id, display_name, birth_year)
values (:otherkid::uuid, :other::uuid, 'Another Family Kid',
        extract(year from current_date)::int - 10)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- One piece of work, several learners
-- ---------------------------------------------------------------------------
select pg_temp.become(:parent);

insert into public.assignment_sets (id, created_by, subject, activity, target_id, title)
values (:setid::uuid, :parent::uuid, 'quiz', 'learn', 'starter-body',
        'Learn the body systems deck');

insert into public.assignments (id, set_id, learner_id) values
  (:task::uuid,  :setid::uuid, :kid::uuid),
  (:task2::uuid, :setid::uuid, :kid2::uuid);

select pg_temp.check('one set can be given to two learners',
  (select count(*)::int from public.assignments where set_id = :setid::uuid), 2);

select pg_temp.check_denied('the same work cannot be given to a learner twice',
  'insert into public.assignments (set_id, learner_id) values ('
    || quote_literal(:setid) || '::uuid, ' || quote_literal(:kid) || '::uuid)',
  'assignments_set_learner_idx');

select pg_temp.check('a grown-up can set work',
  (select count(*)::int from public.assignments where learner_id = :kid::uuid), 1);

select pg_temp.become(:teen);

select pg_temp.check('the learner can read their own task list',
  (select count(*)::int from public.assignments where learner_id = :kid::uuid), 1);

select pg_temp.check_denied('the learner cannot give themselves work',
  'insert into public.assignments (set_id, learner_id) values ('
    || quote_literal(:barset) || '::uuid, ' || quote_literal(:kid) || '::uuid)',
  'row-level security');

-- An UPDATE or DELETE that fails the policy's USING clause does not raise: the
-- row is simply not visible to the statement, so it changes nothing and reports
-- success. That is Postgres working as designed, and it means the assertion
-- worth making is about the row rather than about an error.
update public.assignments set sort_order = 99 where learner_id = :kid::uuid;
select pg_temp.check('a learner editing their task changes nothing',
  (select sort_order from public.assignments where id = :task::uuid), 0);

delete from public.assignments where learner_id = :kid::uuid;
select pg_temp.check('a learner deleting a task removes nothing',
  (select count(*)::int from public.assignments where learner_id = :kid::uuid), 1);

update public.assignment_sets set title = 'Something easier' where id = :setid::uuid;
select pg_temp.check('a learner cannot rewrite the work itself',
  (select title from public.assignment_sets where id = :setid::uuid),
  'Learn the body systems deck');

-- The one that matters most: a learner cannot declare the work finished.
update public.assignments set status = 'done' where learner_id = :kid::uuid;
select pg_temp.check('a learner cannot mark their own work done',
  (select status from public.assignments where id = :task::uuid), 'open');

-- ---------------------------------------------------------------------------
-- Doing the work closes the task
-- ---------------------------------------------------------------------------
-- A round that matches subject, activity and target. The learner records it
-- themselves, exactly as the app does.
insert into public.sessions
  (id, learner_id, subject, activity, list_id, items_total, items_correct, accuracy,
   evidence, verified_items_total, verified_items_correct, ended_at)
values (:round::uuid, :kid::uuid, 'quiz', 'learn', 'starter-body', 10, 9, 90,
        'attempts', 10, 9, now());

select pg_temp.check('playing a matching round closes the task',
  public.complete_matching_assignments(:kid::uuid, :round::uuid), 1);

select pg_temp.check('the task is done',
  (select status from public.assignments where id = :task::uuid), 'done');
select pg_temp.check('and points at the round that closed it',
  (select session_id from public.assignments where id = :task::uuid), :round::uuid);

-- A second round does not re-close what is already closed.
select pg_temp.check('a closed task is not closed twice',
  public.complete_matching_assignments(:kid::uuid, :round::uuid), 0);

-- A learner sees their own row on shared work and not a sibling's, so the
-- sibling's state has to be read as the grown-up.
select pg_temp.check('a learner cannot see a sibling''s copy of the same work',
  (select count(*)::int from public.assignments where id = :task2::uuid), 0);

-- Shared work, separate states: one child doing it leaves the other's to do.
select pg_temp.become(:parent);
select pg_temp.check('the other learner''s copy of the same work stays open',
  (select status from public.assignments where id = :task2::uuid), 'open');
select pg_temp.become(:teen);

-- ---------------------------------------------------------------------------
-- A score bar is judged on checked answers
-- ---------------------------------------------------------------------------
select pg_temp.become(:parent);
insert into public.assignment_sets (id, created_by, subject, activity, target_id, title, min_accuracy)
values (:barset::uuid, :parent::uuid, 'quiz', 'flashcards', 'starter-space',
        'Flashcards, 80% or better', 80);
insert into public.assignments (id, set_id, learner_id)
values (:bartask::uuid, :barset::uuid, :kid::uuid);

select pg_temp.become(:teen);

-- A flashcards round: the headline looks like a pass, but nothing was checked.
insert into public.sessions
  (id, learner_id, subject, activity, list_id, items_total, items_correct, accuracy,
   evidence, verified_items_total, verified_items_correct, ended_at)
values (:selfround::uuid, :kid::uuid, 'quiz', 'flashcards', 'starter-space', 10, 10, 100,
        'attempts', 0, 0, now());

select pg_temp.check('a self-graded round cannot clear a score bar',
  public.complete_matching_assignments(:kid::uuid, :selfround::uuid), 0);
select pg_temp.check('so the task stays open',
  (select status from public.assignments where id = :bartask::uuid), 'open');

-- ---------------------------------------------------------------------------
-- Erasing progress reopens what those rounds closed
-- ---------------------------------------------------------------------------
select pg_temp.become(:parent);
select public.erase_learner_progress(:kid::uuid);

select pg_temp.check('erasing progress reopens the task it had closed',
  (select status from public.assignments where id = :task::uuid), 'open');
select pg_temp.check('and leaves no task pointing at a round that is gone',
  (select count(*)::int from public.assignments
    where status = 'done' and session_id is null), 0);

-- ---------------------------------------------------------------------------
-- Across families: the tutor case
-- ---------------------------------------------------------------------------
-- One set given to two children in different families. This is the shape a
-- tutor produces, and it is the one where a leak would matter most.
select pg_temp.become(:parent);

\set shared '''ffffffff-0000-0000-0000-000000000020'''
insert into public.assignment_sets (id, created_by, subject, activity, target_id, title)
values (:shared::uuid, :parent::uuid, 'spelling', 'listen-spell', 'g2-digraphs',
        'Digraphs, everyone');
insert into public.assignments (set_id, learner_id) values (:shared::uuid, :kid::uuid);

-- The other family's parent adds their own child to the same work. They may do
-- that: the check is on the learner they are adding, which is theirs.
select pg_temp.become(:other);
insert into public.assignments (set_id, learner_id) values (:shared::uuid, :otherkid::uuid);

select pg_temp.check('a second family can join their child to shared work',
  (select count(*)::int from public.assignments
     where set_id = :shared::uuid and learner_id = :otherkid::uuid), 1);

-- ...and sees only their own child on it.
select pg_temp.check('a parent sees only their own child on shared work',
  (select count(*)::int from public.assignments where set_id = :shared::uuid), 1);

select pg_temp.check('while the author sees the work itself',
  (select count(*)::int from public.assignment_sets where id = :shared::uuid), 1);

-- Editing belongs to whoever wrote it. Otherwise one parent could rewrite what
-- another family's child is looking at.
update public.assignment_sets set title = 'Hijacked' where id = :shared::uuid;
select pg_temp.check('another family cannot rewrite work they did not write',
  (select title from public.assignment_sets where id = :shared::uuid), 'Digraphs, everyone');

delete from public.assignment_sets where id = :shared::uuid;
select pg_temp.become(:parent);
select pg_temp.check('nor delete it',
  (select count(*)::int from public.assignment_sets where id = :shared::uuid), 1);

-- Authoring the work does not grant sight of other people's children: the
-- author sees the rows for learners they are linked to, and no others. A tutor
-- sees all of their students because they are linked to all of them.
select pg_temp.check('the author sees only the learners they are linked to',
  (select count(*)::int from public.assignments where set_id = :shared::uuid), 1);

-- A stranger with no link to anyone on it sees nothing at all.
select pg_temp.become('00000000-0000-0000-0000-0000000000ff');
select pg_temp.check('a stranger cannot see shared work',
  (select count(*)::int from public.assignment_sets where id = :shared::uuid), 0);

reset role;
\echo '--- all assignment tests passed ---'
