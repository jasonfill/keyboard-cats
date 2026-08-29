-- ============================================================================
-- Whizzo — the learner's chosen world
--
-- A theme swaps one accent colour, one mascot and a few copy strings. It is
-- display state: it changes nothing about the curriculum, the difficulty, or
-- what earns a reward, and it never appears in `attempts`.
--
-- It lives on the learner rather than in browser storage for one reason: a
-- grown-up can set it. A parent choosing a world for a six-year-old on their
-- own phone has to reach the child's tablet, and localStorage cannot do that.
-- Per learner, not per account — siblings differ.
--
-- No new policy is needed. `learners_update` already gates on
-- can_manage_learner_content(), which admits exactly the three writers this
-- feature has: the owner, the learner themselves, and a guardian holding
-- can_manage_content. That is "the student picks it or a parent sets it",
-- already spelled out.
--
-- Deliberately a plain text column with no enum and no check against a list of
-- ids. The set of themes is a client concept and will grow; a constraint here
-- would mean a migration every time a world is added, and the failure mode of
-- an unknown value is already handled — the client falls back to the default
-- rather than rendering nothing.
-- ============================================================================

alter table public.learners
  add column if not exists theme text;

alter table public.learners
  drop constraint if exists learners_theme_len;

alter table public.learners
  add constraint learners_theme_len
  check (theme is null or char_length(theme) between 1 and 32);

comment on column public.learners.theme is
  'The learner''s chosen world, e.g. ''cats''. Display state only: never affects curriculum, difficulty, or what earns a reward. Null means the client default.';
