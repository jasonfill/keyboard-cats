# 🐱 Cat Academy — a learning suite for kids, disguised as a cat game

Three subjects so far, one account, one progress record:

- **🐈‍⬛ Spelling Cats** — adaptive spelling from 2nd through 8th grade. The app
  works out what a learner can actually spell and keeps them at the edge of it.
- **⌨️ Keyboard Cats** — the original gamified touch-typing course: worlds,
  lessons, arcade modes, and a cat card collection.
- **🃏 Quiz Cats** — flashcards for anything else. Build a deck (or paste one
  in) and study it four ways, on the same adaptive engine as the spelling.

Free, ad-free, and playable with no account at all.

## Run it

Requires **Node 18+**.

```bash
npm install
npm run dev      # http://localhost:5173
```

```bash
npm run build            # production build into dist/
npm run preview          # preview that build
npm run lint             # eslint
npm run validate:words   # sanity-check the spelling curriculum
npm run simulate:adaptive # put simulated learners through the adaptive engine
```

Accounts and cloud sync need a Supabase project — see
[`supabase/README.md`](./supabase/README.md). **Without it the app still runs**,
saving everything to `localStorage` in guest mode.

## How the spelling actually adapts

The claim "adaptive" is cheap, so here is precisely what drives it. Nothing in
the system is configured by hand; every number below comes out of words the
learner attempted.

### 1. One scale for learners and words

Learner ability and word difficulty live on the same axis, and that axis is
roughly "school grade". A word's difficulty starts at the grade band it is
taught in, then moves within that band for length, syllable count, and the
spelling patterns that reliably catch people out — `ough`, silent openers,
doubled consonants, `-ance`/`-ence`, French borrowings. So `cat` and `grass`
are not treated as equally hard just because both are 2nd grade.

Because the two share a scale, the model can answer a useful question about any
word the learner has never seen: *how likely are they to get this right?*

```
P(correct) = 1 / (1 + e^((difficulty - ability) × 1.15))
```

### 2. Ability moves on evidence

After each graded attempt the estimate shifts by the gap between what happened
and what the model expected — the same update an Elo rating uses, and the
discrete-response cousin of the item response theory behind standardised
reading assessments. The learning rate starts high so placement converges in a
handful of words, then decays so a single bad round cannot undo a month.

**Only unaided spelling counts.** Unscrambling letters, filling blanks, and
picking the right option out of four are all good practice, and none of them
move the level. Ask for a hint and that word stops counting too. This is the
one rule that keeps the number honest.

### 3. Words come back on their own schedule

Every word carries its own spaced-repetition state. Get it right and the
interval climbs `1 → 2 → 4 → 8 → 16 → 32 → 60` days, stretched a little for
words below the learner's level and compressed for words above. Get it wrong
and it is due again **immediately** — so it reappears in the next round of the
same sitting, not tomorrow. Waiting a day to revisit a word somebody got wrong
five minutes ago wastes the moment they are most primed to fix it.

Mastery per word is a recency-weighted share of graded attempts, so the last
answer counts most, and a word needs two correct in a row before it is called
mastered.

### 4. Sessions are built, not shuffled

A round of Smart Practice is assembled from the learner's own history:

| Share | What | Why |
| --- | --- | --- |
| up to 40% | words they have missed and that are due | the whole point of review |
| up to 20% | mastered words due for maintenance | stop them decaying |
| the rest | unfinished words from the current grade, most winnable first | forward progress |
| a few | words from the grade above, when ability is running high | a stretch worth attempting |

Review is deliberately capped: a round made mostly of words you already got
wrong is accurate and demoralising.

### 5. Moving up a grade takes three signals

Promotion needs the ability estimate to clear the level, most of the level's
words to be genuinely mastered, and recent graded accuracy to be high. Three
independent things have to agree, so a lucky streak is not enough.

There is a second route up. A learner who arrives already spelling well above
the band tests out on evidence alone rather than grinding through sixty words
they can already spell. Demotion is easier to trigger than promotion, because
being stuck one band too high is far more damaging than one band too low.

### 6. Stars are graded on a curve

A learner practising at their frontier is *meant* to miss things. Scoring them
against a flat 90% would hand out one star forever and teach them that working
at their level is failure. So each round is also scored against what the model
predicted for that exact set of words — beat your own prediction and you get
the third star, whatever grade you are on. The results screen shows both
numbers.

### Does it work?

`npm run simulate:adaptive` runs simulated learners with a hidden true level
through the real engine. It checks two different things:

- **Measurement** — learners whose ability never changes should be placed on
  their true level and stay there. They converge within about a tenth of a
  grade, and crucially do *not* drift upward.
- **Progression** — learners who genuinely improve should be noticed and moved
  up. Their error rate on a word's third look drops by 20–45% against its
  first.

This is a real check, not decoration: it is what caught strong spellers
stalling mid-curriculum, and it is what caught missed words never returning
within a session.

## The activities

| Activity | What it does | Counts toward level |
| --- | --- | --- |
| 📖 Study the List | See it, hear it, type it with the word in front of you | no |
| 🎧 Listen & Spell | Hear it in a sentence, spell it from memory | yes, unless you take a hint |
| 🧩 Missing Letters | Fill in the letters most likely to trip you up | no |
| 🔀 Word Scramble | Rebuild the word from its letters | no |
| 🔍 Proofread | Pick the right spelling out of four | no |
| 📝 Spelling Test | No hints, no second chances | yes |

