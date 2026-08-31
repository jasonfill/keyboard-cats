# Build sequence — the three specs as one plan

**Status:** plan · **Date:** 2026-08-31 · **Governs:** activities, structure, ingestion

Three proposals exist, they overlap, and each one has its own "Phase 1". This
document is the single authority on **what gets built when**, and on the
fifteen places where the three specs currently disagree, duplicate or drift.

Read this before starting work in any of them.

> **Every phase number inside the three specs is superseded by the stages
> here.** "Activities phase 2" is not a thing any more; there are stages, and
> the specs describe scope, not order.

---

## 1. The alignment audit

Fifteen findings. Four are **conflicts** — the specs disagree, and building
either as written creates rework. Four are **collisions** — the same resource
claimed twice. Six are **gaps** — nobody covers it, so it surfaces at
integration. One is **drift**.

| # | Kind | Finding | Resolution | Stage |
| --- | --- | --- | --- | --- |
| 1 | collision | `lib/rich` lives in `apps/web`. Ingestion needs it server-side; the activities capability matrix needs it client-side. Both specs assume they will move it. | Move to `packages/shared/src/rich/` **once**, re-export from the old path. File move, not a rewrite. | 0 |
| 2 | collision | `QuizCard`'s optional fields are defined in activities §7 and again in ingestion §5's `GeneratedCard`, with different members. | One definition in `packages/shared`, the superset: activities' fields **plus** `explanation` and `sourcePages`. | 0 |
| 3 | collision | Migration numbers: activities claims 0013 and 0014, ingestion assumes 0015, structure is unnumbered. | Assigned in §3 below. This document is the registry. | 0 |
| 4 | collision | Three independent "Phase 1/2/3" schemes. "Phase 2" is ambiguous across a four-document set. | Global stage names. The specs keep scope and lose ordering. | 0 |
| 5 | drift | Ingestion cites activities §5, §6, §14, §16, §17 — all moved by two when the pedagogy review and choice sections landed. Only §3 still resolves. | Rewrite the nine references. | 0 |
| 6 | **conflict** | Activities §7 does not know rich content exists. `scramble`, `first-letter`, `missing-letters` and tiles all chop the answer into characters — `$\frac{3}{4}$` scrambled is nonsense. | The capability matrix consults `parseRich()` and marks character-manipulating activities `locked` when the answer side carries maths or a figure. **This is the one that would show a broken question to a child.** | 2 |
| 7 | **conflict** | Ingestion says *a draft can be practised*; structure says content with attempts against it is copy-on-write. Together, a parent fixing a typo after their kid tried the deck forks a version of an unshared draft. | Fork-on-edit applies to **shared or assigned** content only. An unshared draft is freely editable however many attempts it has. | 1 |
| 8 | **conflict** | Ingestion's acceptance test is *"a generated set makes every activity in the capability matrix read `ready`"*. The capability matrix does not exist until the ladder ships. | Ladder before ingestion. Without it there is no way to tell whether generation worked. | 2 → 3 |
| 9 | **conflict** | Activities §7 has `media?: {kind:'image'\|'audio'}`; card-formatting puts figures **in the text** as `[[figure {…}]]`. Unbounded overlap. | Figures for anything data-driven and generable; `media` **only** for photographs and recorded audio. | 0 |
| 10 | gap | `label` is specced as an image with hotspots — *"the only activity that requires new authoring"*. Figures already carry labelled vertices, points and parts. | Re-spec on figure specs: render with labels hidden, learner drops them in. Moves it from nearly-last to nearly-free. | 6 |
| 11 | gap | `explanation` (activities §5, finding 8) is absent from ingestion's `GeneratedCard`, which is the best place to produce it — the document is already in a cached context block. | Add to the Zod schema. | 3 |
| 12 | gap | Structure says ingestion should propose `track` and `objective`; ingestion's schema has neither. | Add, once tracks exist. | 3 |
| 13 | gap | `solve`'s numeric grading is partly built — `gradeWritten` already projects `$\frac{3}{4}$` to `3/4` and protects fraction slashes. What is missing is decimal tolerance and equivalent forms (0.75 = 3/4 = 75%). | Restate the activity as "what is left", or someone rebuilds the projection. | 5 |
| 14 | gap | `estimateDifficulty()` measures the plain-text projection, so a triangle figure reads as a short answer regardless of the question's difficulty. | Covered by the existing recommendation to calibrate from observed responses; geometry makes it more urgent. | 5 |
| 15 | gap | No `simulate:ladder`. `simulate:adaptive` is in `npm test` and is what catches exactly this class of bug. | Ships with the ladder, not after it. | 2 |

