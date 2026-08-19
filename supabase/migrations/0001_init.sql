-- ============================================================================
-- Cat Academy — core schema
--
-- Design notes
--   * Everything is keyed by subject ('typing', 'spelling', ...) so new
--     learning objectives drop in without a migration.
--   * `attempts` is the source of truth. Every other progress table is a
--     derived cache that can be rebuilt from it, which is what lets the
--     adaptive engine claim to be "rooted in true results".
--   * Row Level Security is on everywhere; a learner only ever sees their own
--     rows. There is no service-role code path in the app.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  avatar_emoji   text        not null default '🐱',
  grade_hint     int,                                   -- self-reported school grade
  plan           text        not null default 'free',   -- free | pro
  plan_source    text,                                  -- stripe | comp | promo
  plan_renews_at timestamptz,
  marketing_optin boolean    not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_plan_check check (plan in ('free', 'pro')),
  constraint profiles_grade_hint_check check (grade_hint is null or grade_hint between 0 and 12)
);

comment on table public.profiles is 'One row per signed-in learner, created automatically on signup.';

-- ---------------------------------------------------------------------------
-- Per-subject state: the adaptive engine's persistent brain
-- ---------------------------------------------------------------------------
create table if not exists public.skill_states (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  subject        text        not null,
  ability        numeric(5,3) not null default 2.0,     -- logit-ish scale, ~= grade level
  ability_sd     numeric(5,3) not null default 1.2,     -- shrinks as evidence accumulates
  level_index    int         not null default 0,        -- index into the subject curriculum
  placed         boolean     not null default false,    -- has the placement check run?
  total_attempts int         not null default 0,
  total_correct  int         not null default 0,
  streak_days    int         not null default 0,
  best_streak_days int       not null default 0,
  last_active_on date,
  settings       jsonb       not null default '{}'::jsonb,
  updated_at     timestamptz not null default now(),
  primary key (user_id, subject)
);

-- ---------------------------------------------------------------------------
-- Sessions: one row per completed round of practice
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users (id) on delete cascade,
  subject        text        not null,
  activity       text        not null,                  -- 'listen-spell', 'lesson', 'cat-rain', ...
  list_id        text,                                  -- curriculum unit, when applicable
  is_test        boolean     not null default false,    -- graded (no hints) vs practice
  items_total    int         not null default 0,
  items_correct  int         not null default 0,
  accuracy       numeric(5,2),
  score          int         not null default 0,
  wpm            int,
  duration_ms    int         not null default 0,
  ability_before numeric(5,3),
  ability_after  numeric(5,3),
  meta           jsonb       not null default '{}'::jsonb,
  started_at     timestamptz not null default now(),
  ended_at       timestamptz not null default now()
);

create index if not exists sessions_user_subject_idx on public.sessions (user_id, subject, ended_at desc);

-- ---------------------------------------------------------------------------
-- Attempts: the atomic record of truth
-- ---------------------------------------------------------------------------
create table if not exists public.attempts (
  id           bigint      generated always as identity primary key,
  user_id      uuid        not null references auth.users (id) on delete cascade,
  session_id   uuid        references public.sessions (id) on delete set null,
  subject      text        not null,
  item_key     text        not null,                    -- the word, or the character
  activity     text        not null,
  is_test      boolean     not null default false,      -- only test-quality attempts move ability
  correct      boolean     not null,
  response_ms  int,
  hints_used   int         not null default 0,
  difficulty   numeric(5,3),                            -- item difficulty at time of attempt
  given        text,                                    -- what the learner actually typed
  created_at   timestamptz not null default now()
);

create index if not exists attempts_user_subject_idx on public.attempts (user_id, subject, created_at desc);
create index if not exists attempts_user_item_idx on public.attempts (user_id, subject, item_key);

-- ---------------------------------------------------------------------------
-- Item mastery + spaced repetition schedule
-- ---------------------------------------------------------------------------
create table if not exists public.item_mastery (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  subject        text        not null,
  item_key       text        not null,
  list_id        text,
  difficulty     numeric(5,3) not null default 2.0,
  mastery        numeric(4,3) not null default 0,       -- 0..1 recency-weighted correctness
  reps           int         not null default 0,
  lapses         int         not null default 0,
  correct_streak int         not null default 0,
  total_attempts int         not null default 0,
  total_correct  int         not null default 0,
  interval_days  numeric(6,2) not null default 0,
  due_on         date,
  first_seen_at  timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  primary key (user_id, subject, item_key)
);

create index if not exists item_mastery_due_idx on public.item_mastery (user_id, subject, due_on);

-- ---------------------------------------------------------------------------
-- Curriculum unit progress (a "spelling list", a typing lesson, ...)
-- ---------------------------------------------------------------------------
create table if not exists public.list_progress (
  user_id       uuid        not null references auth.users (id) on delete cascade,
  subject       text        not null,
  list_id       text        not null,
  plays         int         not null default 0,
  tests_taken   int         not null default 0,
  best_score    int         not null default 0,
  best_accuracy numeric(5,2) not null default 0,
  stars         int         not null default 0,
  mastered_at   timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, subject, list_id)
);

