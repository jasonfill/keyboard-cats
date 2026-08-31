-- ---------------------------------------------------------------------------
-- Tracks: which ability pool a piece of work counts toward
-- ---------------------------------------------------------------------------
-- Every study deck in the app shares the subject 'quiz', and `skill_states` is
-- keyed by subject — so a learner has one "quiz ability" averaging Spanish
-- vocabulary, cell biology and state capitals. That number is an average of
-- unrelated things, and every planning decision that reads it runs on noise.
--
-- The obvious fix is to open up `subject` so Biology is a subject. That is a
-- trap. `subject` also namespaces mastery keys as 'quiz:deckId:cardId', so
-- changing it means either rewriting `attempts` — append-only by design, and
-- pinned in 0007 — or detaching every learner's history from the cards it
-- belongs to.
--
-- So `subject` is untouched and a second dimension is added alongside it.
-- Everything here is additive. Nothing is rewritten, no key changes, and no
-- learner loses anything.
--
-- See docs/content-structure-spec.md.

-- Where content sits. Null means General, which is a real pool rather than an
-- error state: filing is an upgrade, never a gate.
alter table public.decks        add column if not exists track      text;
alter table public.decks        add column if not exists objectives text[] not null default '{}';
alter table public.word_lists   add column if not exists track      text;
alter table public.word_lists   add column if not exists objectives text[] not null default '{}';

-- Where work is recorded.
--
-- Denormalised deliberately. `track` could be recovered by joining through
-- `decks`, and that would be wrong twice: a deleted deck takes its track with
-- it, and — the real reason — it breaks the property this whole schema rests
-- on, that `attempts` alone can rebuild every other table. `rebuild_item_mastery`
-- and anything like it must be able to answer "which pool was this?" without a
-- join to mutable content.
alter table public.attempts     add column if not exists track text;

-- Which rung a question was actually asked at, 0-3.
--
-- `activity` records the *mode*, and a mode is a container: a round of Learn
-- asks each card at whatever rung that card is on. Without this a scaffolded
-- question inside Learn reads back as unaided recall and promotes an item on
-- evidence that does not exist. Null for everything recorded before the ladder,
-- which is honest — those rounds meant the mode's own rung.
alter table public.attempts     add column if not exists asked_at smallint
  check (asked_at is null or asked_at between 0 and 3);
alter table public.sessions     add column if not exists track text;

-- Where ability lives. The primary key gains the pool.
--
-- NB `user_id` became `learner_id` in 0003, when a learner stopped being an
-- auth user. Everything below uses the current name.
--
-- Existing rows get the empty string, which means "this subject as a whole" —
-- exactly what every row meant before today. Spelling and typing keep using it,
-- because their curriculum *is* the pool and an absolute scale that means
-- something outside the app cannot be split without ceasing to mean it.
alter table public.skill_states add column if not exists track text not null default '';

alter table public.skill_states drop constraint if exists skill_states_pkey;
alter table public.skill_states add  constraint skill_states_pkey
  primary key (learner_id, subject, track);

create index if not exists attempts_user_track_idx
  on public.attempts (learner_id, track, created_at desc) where track is not null;
create index if not exists sessions_user_track_idx
  on public.sessions (learner_id, track, ended_at desc) where track is not null;
create index if not exists decks_track_idx on public.decks (track) where track is not null;

comment on column public.attempts.track is
  'Ability pool this counted toward. Denormalised so attempts alone can rebuild.';
comment on column public.skill_states.track is
  'Empty string is the whole subject, which is what every row meant before 0014.';

-- Seeding a new pool is done by the client, which already holds the learner's
-- whole-subject estimate and writes the first row for a pool from it — so
-- nobody restarts from zero the day their decks get filed. Deliberately not a
-- function here: a migration is permanent, and one nothing calls is weight
-- every future reader has to account for.