**Checked and genuinely compatible** — no action needed: rewards' *"no criterion
may require timed work"* and ingestion's *"a draft cannot earn a reward"* compose
cleanly; structure's additive migration does not collide with either of the
others' tables; the `verified` / `isTest` model is consistent across all three.

---

## 2. The sequencing principle

Two rules decided the order below.

**Schema-shaped work lands before behaviour-shaped work.** Adding `track` to
`attempts` costs one migration today and one migration plus a backfill decision
every month it waits. Behaviour can be rewritten cheaply; accumulated rows
cannot.

**The falsifiable bet goes early, and cheaply.** The ladder is the assumption
everything else rests on. It has no external dependencies, costs no money per
use, and can be proven or disproven by a simulation and one metric. If ladder
throughput does not move, three documents' worth of downstream work is
questionable — and that is worth finding out in week three rather than month
six.

---

## 3. The stages

### Stage 0 — Foundations

*Blocks all three specs. Nothing else starts cleanly until this is done.*

- Move `apps/web/src/lib/rich/` → `packages/shared/src/rich/`, re-export from
  the old path so no web import changes (finding 1).
- One `QuizCard` in `packages/shared`, carrying the union of every field the
  three specs ask for (finding 2).
- State the figure/`media` boundary in activities §7 (finding 9).
- Fix the nine stale cross-references (finding 5).
- Adopt this document's stage names in all three specs (finding 4).

**Migration registry** — claimed here, and here only:

| Number | What | Stage |
| --- | --- | --- |
| 0013 | tracks: `track` on decks, word lists, attempts, sessions, skill states | 1 |
| 0014 | `assignments.goal` and the goal-completion predicate | 4 |
| 0015 | `rewards`, `reward_points`, `award_matching_rewards()` | 5 |
| 0016 | `content_sources`, `content_jobs`, `source_id`, `accepted_at` | 3 |

Ingestion lands at 0016 rather than 0015 because rewards is the smaller, more
certain change and there is no reason to hold a number for a stage that has an
unresolved cost model.

### Stage 1 — Structure v1: tracks

*First, because it is a change to `attempts` and it only gets more expensive.*

The Area → Track registry as a constant; `track` on content, attempts,
sessions; `skill_states` re-keyed to `(user_id, subject, track)` and seeded
from existing ability; a skippable track picker; per-track reporting.
`objective` is written and read by nothing.

Settles finding 7 while writing the sharing rules: **fork-on-edit is a property
of shared content, not of content with attempts.**

**Pays for itself immediately**, before any curriculum exists: the parent's
report goes from *"Quiz: 71%"* to *"Biology 62% · Spanish 88% · Geometry 45%"*.

### Stage 2 — The ladder

*The falsifiable bet. No API, no migration, no cost.*

`catalog.ts`, `ladder.ts`, the capability matrix, `first-letter`, the
requeue-never-promotes rule, the choose-within-a-rung menu, and
**`simulate:ladder` in the same pull request as the ladder** (finding 15).

Resolves finding 6 — the capability matrix is where maths and figures lock out
the activities that chop answers into characters, and it must be right the
first time because the failure is visible to a child.

Deliberately **not** here: `catalog.ts` merging the two activity registries
rewrites two existing test suites, so it is its own change inside this stage.

