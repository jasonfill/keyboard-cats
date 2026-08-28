-- ---------------------------------------------------------------------------
-- A library: content that belongs to a grown-up
-- ---------------------------------------------------------------------------
-- Decks and word lists have belonged to a *learner* since 0003, which was right
-- when the only author was a child making their own flashcards. It does not
-- survive contact with a tutor: their material ends up filed under whichever
-- student they happened to be looking at, and reusing it across students means
-- copying it. There is no place that answers "what have I made?"
--
-- So content gets a second possible owner. Every deck and list belongs to
-- exactly one of:
--
--   * a learner — their own material, exactly as before; or
--   * a grown-up — their library, reusable across every learner they work with.
--
-- The third rule is what makes a library worth having: a learner can read
-- library content that has been *assigned* to them. Without it a tutor could
-- set work their student was not allowed to open.

alter table public.decks
  add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;
alter table public.word_lists
  add column if not exists owner_user_id uuid references auth.users (id) on delete cascade;

alter table public.decks      alter column learner_id drop not null;
alter table public.word_lists alter column learner_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'decks_one_owner') then
    alter table public.decks add constraint decks_one_owner
      check ((learner_id is null) <> (owner_user_id is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'word_lists_one_owner') then
    alter table public.word_lists add constraint word_lists_one_owner
      check ((learner_id is null) <> (owner_user_id is null));
  end if;
end;
$$;

create index if not exists decks_owner_idx      on public.decks (owner_user_id, updated_at desc)
  where owner_user_id is not null;
create index if not exists word_lists_owner_idx on public.word_lists (owner_user_id, updated_at desc)
  where owner_user_id is not null;

comment on column public.decks.owner_user_id is
  'Set when the deck lives in a grown-up''s library rather than belonging to one learner. Exactly one of this and learner_id is set.';

-- ---------------------------------------------------------------------------
-- Reading library content that was set as work
-- ---------------------------------------------------------------------------
-- An assignment names its target by id, so this asks the plain question: is
-- this deck (or list) set as work for anybody I am allowed to see? A student
-- gets their tutor's deck because it was assigned to them, and their parent
-- can see it too — and neither gets anything else from that tutor's library.

create or replace function public.content_assigned_to_visible_learner(
  p_subject   text,
  p_target_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.assignment_sets t
      join public.assignments a on a.set_id = t.id
     where t.subject   = p_subject
       and t.target_id = p_target_id::text
       and public.can_access_learner(a.learner_id)
  );
$$;

grant execute on function public.content_assigned_to_visible_learner(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Three ways to see a piece of content, and only one way to change it: it is
-- yours. A learner's own material stays editable by the grown-ups linked to
-- them, exactly as before; library content is the author's alone, so a family
-- cannot rewrite a tutor's deck out from under their other students.

do $$
declare
  t text;
  subject_of text;
begin
  foreach t in array array['word_lists', 'decks'] loop
    subject_of := case when t = 'decks' then 'quiz' else 'spelling' end;

    execute format('drop policy if exists %I on public.%I', t || '_select_linked', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_linked', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_linked', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_linked', t);

    execute format($f$
      create policy %I on public.%I for select to authenticated using (
        (learner_id is not null and public.can_access_learner(learner_id))
        or owner_user_id = (select auth.uid())
        or (owner_user_id is not null
            and public.content_assigned_to_visible_learner(%L, id))
      )$f$, t || '_select_linked', t, subject_of);

    execute format($f$
      create policy %I on public.%I for insert to authenticated with check (
        (learner_id is not null and public.can_manage_learner_content(learner_id))
        or owner_user_id = (select auth.uid())
      )$f$, t || '_insert_linked', t);

    execute format($f$
      create policy %I on public.%I for update to authenticated using (
        (learner_id is not null and public.can_manage_learner_content(learner_id))
        or owner_user_id = (select auth.uid())
      ) with check (
        (learner_id is not null and public.can_manage_learner_content(learner_id))
        or owner_user_id = (select auth.uid())
      )$f$, t || '_update_linked', t);

    execute format($f$
      create policy %I on public.%I for delete to authenticated using (
        (learner_id is not null and public.can_manage_learner_content(learner_id))
        or owner_user_id = (select auth.uid())
      )$f$, t || '_delete_linked', t);
  end loop;
end;
$$;