-- ---------------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------------
create table if not exists public.achievements (
  user_id        uuid        not null references auth.users (id) on delete cascade,
  achievement_id text        not null,
  subject        text        not null default 'suite',
  unlocked_at    timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

-- ---------------------------------------------------------------------------
-- Daily rollup — powers streaks and the parent/teacher report
-- ---------------------------------------------------------------------------
create table if not exists public.daily_activity (
  user_id     uuid  not null references auth.users (id) on delete cascade,
  day         date  not null,
  subject     text  not null,
  seconds     int   not null default 0,
  items       int   not null default 0,
  correct     int   not null default 0,
  sessions    int   not null default 0,
  primary key (user_id, day, subject)
);

-- ---------------------------------------------------------------------------
-- Arcade high scores (kept separate: they are leaderboard rows, not learning data)
-- ---------------------------------------------------------------------------
create table if not exists public.high_scores (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  subject    text        not null,
  mode       text        not null,
  score      int         not null,
  wpm        int,
  accuracy   numeric(5,2),
  created_at timestamptz not null default now()
);

create index if not exists high_scores_user_idx on public.high_scores (user_id, score desc);

-- ---------------------------------------------------------------------------
-- Custom word lists (a Pro feature: teachers/parents paste their own list)
-- ---------------------------------------------------------------------------
create table if not exists public.word_lists (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  title      text        not null,
  subject    text        not null default 'spelling',
  grade      int,
  words      jsonb       not null default '[]'::jsonb,  -- [{ w, s }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint word_lists_title_len check (char_length(title) between 1 and 80)
);

create index if not exists word_lists_user_idx on public.word_lists (user_id, updated_at desc);

-- ============================================================================
-- Triggers
-- ============================================================================

-- Create a profile row the moment an auth user appears (email or Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_emoji)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, 'friend'), '@', 1)
    ),
    coalesce(new.raw_user_meta_data ->> 'avatar_emoji', '🐱')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep updated_at honest.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists word_lists_touch on public.word_lists;
create trigger word_lists_touch before update on public.word_lists
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- RPCs
-- ============================================================================

-- Atomic increment of the daily rollup. Called once at the end of a session so
-- two devices practising at once cannot clobber each other's totals.
create or replace function public.bump_daily_activity(
  p_subject text,
  p_seconds int,
  p_items   int,
  p_correct int
)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.daily_activity (user_id, day, subject, seconds, items, correct, sessions)
  values (auth.uid(), current_date, p_subject, greatest(p_seconds, 0), greatest(p_items, 0), greatest(p_correct, 0), 1)
  on conflict (user_id, day, subject) do update
    set seconds  = public.daily_activity.seconds  + excluded.seconds,
        items    = public.daily_activity.items    + excluded.items,
        correct  = public.daily_activity.correct  + excluded.correct,
        sessions = public.daily_activity.sessions + 1;
$$;

-- Rebuild a learner's item mastery straight from the attempt log. This is the
-- guarantee behind "true results": the cached numbers can always be re-derived.
create or replace function public.rebuild_item_mastery(p_subject text)
returns int
language plpgsql
security invoker
set search_path = public
as $$
declare
  touched int;
begin
  with ranked as (
    select
      a.item_key,
      a.correct,
      a.difficulty,
      a.created_at,
      row_number() over (partition by a.item_key order by a.created_at desc) as recency
    from public.attempts a
    where a.user_id = auth.uid()
      and a.subject = p_subject
      and a.is_test
  ),
  rolled as (
    select
      item_key,
      -- exponentially weighted correctness: the last attempt counts most
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
    (user_id, subject, item_key, difficulty, mastery, total_attempts, total_correct, first_seen_at, last_seen_at)
  select auth.uid(), p_subject, item_key, coalesce(difficulty, 2.0), coalesce(mastery, 0),
         total_attempts, total_correct, first_seen_at, last_seen_at
  from rolled
  on conflict (user_id, subject, item_key) do update
    set mastery        = excluded.mastery,
        total_attempts = excluded.total_attempts,
        total_correct  = excluded.total_correct,
        last_seen_at   = excluded.last_seen_at;

  get diagnostics touched = row_count;
  return touched;
end;
$$;

-- ============================================================================
-- Views
-- ============================================================================

-- Cross-subject snapshot used by the progress dashboard.
create or replace view public.v_subject_summary
with (security_invoker = on) as
  select
    s.user_id,
    s.subject,
    s.ability,
    s.level_index,
    s.streak_days,
    s.total_attempts,
    s.total_correct,
    (select count(*) from public.item_mastery m
      where m.user_id = s.user_id and m.subject = s.subject and m.mastery >= 0.8) as mastered_items,
    (select count(*) from public.item_mastery m
      where m.user_id = s.user_id and m.subject = s.subject) as seen_items,
    (select count(*) from public.item_mastery m
      where m.user_id = s.user_id and m.subject = s.subject
        and m.due_on is not null and m.due_on <= current_date) as due_items,
    s.last_active_on
  from public.skill_states s;

-- ============================================================================
-- Row Level Security
-- ============================================================================

alter table public.profiles       enable row level security;
alter table public.skill_states   enable row level security;
alter table public.sessions       enable row level security;
alter table public.attempts       enable row level security;
alter table public.item_mastery   enable row level security;
alter table public.list_progress  enable row level security;
alter table public.achievements   enable row level security;
alter table public.daily_activity enable row level security;
alter table public.high_scores    enable row level security;
alter table public.word_lists     enable row level security;

do $$
declare
  t text;
begin
  -- Every progress table follows the same rule: you own your rows, nobody else
  -- can read them. `profiles` gets the same treatment but no delete policy.
  foreach t in array array[
    'skill_states', 'sessions', 'attempts', 'item_mastery', 'list_progress',
    'achievements', 'daily_activity', 'high_scores', 'word_lists'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      t || '_delete_own', t);
  end loop;
end;
$$;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (id = auth.uid());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (id = auth.uid());

-- Plan columns are billing state, not user preferences: a learner may edit
-- their name and avatar but cannot promote themselves to Pro.
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and plan = (select p.plan from public.profiles p where p.id = auth.uid())
    and plan_source is not distinct from (select p.plan_source from public.profiles p where p.id = auth.uid())
    and plan_renews_at is not distinct from (select p.plan_renews_at from public.profiles p where p.id = auth.uid())
  );
