-- ============================================================================
-- Cat Academy — say the grants out loud
--
-- Row Level Security decides *which rows* a caller may touch. It says nothing
-- about whether the role may touch the table at all — that is a plain GRANT,
-- and without it Postgres refuses before any policy is consulted:
--
--   permission denied for table skill_states
--
-- 0003 granted the four tables it created and left the rest to Supabase's
-- default privileges. That is a fragile thing to depend on: default privileges
-- only apply to objects created afterwards, by the role they were configured
-- for, so a table created by a different role or before the defaults were set
-- silently has none. The API runs every request-scoped query as `authenticated`,
-- so anything missed is a hard failure on the first read.
--
-- So this states every grant the application needs, in one place, idempotently.
--
-- Not granted, deliberately:
--   learner_credentials   PIN hashes; service_role and definer functions only
--   migration_flags       internal bookkeeping
--   schema_migrations     internal bookkeeping
-- ============================================================================

grant usage on schema public to authenticated;

-- Progress and content. The API reads and writes all of these on a learner's
-- behalf; RLS narrows each one to learners the caller is linked to.
grant select, insert, update, delete on public.skill_states   to authenticated;
grant select, insert, update, delete on public.sessions       to authenticated;
grant select, insert, update, delete on public.attempts       to authenticated;
grant select, insert, update, delete on public.item_mastery   to authenticated;
grant select, insert, update, delete on public.list_progress  to authenticated;
grant select, insert, update, delete on public.achievements   to authenticated;
grant select, insert, update, delete on public.daily_activity to authenticated;
grant select, insert, update, delete on public.high_scores    to authenticated;
grant select, insert, update, delete on public.word_lists     to authenticated;
grant select, insert, update, delete on public.decks          to authenticated;

-- Learners and the pairing tables. No insert on guardian_links or link_invites:
-- those are only ever written through the SECURITY DEFINER RPCs, which is what
-- keeps a short invite code from being enumerable.
grant select, insert, update, delete on public.learners       to authenticated;
grant select, update, delete         on public.guardian_links to authenticated;
grant select, delete                 on public.link_invites   to authenticated;

-- Profiles have no delete policy: an account is removed through auth, not by
-- deleting its profile row.
grant select, insert, update on public.profiles to authenticated;

grant select on public.v_subject_summary to authenticated;

-- `anon` is the pre-sign-in role. Since the API gateway landed the browser
-- never queries these tables directly, and every policy is written `to
-- authenticated`, so anon could not read a row anyway — this just makes that
-- true at the privilege layer as well as the policy layer.
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'skill_states', 'sessions', 'attempts', 'item_mastery',
    'list_progress', 'achievements', 'daily_activity', 'high_scores',
    'word_lists', 'decks', 'learners', 'guardian_links', 'link_invites'
  ] loop
    execute format('revoke all on public.%I from anon', t);
  end loop;
end;
$$;

-- Keep future tables from repeating this. Applies only to objects created by
-- the role running this migration, which is why the explicit grants above are
-- the actual fix and this is only insurance.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
