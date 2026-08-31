-- ---------------------------------------------------------------------------
-- Connection codes: a tutor hands one out, a family redeems it
-- ---------------------------------------------------------------------------
-- The existing invite runs the other way: a parent mints a code for one child
-- and gives it to another grown-up. That is right between two parents, and
-- wrong for a tutor with twenty students — it makes twenty families each
-- perform a setup step before the tutor can do anything.
--
-- So the arrow flips. A tutor mints one code that stands for *them*, not for a
-- learner, and prints it on their sign-up page. Each family enters it and
-- chooses which of their children it applies to.
--
-- Consent still belongs to the family, and deliberately so: minting a code
-- grants nothing at all. The grant happens when someone who owns a learner
-- redeems it, which is a parent for a child, or a 13+ learner who owns their
-- own profile acting for themselves. A tutor can invite; only a family can let
-- them in, and can put them out again afterwards.

-- 'tutor' joins the roles a link can carry. Note this lives on the link rather
-- than on the account: the same person is a parent to their own children and a
-- tutor to somebody else's, and an account-wide type could not say that.
alter table public.guardian_links  drop constraint if exists guardian_links_role_check;
alter table public.guardian_links
  add  constraint guardian_links_role_check check (role in ('parent', 'teacher', 'tutor'));

alter table public.link_invites    drop constraint if exists link_invites_role_check;
alter table public.link_invites
  add  constraint link_invites_role_check check (role in ('parent', 'teacher', 'tutor'));

create table if not exists public.connection_codes (
  code               text        primary key,
  owner_id           uuid        not null references auth.users (id) on delete cascade,

  /** What a family sees before they accept — "Mrs Patel, Tuesday maths". */
  label              text,
  role               text        not null default 'tutor',
  can_manage_content boolean     not null default true,

  /** Both null by default: a code on a tutor's page should keep working. */
  expires_at         timestamptz,
  max_uses           int,
  uses               int         not null default 0,

  revoked_at         timestamptz,
  created_at         timestamptz not null default now(),

  constraint connection_codes_role_check check (role in ('parent', 'teacher', 'tutor')),
  constraint connection_codes_max_uses_check check (max_uses is null or max_uses > 0)
);

create index if not exists connection_codes_owner_idx
  on public.connection_codes (owner_id, created_at desc);

comment on table public.connection_codes is
  'A standing invitation from one grown-up. Grants nothing until a family redeems it against a learner they own.';

alter table public.connection_codes enable row level security;

drop policy if exists connection_codes_select on public.connection_codes;
drop policy if exists connection_codes_insert on public.connection_codes;
drop policy if exists connection_codes_update on public.connection_codes;
drop policy if exists connection_codes_delete on public.connection_codes;

-- Only the tutor reads their own codes. A family never needs to: they act
-- through the two functions below, which is what keeps a stranger from
-- listing codes or reading the uses counter.
create policy connection_codes_select on public.connection_codes
  for select to authenticated using (owner_id = (select auth.uid()));

create policy connection_codes_insert on public.connection_codes
  for insert to authenticated with check (owner_id = (select auth.uid()));

create policy connection_codes_update on public.connection_codes
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy connection_codes_delete on public.connection_codes
  for delete to authenticated using (owner_id = (select auth.uid()));

grant select, insert, update, delete on public.connection_codes to authenticated;

-- ---------------------------------------------------------------------------
-- Minting
-- ---------------------------------------------------------------------------
-- Anyone with an account may write one down. It is a business card, not a key:
-- it opens nothing until a family chooses to use it.

