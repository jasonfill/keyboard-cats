-- @applied-if: select to_regclass('public.learners') is not null
-- ============================================================================
-- Cat Academy — the learner inversion
--
-- Before this migration a "learner" *was* an auth user: every progress row
-- pointed at auth.users and a child needed their own email address to have any
-- progress at all. That is the wrong shape for a children's app — collecting an
-- email from an under-13 puts the whole product inside COPPA's consent regime.
--
-- After this migration the learner is a profile owned by an adult, and an auth
-- identity is an *optional* attachment to it:
--
--   auth_kind = 'none'         no sign-in; the child plays on a grown-up's
--                              signed-in device via the profile switcher.
--   auth_kind = 'provisioned'  a parent-minted credential (synthetic address +
--                              PIN) so the child can use their own tablet. No
--                              personal information is collected from the child.
--   auth_kind = 'self'         the learner's own email or Google account. Gated
--                              on age 13+, enforced in the database, not the UI.
--
-- The backfill deliberately reuses each existing profile's UUID as its learner
-- id. That makes every existing user_id value already valid as a learner_id, so
-- converting ten tables is a column rename and a foreign-key swap rather than a
-- data rewrite. Nothing is copied, so nothing can be lost in the copying.
--
-- Safe to re-run: every step checks for its own prior effect.
-- ============================================================================

-- The view reads columns this migration renames. Drop it up front and rebuild
-- it at the bottom rather than leaving a view whose output column is named
-- user_id but whose source column is learner_id.
drop view if exists public.v_subject_summary;

-- ---------------------------------------------------------------------------
-- Learners
-- ---------------------------------------------------------------------------
create table if not exists public.learners (
  id             uuid primary key default gen_random_uuid(),
  -- The adult who created this learner and is accountable for it. Deleting the
  -- owner deletes the learner and, by cascade, all of their progress.
  owner_id       uuid        not null references auth.users (id) on delete cascade,
  display_name   text        not null,
  avatar_emoji   text        not null default '🐱',
  grade_hint     int,
  birth_year     int,
  -- Optional auth identity. Unique: one auth user is at most one learner.
  auth_user_id   uuid        unique references auth.users (id) on delete set null,
  auth_kind      text        not null default 'none',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint learners_name_len check (char_length(display_name) between 1 and 40),
  constraint learners_grade_hint_check check (grade_hint is null or grade_hint between 0 and 12),
  constraint learners_birth_year_check check (birth_year is null or birth_year between 1900 and 2100),
  constraint learners_auth_kind_check check (auth_kind in ('none', 'provisioned', 'self')),
  -- auth_kind and auth_user_id cannot disagree about whether a login exists.
  constraint learners_auth_kind_consistent check (
    (auth_kind = 'none' and auth_user_id is null)
    or (auth_kind <> 'none' and auth_user_id is not null)
  )
);

comment on table public.learners is
  'One row per learner. Owned by an adult auth user; an auth identity of its own is optional.';
comment on column public.learners.auth_kind is
  'none | provisioned | self. ''self'' requires the learner to be 13+ (enforced by trigger).';

create index if not exists learners_owner_idx on public.learners (owner_id, created_at);

-- ---------------------------------------------------------------------------
-- Guardians: many adults may watch many learners
-- ---------------------------------------------------------------------------
create table if not exists public.guardian_links (
  guardian_id        uuid        not null references auth.users (id) on delete cascade,
  learner_id         uuid        not null references public.learners (id) on delete cascade,
  role               text        not null default 'parent',
  can_manage_content boolean     not null default true,
  created_at         timestamptz not null default now(),
  primary key (guardian_id, learner_id),
  constraint guardian_links_role_check check (role in ('parent', 'teacher'))
);

create index if not exists guardian_links_learner_idx on public.guardian_links (learner_id);