### Stage 3 — Ingestion: upload through acceptance

*Both of its dependencies now exist.*

Ingestion's own phases 1 and 2 together, because its spec is right that phase 1
alone is a demo. PDF only: acquire → read → build → validate → draft, plus the
review screen, `accepted_at`, and the draft gates.

Adds `explanation`, `track` and `objective` to the build call's schema
(findings 11, 12) — all three are nearly free once the document is in a cached
context block, and expensive to backfill.

Its acceptance test is now checkable, because the capability matrix exists
(finding 8).

### Stage 4 — The Mastery Path

Planning within a track (needs stage 1), batching, placement, the readiness
gate, goal assignments, migration 0014.

### Stage 5 — Rewards, and the mastery criteria they rest on

`set_mastered` and `mastery_count`, the strict learned/mastered/retained split,
the rewards table and ledger, migration 0015. Close the flashcard-points hole
in the same stage — it is a payout surface with no verification behind it.

Pick up findings 13 and 14 here: `solve` finishes what the rich work started,
and item difficulty starts calibrating from observed responses.

### Stage 6 — Free recall, fluency, and the cheap engagement wins

`brain-dump`, `speed-recall` (reporting only, gating nothing), `responseMs` in
the model, the maturity band and band-aware copy, the rung-climb micro-moment,
`label` re-specced onto figures (finding 10).

### Stage 7 — Generators

Math facts and sight words. Largest coverage gain for zero authoring, and the
only content where item identity is free across learners — which is what makes
class-level reporting possible later.

### Stage 8 — Publishing, groups, and the catalog

Structure v2 and v3: units, prerequisites, `validate:catalog`, groups, slots,
pinning. Then the supplied catalog, Financial Literacy first.

Last on purpose. It needs a real class asking for it, and it turns the product
into a publisher — a different business with different costs, gated on the
billing model that is still open.

---

## 4. What can run in parallel

Stages 1 and 2 touch almost nothing in common — structure is schema and
reporting, the ladder is planning and activities. Two people, or two sessions,
can run them side by side after stage 0. Everything from stage 3 on is
sequential.

Stage 6's engagement items (the maturity band, band-aware copy) have no
dependencies at all and can be pulled forward into any stage that needs a small
win.

---

## 5. Rules that stop it fragmenting again

1. **One definition per shared shape, in `packages/shared`.** `QuizCard`,
   `Attempt`, `Subject`, `TrackId`, `Objective`. A spec that needs a field adds
   it there; it never redeclares the type.
2. **Migration numbers come from §3 of this document**, never from a spec.
3. **Specs describe scope. This document describes order.** A spec that says
   "phase 2" is out of date.
4. **A cross-reference between specs cites a section *title*, not a number.**
   Numbers moved once and will move again.
5. **New shared behaviour gets a simulation or a validator**, following
   `simulate:adaptive` and `validate:words`. It is the house style and it is
   what has caught the real bugs.
6. **`attempts` is never rewritten.** Every design that would require it is
   wrong; there is always an additive alternative, and finding it is the work.

---

## 6. Still unresolved, and what it blocks

| Question | Blocks | Why it can wait |
| --- | --- | --- |
| Seat-based billing for tutors | stages 5, 8, and ingestion's quota | Nothing before stage 5 charges anybody |
| What ingestion costs per document | stage 3's plan gate | Log usage from day one; decide the gate with numbers |
| Maturity band on the learner or the guardian link | stage 6 | Learner is simpler and probably right |
| Whether achievements stay cross-track | stage 1 | Cross-track is the default and needs no decision to keep |
| Whether a group's slot must exist before content is offered into it | stage 8 | Far enough out to learn from real use |

The one that matters soonest is **ingestion cost**, and it does not need an
answer — it needs the `usage` logging written in stage 3 even though the gate
lands later. Guessing at a price with no data is how this becomes expensive.