create or replace function public.mint_connection_code(
  p_label              text     default null,
  p_role               text     default 'tutor',
  p_can_manage_content boolean  default true,
  p_ttl                interval default null,
  p_max_uses           int      default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text;
  v_tries int := 0;
begin
  if auth.uid() is null then
    raise exception 'Sign in to create a connection code'
      using errcode = 'insufficient_privilege';
  end if;

  loop
    v_tries := v_tries + 1;
    v_code := public.generate_invite_code();
    exit when not exists (select 1 from public.connection_codes c where c.code = v_code);
    if v_tries > 10 then
      raise exception 'Could not allocate a connection code';
    end if;
  end loop;

  insert into public.connection_codes
    (code, owner_id, label, role, can_manage_content, expires_at, max_uses)
  values
    (v_code, auth.uid(), nullif(btrim(coalesce(p_label, '')), ''), p_role,
     p_can_manage_content,
     case when p_ttl is null then null else now() + p_ttl end,
     p_max_uses);

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Looking before you leap
-- ---------------------------------------------------------------------------
-- A family must be able to see who they are about to let in, before they let
-- them in. Without this the flow is "type eight characters and hope", which is
-- not consent in any meaningful sense.
--
-- It returns the tutor's name and what the link would allow, and nothing about
-- their other students. Codes are eight characters from a 31-letter alphabet,
-- so guessing one to learn a name is not a practical attack.

create or replace function public.describe_connection_code(p_code text)
returns table (
  valid              boolean,
  reason             text,
  owner_name         text,
  label              text,
  role               text,
  can_manage_content boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.connection_codes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = 'insufficient_privilege';
  end if;

  select * into c from public.connection_codes
   where code = upper(btrim(p_code));

  if not found then
    return query select false, 'That code does not exist', null::text, null::text, null::text, null::boolean;
    return;
  end if;

  if c.revoked_at is not null then
    return query select false, 'That code has been withdrawn', null::text, null::text, null::text, null::boolean;
    return;
  end if;

  if c.expires_at is not null and c.expires_at < now() then
    return query select false, 'That code has expired', null::text, null::text, null::text, null::boolean;
    return;
  end if;

  if c.max_uses is not null and c.uses >= c.max_uses then
    return query select false, 'That code has been used up', null::text, null::text, null::text, null::boolean;
    return;
  end if;

  return query
    select true,
           null::text,
           coalesce(p.display_name, 'A grown-up'),
           c.label,
           c.role,
           c.can_manage_content
      from public.profiles p
     where p.id = c.owner_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Granting
-- ---------------------------------------------------------------------------
-- The consent step. Only someone who owns the learner may do this — a parent
-- for their child, or a learner old enough to own their own profile acting for
-- themselves. A guardian who was themselves let in cannot pass that access on.

create or replace function public.redeem_connection_code(
  p_code       text,
  p_learner_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.connection_codes%rowtype;
begin
  if not public.owns_learner(p_learner_id) then
    raise exception 'Only the grown-up who owns this learner can connect a tutor to them'
      using errcode = 'insufficient_privilege';
  end if;

  select * into c from public.connection_codes
   where code = upper(btrim(p_code))
   for update;

  if not found then
    raise exception 'That code does not exist';
  end if;
  if c.revoked_at is not null then
    raise exception 'That code has been withdrawn';
  end if;
  if c.expires_at is not null and c.expires_at < now() then
    raise exception 'That code has expired';
  end if;
  if c.max_uses is not null and c.uses >= c.max_uses then
    raise exception 'That code has been used up';
  end if;
  if c.owner_id = auth.uid() then
    raise exception 'That is your own code';
  end if;

  insert into public.guardian_links (guardian_id, learner_id, role, can_manage_content)
  values (c.owner_id, p_learner_id, c.role, c.can_manage_content)
  on conflict (guardian_id, learner_id) do nothing;

  -- Only a link that is actually new counts against a limited code, so a
  -- family re-entering the code does not burn a seat.
  if found then
    update public.connection_codes set uses = uses + 1 where code = c.code;
  end if;

  return c.owner_id::text;
end;
$$;

grant execute on function public.mint_connection_code(text, text, boolean, interval, int) to authenticated;
grant execute on function public.describe_connection_code(text)                            to authenticated;
grant execute on function public.redeem_connection_code(text, uuid)                        to authenticated;