-- ---------------------------------------------------------------------------
-- Pairing invites. A learner's owner mints a short code; another adult redeems
-- it. Redemption goes through an RPC because a redeemer cannot — and must not —
-- be able to read this table.
-- ---------------------------------------------------------------------------
create table if not exists public.link_invites (
  code        text        primary key,
  learner_id  uuid        not null references public.learners (id) on delete cascade,
  created_by  uuid        not null references auth.users (id) on delete cascade,
  role        text        not null default 'parent',
  expires_at  timestamptz not null default now() + interval '24 hours',
  redeemed_at timestamptz,
  redeemed_by uuid references auth.users (id) on delete set null,
  constraint link_invites_role_check check (role in ('parent', 'teacher'))
);

create index if not exists link_invites_learner_idx on public.link_invites (learner_id);

-- ---------------------------------------------------------------------------
-- Backfill: every existing profile becomes a self-owned adult learner, keeping
-- its UUID so the progress tables below need no data migration at all.
-- ---------------------------------------------------------------------------
-- Internal bookkeeping so one-shot steps stay one-shot. RLS on with no
-- policies: nothing in a browser has any business reading it.
create table if not exists public.migration_flags (
  flag       text primary key,
  applied_at timestamptz not null default now()
);
alter table public.migration_flags enable row level security;
revoke all on public.migration_flags from anon, authenticated;

-- The backfill runs exactly once, ever. It must not run a second time: after
-- the inversion a new adult signup is a *parent*, who creates learners
-- explicitly, so re-running this later would silently turn every parent into a
-- learner of their own.
do $$
begin
  if exists (select 1 from public.migration_flags where flag = '0003_backfill') then
    raise notice '0003 backfill already applied, skipping';
    return;
  end if;

  insert into public.learners (id, owner_id, auth_user_id, auth_kind, display_name, avatar_emoji, grade_hint, created_at)
  select p.id,
         p.id,
         p.id,
         'self',
         coalesce(nullif(btrim(p.display_name), ''), 'Learner'),
         p.avatar_emoji,
         p.grade_hint,
         p.created_at
  from public.profiles p
  where not exists (
    select 1 from public.learners l
    where l.id = p.id or l.auth_user_id = p.id
  );

  insert into public.migration_flags (flag) values ('0003_backfill');
end;
$$;

-- ---------------------------------------------------------------------------
-- Repoint every progress table from auth.users to learners.
-- ---------------------------------------------------------------------------
do $$
declare
  t  text;
  fk record;
  tables constant text[] := array[
    'skill_states', 'sessions', 'attempts', 'item_mastery', 'list_progress',
    'achievements', 'daily_activity', 'high_scores', 'word_lists', 'decks'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      continue;
    end if;

    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t and column_name = 'user_id'
    ) then
      execute format('alter table public.%I rename column user_id to learner_id', t);
    end if;

    -- Drop the single-column FK on learner_id that still points at auth.users.
    -- Scoped to that one column so the created_by FK added below survives a
    -- second run of this migration.
    for fk in
      select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = 'public'
        and rel.relname = t
        and con.contype = 'f'
        and con.confrelid = 'auth.users'::regclass
        and array_length(con.conkey, 1) = 1
        and (select a.attname from pg_attribute a
             where a.attrelid = con.conrelid and a.attnum = con.conkey[1]) = 'learner_id'
    loop
      execute format('alter table public.%I drop constraint %I', t, fk.conname);
    end loop;

    if not exists (
      select 1
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
      where ns.nspname = 'public'
        and rel.relname = t
        and con.contype = 'f'
        and con.confrelid = 'public.learners'::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (learner_id) references public.learners (id) on delete cascade',
        t, t || '_learner_id_fkey');
    end if;
  end loop;
end;
$$;

-- Content tables record who authored the row, so the UI can say "added by Dad"
-- while the row itself still belongs to the child.
alter table public.decks      add column if not exists created_by uuid references auth.users (id) on delete set null;
alter table public.word_lists add column if not exists created_by uuid references auth.users (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Provisioned credentials. Its own table because RLS is row-level: a pin_hash
-- column on `learners` would still be readable by anyone allowed to read the
-- learner row. This table has RLS on and *no policies at all*, so it is
-- invisible to every browser session; only SECURITY DEFINER functions and the
-- service role can touch it.
-- ---------------------------------------------------------------------------
create table if not exists public.learner_credentials (
  learner_id   uuid        primary key references public.learners (id) on delete cascade,
  login_code   text        not null unique,
  pin_hash     text        not null,
  auth_user_id uuid        not null references auth.users (id) on delete cascade,
  updated_at   timestamptz not null default now(),
  constraint learner_credentials_code_len check (char_length(login_code) between 6 and 24)
);

alter table public.learner_credentials enable row level security;

-- Invites serve two purposes: pairing another adult, and handing a 13+ learner
-- the right to attach their own Google/email account.
alter table public.link_invites add column if not exists purpose text not null default 'guardian';
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'link_invites_purpose_check'
  ) then
    alter table public.link_invites
      add constraint link_invites_purpose_check check (purpose in ('guardian', 'self_login'));
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

