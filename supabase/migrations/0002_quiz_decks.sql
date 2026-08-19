-- ============================================================================
-- Cat Academy — study decks (Quiz Cats)
--
-- Decks are content, not progress. Everything the learner *knows* about a card
-- already has a home: `item_mastery` and `attempts` carry subject = 'quiz' and
-- item_key = '<deck_id>:<card_id>', which is why adding a whole new study mode
-- needs exactly one table and no changes to the adaptive engine.
--
-- Cards live in a jsonb array rather than their own table. A deck is read and
-- written whole, is bounded at a few hundred cards, and is never queried by
-- card — so a second table would buy joins we would never use.
-- ============================================================================

create table if not exists public.decks (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users (id) on delete cascade,
  title           text        not null,
  description     text        not null default '',
  tags            text[]      not null default '{}',
  cards           jsonb       not null default '[]'::jsonb,  -- [{ id, term, definition, hint, difficulty }]
  term_label      text        not null default 'Term',
  definition_label text       not null default 'Definition',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint decks_title_len check (char_length(title) between 1 and 80),
  constraint decks_cards_is_array check (jsonb_typeof(cards) = 'array')
);

create index if not exists decks_user_idx on public.decks (user_id, updated_at desc);

comment on table public.decks is
  'Flashcard/quiz study sets. Progress per card lives in item_mastery under subject=''quiz''.';

-- ---------------------------------------------------------------------------
-- Row Level Security — same rule as every other table: you own your rows.
-- ---------------------------------------------------------------------------
alter table public.decks enable row level security;

drop policy if exists decks_select_own on public.decks;
create policy decks_select_own on public.decks
  for select to authenticated using (user_id = auth.uid());

drop policy if exists decks_insert_own on public.decks;
create policy decks_insert_own on public.decks
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists decks_update_own on public.decks;
create policy decks_update_own on public.decks
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists decks_delete_own on public.decks;
create policy decks_delete_own on public.decks
  for delete to authenticated using (user_id = auth.uid());