Dictation uses the browser's speech synthesis — no audio files, no API. Devices
with no voice installed fall back to look-cover-write-check: the word flashes,
hides, and then you spell it.

The proofreading distractors are generated from real error patterns rather than
random typos: dropped halves of doubled consonants, `ie`/`ei` swaps, `-able`
for `-ible`, silent letters lost, `ph` written as `f`, schwa vowels guessed
wrong, apostrophes misplaced in contractions.

## Quiz Cats

Quizlet-shaped, but running on the engine above rather than a plain shuffle.
A deck is a list of two-sided cards — vocabulary, capitals, dates, formulas,
anything with a question and an answer.

| Mode | What it does | Counts toward level |
| --- | --- | --- |
| 🃏 Flashcards | Flip at your own pace, then say whether you knew it | no |
| 🧠 Learn | Multiple choice at first, written recall once you are ready | written answers only |
| ⚡ Match | Race the clock pairing every card with its answer | no |
| 📝 Test | A mixed paper — choice, true/false, and written — with no hints | written answers only |

Three things make this more than a card shuffler:

**Learn escalates per card, not per round.** A card you have never met is asked
as multiple choice, because recognition is where recall starts. Once you are
answering it reliably, the same card comes back as free writing, which is the
only format that proves you can produce the answer unaided. One deck can hold
forty cards at forty different stages and every question still lands at the
right level.

**Only unaided recall moves your ability.** Recognising an answer among four is
evidence about that card, so it updates the card's mastery and its review
schedule — but it never moves the learner's ability estimate. A run of lucky
four-way guesses should not read as getting cleverer.

**Review crosses decks.** Every card carries its own due date, so the home
screen offers one queue drawn from every deck you own, ordered by what you are
closest to forgetting.

Typed answers are graded with a tolerance that scales with the answer's length:
one slip in a four-letter word is probably a different word, one slip in a
fifteen-letter word is a typo. Near misses are marked "so close", shown the
correct spelling, and credited — penalising a transposed letter on a biology
deck tests typing, not biology. Answers written as `couch / sofa` accept
either, and a leading article is always optional.

Decks are built by hand or pasted in whole. The importer auto-detects whether
the two sides are separated by a tab, comma, dash, or colon, handles
definitions that run over several lines, and reports the rows it could not
parse instead of quietly mangling them.

## The curriculum

420 words across 42 lists, 2nd through 8th grade, each with an example sentence
that is read aloud for context. Lists are organised by the rule they teach —
short vowels, magic e, bossy R, compound words, `-tion`, homophones, Greek and
Latin roots, silent letters, `-able`/`-ible`, rule breakers, bee-level words.

Nothing is locked. `npm run validate:words` enforces the invariants the engine
relies on: unique words, every sentence contains its word, and difficulty that
rises monotonically with grade.

Parents and teachers can also paste in their own list — one word per line, with
an optional sentence after a tab, a `|`, or a `-`.

## Accounts and progress

- **Guest first.** Everything works with no account; progress lives in
  `localStorage`.
- **Sign up with email or Google.** On first sign-in, guest progress is merged
  into the account — counters add, bests win, and the local copy is only cleared
  once the merge is written.
- **Attempts are the record.** Every table other than `attempts` is a cache that
  can be rebuilt from it, and `rebuild_item_mastery()` in the database does
  exactly that.
- **Row Level Security everywhere.** A learner can only read and write their own
  rows, and cannot change their own plan.

## Plans

The whole curriculum is free, on purpose: a spelling app that paywalls fourth
grade is not much use to the kid who needs fourth grade. **Family Pro** pays for
the reporting and list-building tools grown-ups ask for — unlimited custom
lists and study decks, full history instead of the last 30 days, the
word-by-word mastery report, printable sheets, CSV export.

Free keeps three study decks of your own; the starter decks that ship with the
app never count against that.

Plans are modelled end to end in the schema and gated in the UI. No payment
processor is connected yet; wiring Stripe in means a webhook that updates
`profiles.plan`.

## Tech

React 18 · TypeScript · Vite · Tailwind · Supabase (Postgres + Auth).
The frontend stays a static build, so GitHub Pages still deploys it.

## Project layout

```
src/
  auth/         AuthProvider (email + Google), sign-in screen
  data/
    spelling/   grade 2-8 word lists, difficulty model
    quiz/       starter decks that ship with the app
    lessons.ts  typing curriculum
  lib/
    adaptive.ts       ability estimation, spaced repetition, promotion
    plans.ts          free vs pro limits
    progress/         storage boundary: types, local repo, cloud repo, merge
    quiz/             decks and import, question generation, study planner
    spelling/         session planner, activities, speech, selectors
  hooks/        useSpellingSession, useQuizSession, useGameState, useTypingEngine
  screens/
    quiz/       deck list, deck detail, editor, and the four study modes
    spelling/   spelling home, play, results, list browser
    suite/      hub, progress dashboard, account, plans, custom lists
scripts/        curriculum validation, adaptive-engine simulation
supabase/       schema migration and setup guide
```