-- The age gate, plus column immutability for anyone who is not the owner.
-- SECURITY DEFINER only so it can read the setting; the checks themselves are
-- all on the row.
create or replace function public.learners_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor    uuid := auth.uid();
  bypass   boolean := coalesce(current_setting('app.learner_guard', true), 'on') = 'off';
  age_now  int;
begin
  -- The gate. A learner using their *own* external identity must be 13+. An
  -- adult whose learner row is self-owned (every pre-inversion account) is not
  -- a child and is exempt. Deliberately enforced here rather than in the UI:
  -- this is the check that keeps the product out of COPPA's consent regime.
  if new.auth_kind = 'self' and new.auth_user_id is distinct from new.owner_id then
    if new.birth_year is null then
      raise exception 'A birth year is required before a learner can use their own sign-in'
        using errcode = 'check_violation';
    end if;
    age_now := extract(year from current_date)::int - new.birth_year;
    if age_now < 13 then
      raise exception 'A learner must be 13 or older to sign in with their own account'
        using errcode = 'check_violation';
    end if;
  end if;

  -- Everything that decides who controls the account is owner-only. The learner
  -- and content guardians may still edit display name, avatar and grade.
  if tg_op = 'UPDATE' and not bypass and actor is not null and actor <> old.owner_id then
    if new.owner_id     is distinct from old.owner_id
       or new.auth_kind    is distinct from old.auth_kind
       or new.auth_user_id is distinct from old.auth_user_id
       or new.birth_year   is distinct from old.birth_year then
      raise exception 'Only the owner may change a learner''s ownership, sign-in, or birth year'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists learners_guard_trigger on public.learners;
create trigger learners_guard_trigger
  before insert or update on public.learners
  for each row execute function public.learners_guard();

drop trigger if exists learners_touch on public.learners;
create trigger learners_touch before update on public.learners
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so they can be called from inside policies
-- on other tables without dragging those tables' RLS in behind them.
-- ---------------------------------------------------------------------------

-- These two exist to break a mutual recursion: a policy on `learners` that
-- reads `guardian_links` directly would trigger that table's policy, which in
-- turn reads `learners`, and Postgres refuses the cycle. Going through
-- SECURITY DEFINER reads the other side with RLS bypassed, so each table's
-- policy stays a plain predicate.
create or replace function public.is_guardian_of_learner(p_learner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guardian_links g
    where g.learner_id = p_learner and g.guardian_id = (select auth.uid())
  );
$$;

create or replace function public.owns_learner(p_learner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.learners l
    where l.id = p_learner and l.owner_id = (select auth.uid())
  );
$$;

-- Read and record progress: the owner, the learner themselves, or any guardian.
create or replace function public.can_access_learner(p_learner uuid)
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
        or l.auth_user_id = (select auth.uid())
        or exists (
          select 1 from public.guardian_links g
          where g.learner_id = l.id and g.guardian_id = (select auth.uid())
        )
      )
  );
$$;

