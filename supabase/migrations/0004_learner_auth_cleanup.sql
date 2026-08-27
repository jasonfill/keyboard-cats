-- @applied-if: select exists (select 1 from pg_trigger where tgname = 'learners_clear_auth_kind_trigger')
-- ============================================================================
-- Cat Academy — let an auth user actually be deleted
--
-- 0003 gave `learners` two rules that quietly contradict each other:
--
--   auth_user_id uuid unique references auth.users (id) on delete set null
--
--   constraint learners_auth_kind_consistent check (
--     (auth_kind = 'none' and auth_user_id is null)
--     or (auth_kind <> 'none' and auth_user_id is not null)
--   )
--
-- Deleting an auth user nulls `auth_user_id` by cascade, but leaves `auth_kind`
-- saying 'self' or 'provisioned' — which the constraint rejects, so the delete
-- fails. The symptom is a failure a long way from the cause: removing an account
-- from the Supabase dashboard errors with a check-constraint violation naming a
-- table nobody was touching.
--
-- The invariant is worth keeping; it is the cascade that needs to respect it.
-- So normalise the row on the way through.
--
-- Deliberately *not* fixed by cascading the learner away instead: a provisioned
-- child's sign-in being deleted must not delete the child's record. The learner
-- belongs to the parent and their progress outlives any credential.
-- ============================================================================

create or replace function public.learners_clear_auth_kind()
returns trigger
language plpgsql
as $$
begin
  -- Fires for the FK's SET NULL as well as for ordinary updates.
  if new.auth_user_id is null and new.auth_kind <> 'none' then
    new.auth_kind := 'none';
  end if;
  return new;
end;
$$;

-- Name matters: triggers on the same event fire in alphabetical order, and this
-- has to run before learners_guard_trigger so the guard sees a coherent row.
drop trigger if exists learners_clear_auth_kind_trigger on public.learners;
create trigger learners_clear_auth_kind_trigger
  before update on public.learners
  for each row execute function public.learners_clear_auth_kind();

-- Repair anything already in this state. Nothing should be, since the
-- constraint has been preventing exactly this, but a database that was patched
-- by hand might be.
update public.learners
   set auth_kind = 'none'
 where auth_user_id is null
   and auth_kind <> 'none';