-- Create or edit decks and word lists: the same set, minus guardians who were
-- linked as read-only.
create or replace function public.can_manage_learner_content(p_learner uuid)
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
        or l.auth_user_id = (select auth.uid())
        or exists (
          select 1 from public.guardian_links g
          where g.learner_id = l.id
            and g.guardian_id = (select auth.uid())
            and g.can_manage_content
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Pairing RPCs
-- ---------------------------------------------------------------------------

-- Short, unambiguous, and generated from a CSPRNG: no 0/O/1/I to misread aloud
-- over a kitchen table, which is where these codes actually get used.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes    bytea := gen_random_bytes(8);
  code     text := '';
  i        int;
begin
  for i in 0..7 loop
    code := code || substr(alphabet, 1 + (get_byte(bytes, i) % length(alphabet)), 1);
  end loop;
  return code;
end;
$$;

-- Mint an invite. Owner-only, because handing out access to a child's record is
-- exactly the decision that should sit with the adult who created it.
create or replace function public.mint_link_invite(
  p_learner_id uuid,
  p_role       text default 'parent',
  p_purpose    text default 'guardian',
  p_ttl        interval default interval '24 hours'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  -- v_ prefix on purpose: a variable named `code` is ambiguous against
  -- link_invites.code and plpgsql refuses to guess.
  v_code  text;
  v_tries int := 0;
begin
  if not exists (
    select 1 from public.learners l
    where l.id = p_learner_id and l.owner_id = auth.uid()
  ) then
    raise exception 'Only the owner of a learner may create an invite'
      using errcode = 'insufficient_privilege';
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := public.generate_invite_code();
    exit when not exists (select 1 from public.link_invites i where i.code = v_code);
    if v_tries > 10 then
      raise exception 'Could not allocate an invite code';
    end if;
  end loop;

  insert into public.link_invites (code, learner_id, created_by, role, purpose, expires_at)
  values (v_code, p_learner_id, auth.uid(), p_role, p_purpose, now() + p_ttl);

  return v_code;
end;
$$;

-- Redeem an invite. This is an RPC rather than a client-side select-then-insert
-- because the redeemer must never be able to read link_invites: with read access
-- a short code becomes enumerable.
create or replace function public.redeem_link_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.link_invites;
begin
  if auth.uid() is null then
    raise exception 'Sign in before redeeming an invite' using errcode = 'insufficient_privilege';
  end if;

  select * into inv
  from public.link_invites
  where code = upper(btrim(p_code))
  for update;

  if not found or inv.redeemed_at is not null or inv.expires_at <= now() then
    -- One message for all three cases: a redeemer should not learn whether a
    -- code exists, only that this one did not work.
    raise exception 'That code is not valid any more' using errcode = 'check_violation';
  end if;

  if inv.purpose = 'guardian' then
    insert into public.guardian_links (guardian_id, learner_id, role)
    values (auth.uid(), inv.learner_id, inv.role)
    on conflict (guardian_id, learner_id) do nothing;
  else
    -- Attaching the learner's own identity. The age gate in learners_guard()
    -- still runs and will reject an under-13.
    perform set_config('app.learner_guard', 'off', true);
    update public.learners
       set auth_user_id = auth.uid(),
           auth_kind    = 'self'
     where id = inv.learner_id;
    perform set_config('app.learner_guard', 'on', true);
  end if;

  update public.link_invites
     set redeemed_at = now(), redeemed_by = auth.uid()
   where code = inv.code;

  return inv.learner_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Provisioned sign-in. Both of these are service-role only: they are called by
-- an Edge Function that owns the admin API, never by a browser.
-- ---------------------------------------------------------------------------
create or replace function public.attach_provisioned_login(
  p_learner_id   uuid,
  p_auth_user_id uuid,
  p_login_code   text,
  p_pin          text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform set_config('app.learner_guard', 'off', true);

  update public.learners
     set auth_user_id = p_auth_user_id,
         auth_kind    = 'provisioned'
   where id = p_learner_id;

  if not found then
    raise exception 'No such learner';
  end if;

  insert into public.learner_credentials (learner_id, login_code, pin_hash, auth_user_id)
  values (p_learner_id, upper(btrim(p_login_code)),
          crypt(p_pin, gen_salt('bf')), p_auth_user_id)
  on conflict (learner_id) do update
    set login_code   = excluded.login_code,
        pin_hash     = excluded.pin_hash,
        auth_user_id = excluded.auth_user_id,
        updated_at   = now();

  perform set_config('app.learner_guard', 'on', true);
end;
$$;

-- Returns the auth user to mint a session for, or null. Constant-ish work on
-- the miss path so a wrong code and a wrong PIN are not trivially separable.
create or replace function public.authenticate_learner(p_login_code text, p_pin text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cred public.learner_credentials;
begin
  select * into cred
  from public.learner_credentials
  where login_code = upper(btrim(p_login_code));

  if not found then
    perform crypt(p_pin, gen_salt('bf'));
    return null;
  end if;

  if cred.pin_hash = crypt(p_pin, cred.pin_hash) then
    return cred.auth_user_id;
  end if;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Progress RPCs, now addressed by learner rather than by the caller's identity.
-- ---------------------------------------------------------------------------
drop function if exists public.bump_daily_activity(text, int, int, int);
drop function if exists public.rebuild_item_mastery(text);

create or replace function public.bump_daily_activity(
  p_learner_id uuid,
  p_subject    text,
  p_seconds    int,
  p_items      int,
  p_correct    int
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.can_access_learner(p_learner_id) then
    raise exception 'Not allowed to record activity for that learner'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.daily_activity (learner_id, day, subject, seconds, items, correct, sessions)
  values (p_learner_id, current_date, p_subject,
          greatest(p_seconds, 0), greatest(p_items, 0), greatest(p_correct, 0), 1)
  on conflict (learner_id, day, subject) do update
    set seconds  = public.daily_activity.seconds  + excluded.seconds,
        items    = public.daily_activity.items    + excluded.items,
        correct  = public.daily_activity.correct  + excluded.correct,
        sessions = public.daily_activity.sessions + 1;
end;
$$;

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

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.learners       enable row level security;
alter table public.guardian_links enable row level security;
alter table public.link_invites   enable row level security;

-- Learners ------------------------------------------------------------------
drop policy if exists learners_select on public.learners;
create policy learners_select on public.learners
  for select to authenticated
  using (
    owner_id = (select auth.uid())
    or auth_user_id = (select auth.uid())
    or public.is_guardian_of_learner(id)
  );

-- Only an adult creates a learner, and only in their own name.
drop policy if exists learners_insert on public.learners;
create policy learners_insert on public.learners
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

-- Name, avatar and grade are editable by anyone linked to the learner; the
-- columns that decide who controls the account are held back by learners_guard().
drop policy if exists learners_update on public.learners;
create policy learners_update on public.learners
  for update to authenticated
  using (public.can_manage_learner_content(id))
  with check (public.can_manage_learner_content(id));

drop policy if exists learners_delete on public.learners;
create policy learners_delete on public.learners
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- Guardian links ------------------------------------------------------------
-- Plain column comparisons on purpose: a policy on this table that called
-- can_access_learner() would recurse through the helper straight back here.
drop policy if exists guardian_links_select on public.guardian_links;
create policy guardian_links_select on public.guardian_links
  for select to authenticated
  using (guardian_id = (select auth.uid()) or public.owns_learner(learner_id));

-- Links are only ever created by redeeming an invite, so there is no insert
-- policy. Either side may cut one: the owner revokes, the guardian leaves.
drop policy if exists guardian_links_delete on public.guardian_links;
create policy guardian_links_delete on public.guardian_links
  for delete to authenticated
  using (guardian_id = (select auth.uid()) or public.owns_learner(learner_id));

drop policy if exists guardian_links_update on public.guardian_links;
create policy guardian_links_update on public.guardian_links
  for update to authenticated
  using (public.owns_learner(learner_id))
  with check (public.owns_learner(learner_id));

-- Invites -------------------------------------------------------------------
-- Readable only by whoever minted them; redemption goes through the RPC.
drop policy if exists link_invites_select on public.link_invites;
create policy link_invites_select on public.link_invites
  for select to authenticated
  using (created_by = (select auth.uid()));

drop policy if exists link_invites_delete on public.link_invites;
create policy link_invites_delete on public.link_invites
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- Progress and content tables ------------------------------------------------
do $$
declare
  t text;
begin
  -- Progress: anyone linked to the learner may read it and record it.
  foreach t in array array[
    'skill_states', 'sessions', 'attempts', 'item_mastery', 'list_progress',
    'achievements', 'daily_activity', 'high_scores'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_linked', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_linked', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_linked', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_linked', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_learner(learner_id))',
      t || '_select_linked', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_access_learner(learner_id))',
      t || '_insert_linked', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_access_learner(learner_id)) with check (public.can_access_learner(learner_id))',
      t || '_update_linked', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_access_learner(learner_id))',
      t || '_delete_linked', t);
  end loop;

  -- Content: readable by everyone linked, writable only by those allowed to
  -- manage content, so a read-only guardian cannot rewrite a child's decks.
  foreach t in array array['word_lists', 'decks'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_linked', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_linked', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_linked', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_linked', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_learner(learner_id))',
      t || '_select_linked', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_manage_learner_content(learner_id))',
      t || '_insert_linked', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_manage_learner_content(learner_id)) with check (public.can_manage_learner_content(learner_id))',
      t || '_update_linked', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_manage_learner_content(learner_id))',
      t || '_delete_linked', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Index tidy-up: the columns moved, so should their names.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- Scoped to the converted tables, and skipping any index that backs a
  -- constraint: renaming one of those silently desyncs the index name from the
  -- constraint that owns it.
  for r in
    select c.relname as indexname
    from pg_index x
    join pg_class c on c.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = any (array[
        'skill_states', 'sessions', 'attempts', 'item_mastery', 'list_progress',
        'achievements', 'daily_activity', 'high_scores', 'word_lists', 'decks'
      ])
      and c.relname like '%\_user\_%'
      and not exists (select 1 from pg_constraint pc where pc.conindid = c.oid)
  loop
    execute format('alter index public.%I rename to %I',
                   r.indexname, replace(r.indexname, '_user_', '_learner_'));
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- View
-- ---------------------------------------------------------------------------
create or replace view public.v_subject_summary
with (security_invoker = on) as
  select
    s.learner_id,
    s.subject,
    s.ability,
    s.level_index,
    s.streak_days,
    s.total_attempts,
    s.total_correct,
    (select count(*) from public.item_mastery m
      where m.learner_id = s.learner_id and m.subject = s.subject and m.mastery >= 0.8) as mastered_items,
    (select count(*) from public.item_mastery m
      where m.learner_id = s.learner_id and m.subject = s.subject) as seen_items,
    (select count(*) from public.item_mastery m
      where m.learner_id = s.learner_id and m.subject = s.subject
        and m.due_on is not null and m.due_on <= current_date) as due_items,
    s.last_active_on
  from public.skill_states s;

-- ---------------------------------------------------------------------------
-- Grants. Explicit rather than inherited, so the sensitive surfaces are stated
-- in the same file that creates them.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.learners       to authenticated;
grant select, update, delete         on public.guardian_links to authenticated;
grant select, delete                 on public.link_invites   to authenticated;
grant select                         on public.v_subject_summary to authenticated;

revoke all on public.learner_credentials from anon, authenticated;
revoke all on public.learners           from anon;
revoke all on public.guardian_links     from anon;
revoke all on public.link_invites       from anon;

-- Anything that can mint a session or write a credential is service-role only.
revoke all on function public.attach_provisioned_login(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.authenticate_learner(text, text)                 from public, anon, authenticated;
grant execute on function public.attach_provisioned_login(uuid, uuid, text, text) to service_role;
grant execute on function public.authenticate_learner(text, text)                 to service_role;

-- generate_invite_code is only meaningful inside mint_link_invite; there is no
-- reason for a browser to be able to spin codes.
revoke all on function public.generate_invite_code() from public, anon, authenticated;

grant execute on function public.mint_link_invite(uuid, text, text, interval) to authenticated;
grant execute on function public.redeem_link_invite(text)                     to authenticated;
grant execute on function public.can_access_learner(uuid)                     to authenticated;
grant execute on function public.is_guardian_of_learner(uuid)                 to authenticated;
grant execute on function public.owns_learner(uuid)                           to authenticated;
grant execute on function public.can_manage_learner_content(uuid)             to authenticated;
grant execute on function public.bump_daily_activity(uuid, text, int, int, int) to authenticated;
grant execute on function public.rebuild_item_mastery(uuid, text)               to authenticated;
