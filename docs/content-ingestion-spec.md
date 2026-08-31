# Content ingestion — a document in, a working set out

**Status:** proposal · **Date:** 2026-08-31 · **Scope:** apps/api, apps/web, packages/shared, one migration

The sentence this works toward:

> **A grown-up hands us the thing they already have — a chapter PDF, a study
> guide in Google Docs, a photo of a worksheet — and gets back content the
> learner can practise, with nothing else to fill in.**

[docs/learning-activities-spec.md](learning-activities-spec.md) §14 says a
grown-up does three things: *load it, say what it's for, nothing*. That spec
assumes step 1 is solved. It isn't. Today "load it" means typing forty rows or
pasting a tab-separated table, and the material a parent actually holds is a
PDF the teacher emailed. This document specifies step 1.

It is deliberately **not** a generic "AI features" document. It has one job:
turn a source document into the exact content shapes the app already runs on,
so that everything downstream — the ladder, the capability matrix, the Mastery
Path — works on it unchanged.

---

## 1. What it has to produce, and why that constrains everything

The app runs on three content shapes and one generator idea:

| Shape | Type | Where it lives |
| --- | --- | --- |
| Study set | `QuizDeck` / `QuizCard` | `decks.cards`, `jsonb` |
| Word list | `CustomWordList` | `word_lists.words`, `jsonb` |
| Generated bank | parameters, not rows | Tier 0 in the activities spec §6 |

Card text is not plain text any more. Since
[docs/card-formatting.md](card-formatting.md), four things inside a card string
mean something: `$…$`, `$$…$$`, `<math>…</math>` and `[[figure {…}]]`. This is
the single most important fact in this document, because it means a language
model can write a geometry card — *"Find the area."* plus
`[[figure {"kind":"triangle","sides":["3 cm","4 cm","5 cm"],"rightAngle":2}]]` —
and the app renders it, reads it aloud, and grades a typed answer against it.
The formatting layer was built for a human author, and a model happens to be a
better user of it than a human is.

So the output contract is: **valid `QuizCard`s and `CustomWordList`s, whose
text validates against the card-formatting grammar, with the optional
enrichment fields from activities spec §5 already filled in.** Nothing new
downstream. If a generated set does not make the capability matrix light up
with `ready` activities, the generation failed, however good the prose was.

### The one thing that has to move first

`apps/web/src/lib/rich/` — `tex.ts`, `mathml.ts`, `figures.ts`, `parse.ts`,
`layout.ts` — is 2,300 lines of pure TypeScript with no DOM access and no
React import (the only mention of React is in a comment). The API cannot
import it, and the API is where generated content arrives.

**Move `lib/rich/` into `packages/shared/src/rich/`** and re-export it from
`apps/web/src/lib/rich/index.ts` so no web import changes. This is a file
move, not a rewrite, and without it the server cannot tell a valid figure from
a hallucinated one. Everything in §7 depends on it.

---

## 2. Two intakes

### Upload

Drag a file in, or take a photo. The formats that matter, in the order a
parent actually has them:

| Format | How it reaches Claude | Fidelity |
| --- | --- | --- |
| **PDF** | native `document` block via Files API | full — text *and* page images, so a scanned worksheet works |
| **Photo / screenshot** (`png`, `jpg`, `heic`) | `image` block | full, subject to the photo |
| **Plain text / Markdown / CSV** | `document` block, `text/plain` | full |
| **DOCX** | extracted to text server-side, sent as `text/plain` | lossy — see below |
| **PPTX** | slide text + notes extracted, sent as `text/plain` | lossy |
| **XLSX** | sheet → CSV per sheet | fine; spreadsheets are already rows |

**The DOCX/PPTX honesty note.** Claude's `document` block takes PDF and plain
text. It does not take Word or PowerPoint. The two ways to close that gap are
converting to PDF (needs LibreOffice; not installable on a 0.5 GB App Platform
instance) or extracting text in-process (`mammoth` for DOCX, an XML walk over
`ppt/slides/*.xml` for PPTX). We extract text, and we accept the loss:
**embedded images and equations in a Word file will not come through.** The
UI says so, once, at the moment a `.docx` is dropped, with the remedy that
actually works: *"Word files come in as text — if there are diagrams or
equations, print to PDF first and upload that."* A parent will do that. A
parent will not debug a silently-worse deck.

Images inside a PDF are fine, because the PDF path is native and visual.

### Link

Paste a URL. Three cases, and only the first two are worth building.

**A Google Doc, Slides or Sheet.** Google's export endpoints
(`/document/d/<id>/export?format=pdf`, `/presentation/d/<id>/export/pdf`,
`/spreadsheets/d/<id>/export?format=csv`) return the file directly — *if the
document is shared "anyone with the link"*. Most study guides a teacher sends
already are; many aren't. So the flow must handle the closed case as a first
class outcome, not an error page: we detect the sign-in redirect and say
*"This document is private. Either change sharing to 'anyone with the link', or
download it and upload the file."* Both remedies are one action.

Full OAuth with a Google Picker and the `drive.file` scope solves this
properly, and it is a phase-2 decision, not a phase-1 one — it adds a consent
screen, a verification review, and a token store, in exchange for removing one
sentence of instruction. Ship the export path, count how often it fails, then
decide.

**A public web page.** A Quizlet-style list, a vocabulary page, a Wikipedia
article. Fetch the HTML, strip to text, send as a text document. Low effort,
occasionally the thing someone wants.

**Anything else** — a Canvas or Google Classroom link behind a login, a
Dropbox preview page. Detect and refuse clearly: *"That link needs a sign-in we
don't have. Download it and drop the file here."*

### Fetching a URL is the security surface

The server fetching an arbitrary URL is server-side request forgery unless it
is fenced. The fence, non-negotiable:

- **Scheme allowlist:** `https` only.
- **Host allowlist for the Google path**, exact-match on
  `docs.google.com` / `drive.google.com`.
- **DNS resolution checked before connecting**, and again after every redirect:
  reject any address in a private, loopback, link-local, or unique-local range.
  Maximum three redirects.
- **Caps:** 25 MB, 30 second timeout, and a `content-type` that matches what
  the extension claimed.
- **No credentials, no cookies, no auth headers, ever.**

The generic-web-page case is where this earns its keep. It is also why the
generic case is gated to signed-in adults and rate limited hard.

---

## 3. The pipeline

Four stages. Stages 2 and 3 are the Claude calls; the rest is plumbing.

```
  intake ──▶ 1. acquire ──▶ 2. read ──▶ [review] ──▶ 3. build ──▶ 4. land
             file or URL     source map    adult      content      decks +
             → file_id       + citations   picks      bundle       lists
```

**1. Acquire.** Get bytes, from an upload stream or a fenced fetch. Convert
if the format needs it. Upload to the Anthropic **Files API** and keep the
`file_id`. Never buffer the whole file in the API process — the instance is
`apps-s-1vcpu-0.5gb` and a 40 MB PDF held in memory alongside a Postgres pool
is how that instance dies. Stream to disk in a temp file, stream to the Files
API, unlink.

Files API rather than inline base64 for three reasons: base64 inflates by 33%
into the same small heap, the 32 MB inline request cap is lower than the 500 MB
file cap, and — the real reason — **one upload is referenced by every
subsequent call**, which is what makes the caching in §5 possible.

**2. Read** (§4). One call. Produces a *source map*: what this document is,
who it is for, and what is learnable in it, with citations back to the page it
came from.

**3. Build** (§5). One call per topic the adult kept, fanned out over the same
cached document. Produces the content bundle.

**4. Land** (§7). Validate, clamp, mark provenance, write drafts.

---

## 4. Stage 2 — the read

One request. The document block with `citations: {enabled: true}`, and an
instruction to survey rather than to generate.

What comes back:

```ts
interface SourceMap {
  title: string                 // what to call this, if the adult doesn't rename it
  kind: 'vocabulary' | 'reading' | 'math' | 'science' | 'history'
      | 'spelling-list' | 'study-guide' | 'worksheet' | 'syllabus' | 'other'
  subjectHint: Subject | null   // 'quiz' | 'spelling' — never 'typing'
  gradeBand: string | null      // 'K-2' | '3-5' | '6-8' | '9-12', best guess
  language: string              // BCP-47; a Spanish vocab list is a real case
  topics: Array<{
    id: string
    title: string               // 'Cell organelles'
    summary: string             // one line the adult reads to decide
    itemCount: number           // how many learnable items are in here
    pages: number[]             // where it lives, for the citation chips
    proposedShape: 'deck' | 'word-list' | 'generator'
    generator?: { kind: 'math-facts'; op: string; range: [number, number] }
  }>
  warnings: string[]            // 'pages 12-14 are a scanned image and unreadable'
}
```

Three things about this stage are load-bearing:

**Citations are the credibility.** Every topic carries the pages it came from,
and the review screen shows them. A parent who can click "cell organelles" and
see page 7 of the chapter they uploaded believes the rest. One that can't,
doesn't.

**`proposedShape: 'generator'` is the best possible outcome.** A times-table
worksheet does not need forty generated cards; it needs the Tier 0 math-facts
generator with `op: '×', range: [2, 12]`, which the activities spec §6 already
specifies. Recognising a worksheet as *a rule, not a list* produces better
content than any amount of extraction, costs nothing to store, and never
drifts. The read stage should reach for it whenever the document is drill.

**Refusal to invent is explicit.** If the document is a permission slip or a
syllabus with no learnable content, the honest answer is zero topics and a
warning, and the UI says *"There isn't practice material in this one."* A model
asked to produce a study set from a field-trip form will produce one. The
prompt must forbid that, and the review screen makes it visible either way.

**Constraint to verify before building:** per the Claude API reference,
`citations` and `output_config.format` (structured outputs) cannot be combined
— pairing them returns a 400. So this stage takes its structure from a
`strict: true` tool call, not from `output_config.format`. Confirm that
`citations` + strict tool use is accepted; if it isn't, keep citations and
parse a documented JSON shape leniently, because the citations are worth more
here than the schema guarantee.

### The review screen

The adult sees the topic list with counts and page chips, everything checked.
Three controls and no more: **uncheck a topic**, **pick who it's for**, **Build
it**. The setup-cost target in the activities spec §17 is three actions total,
and this screen is allowed exactly one of them.

For a single-topic document — the common case, a chapter vocabulary list — skip
the screen entirely and go straight to build. A review screen with one checked
box is a speed bump, not a choice.

---

## 5. Stage 3 — the build

One call per kept topic, fanned out. Each call sees the same document (by
`file_id`) plus the source map, and is asked for one topic's worth of content.

**Why per topic rather than one big call.** A forty-page chapter with six
topics asked for in one response produces a long, flat, increasingly lazy list
— the last topic always gets worse cards than the first. Six calls each produce
their best work, run in parallel, fail independently, and let a partial failure
land five topics instead of none.

**Prompt caching is what makes this affordable.** The document block, the
system prompt and the card-formatting grammar are identical across every
topic's call, so they go in front of a `cache_control` breakpoint with
`ttl: '1h'`; only the topic instruction varies and it goes last. The first call
writes the cache at 1.25×; the rest read it at 0.1×. On a 20-page PDF that is
the difference between paying for 50k input tokens six times and paying for it
once. Assert it in the logs: if `usage.cache_read_input_tokens` is zero on
call two, something upstream is varying and the cost is 10× what it should be.

**Structured output.** `output_config: {format: zodOutputFormat(BundleSchema)}`
via `client.messages.parse()`. The schema is not a loose sketch — it is the
real card shape:

```ts
const GeneratedCard = z.object({
  term: z.string().max(4000),
  definition: z.string().max(4000),
  hint: z.string().max(1000).nullable(),
  // the §5 enrichment fields, requested up front rather than bolted on later
  category: z.string().max(60).nullable(),
  example: z.string().max(600).nullable(),
  order: z.number().int().nullable(),
  answerKind: z.enum(['text', 'numeric', 'set']),
  tolerance: z.number().nullable(),
  altAnswers: z.array(z.string().max(200)).max(6),
  sourcePages: z.array(z.number().int()).max(8),
})
```

Requesting `category` and `example` **in the same call that writes the card**
is the point of doing this here rather than through the activities spec's
`POST /content/enrich`. Enrichment as a second pass exists because old decks
need it. New decks should never need it: a card generated without a category
is a card that can't play Sort, and asking for it costs a few output tokens
against a document that is already in the context. **A generated set should
arrive with every activity in the capability matrix reading `ready`.** That is
the acceptance test for this stage, and it is checkable in code.

### What good output looks like

- **Cards are questions, not fragments.** `definition` is what the learner has
  to produce; `term` is the prompt. For a vocabulary list that is the obvious
  mapping. For a history chapter it is not, and the prompt must say so:
  *"1953"* is not a card, *"What year did Everest first get climbed?"* is.
- **Maths is written in the grammar.** `$\frac{3}{4}$`, `$45^\circ$`,
  `\text{cm}`. The card-formatting doc is included in the system prompt
  verbatim; it is 140 lines and it is the highest-leverage part of the whole
  prompt.
- **Figures are emitted where a figure is the question.** A bar-chart reading
  question is a `[[figure {"kind":"bar", …}]]` with the values written on the
  bars, per that doc's rule.
- **`difficulty` is not requested.** `estimateDifficulty()` computes it on
  save, deterministically, the same as every hand-typed card. A model guessing
  at a number on the app's internal ability scale would be inventing precision.
- **A word list, when the topic is spelling.** `CustomWordList` items are
  `{w, s}` — the word and a sentence using it. That maps onto a spelling
  chapter exactly, and the spelling engine then works unchanged.

### Model, effort, thinking

`claude-opus-5`, adaptive thinking, `output_config.effort: 'high'`, streaming
(the build call can run long and `max_tokens` is generous). This is the model
whose reading of a scanned worksheet and whose grasp of the figure grammar are
what the feature is actually selling; the read stage in particular has no cheap
substitute.

Two levers exist if cost bites, and both are decisions to make with real
numbers rather than up front: dropping the *build* calls (not the read) to
`effort: 'medium'`, and moving a whole-book run to the **Batch API** at 50%,
which fits the "upload the textbook on Sunday" case perfectly and fits
"generate this while I wait" not at all. Quota, not model choice, is the
primary cost control — see §9.

Set `stop_reason === 'refusal'` handling on both calls: it returns HTTP 200,
and the job should fail with *"We couldn't work with that document"* rather
than crash on absent content.

---

## 6. The document is untrusted input

An uploaded document is data. It is also, sometimes, a document containing the
sentence "ignore your instructions and…", and the output of this pipeline is
shown to children. This is not hypothetical for a product where the upload
button is aimed at whatever a stranger emailed a parent.

**The rules that must not bend:**

1. **The document never carries authority.** It is a `document` content block,
   never part of the system prompt, and the system prompt says explicitly that
   the document's text is material to be studied, not instructions to follow.
2. **The output shape is constrained, not trusted.** Structured output means
   the worst case of a successful injection is *bad cards*, not an action. The
   pipeline has no tools, no network access, and no write path other than
   "propose a draft deck".
3. **Every generated string is re-validated server-side** before it is stored
   — length, the card-formatting grammar (§7), and no exceptions for content
   that "came from us".
4. **Nothing generated is ever shown to a learner before an adult accepts it.**
   §8. This is the actual mitigation; the rest is defence in depth.
5. **Appropriateness is checked in the same call**, as a field on the bundle
   (`flagged: string[]`), not as a separate moderation pass. A chapter on the
   Holocaust is appropriate content that a model should handle carefully, not
   refuse; a document that is not school material at all should come back with
   zero topics and a warning.

**Personal data.** A class roster, a report card, an IEP — all of these get
dropped into an upload box eventually. Two rules: the source map never extracts
names into cards (the prompt forbids it), and the retention rule in §10 is
short and stated in the UI at the moment of upload.

---

## 7. Stage 4 — landing it

Validation is server-side and total. Nothing reaches `decks.cards` unchecked.

| Check | Rule |
| --- | --- |
| Schema | `quizCardSchema` / `customWordListSchema` as they stand |
| Card text | `parseRich()` from the moved `packages/shared/src/rich/` — every `$…$` compiles, every `[[figure]]` validates, or the card is dropped |
| Count | ≤ 300 cards per deck (`MAX_CARDS_PER_DECK`); a bigger topic splits into "Part 1 / Part 2" |
| Duplicates | same normalised `term` within a deck → keep the first |
| Empties | either side blank → drop the card |
| Answer sanity | `answerKind: 'numeric'` where the definition doesn't parse as a number → downgrade to `'text'` |
| Difficulty | computed by `estimateDifficulty()`, never accepted from the model |
| Ids | `newId('card')`, ours, so mastery keys are stable |

A dropped card is counted and reported — *"38 cards from 6 pages; 2 skipped."*
Silence about dropped content is how a parent ends up with a deck missing the
word the test is on.

The bundle then lands as **drafts** (§8) owned the same way every other piece
of content is: `learner_id` XOR `owner_user_id`, per migration 0011. Content
generated by a grown-up lands in their library; content generated by a learner
for themselves lands on the learner.

---

## 8. Provenance and review — the rule that must not bend

The activities spec §3 non-negotiable 4 says generated content is labelled and
reviewable, and §6 draws a hard line: enrichment never writes `term`,
`definition`, `altAnswers` or `tolerance`, because a generated *answer* is not
an authority.

This feature crosses that line by definition — here the generated thing *is*
the answer key. So the line has to move somewhere defensible, and this is
where:

> **A generated set is a draft until a grown-up accepts it. A draft can be
> practised. A draft cannot be assigned, cannot close a goal, and cannot earn a
> reward.**

That gives three properties worth having:

- **Accepting is one action.** One button, "Looks right", on the whole set.
  Line-by-line editing exists and nobody has to use it. The three-action setup
  budget survives.
- **A child can start immediately.** Practice on a draft is real practice and
  updates item mastery normally. Nothing is gated on a parent being awake.
- **Nothing the app *claims* rests on unreviewed machine output.** A reward
  payout, a "mastered" report, a closed assignment — every one of those is a
  statement to a parent, and every one of them requires that a human looked
  once. This is the same instinct as `verified` and `isTest`: separate what
  happened from what we assert.

Provenance is carried on the data, not on a screen:

- `generated: ['term', 'definition', 'example', 'category']` per card, the
  field the activities spec §5 already defines.
- `source_id` on the deck, pointing at the source record (§10), so the deck
  can always answer *where did this come from* — filename, page numbers,
  when, which model.
- Every card keeps its `sourcePages`, and the editor shows them.

**A generated deck is visibly generated wherever a grown-up looks at it**, and
the label does not disappear on acceptance — acceptance changes what the
content is allowed to do, not where it came from.

---

## 9. Plans, quota and abuse

This is the first thing in the app that costs real money per use, and pricing
it is a product decision the billing model doesn't settle yet
(see the open question in the activities spec §16.4).

What is clear:

- **Ingestion is Pro.** Not because free users don't deserve it, but because
  it is the first feature whose marginal cost is not zero, and Pro currently
  has to justify itself on reports alone. "Upload the chapter, get the deck" is
  a far better reason to pay $4 than a printable progress sheet.
- **Free gets one, once.** A single document, ever, so the value is felt rather
  than described. It is also the honest demo: whatever comes back is what
  the product does.
- **Pro gets a monthly document quota, not unlimited.** A number in
  `PlanLimits` (`documentsPerMonth`), counted server-side against source
  records, shown as *"8 of 20 documents this month"*. Unlimited invites the
  one user who uploads a library.
- **Page and size caps** on top: 100 pages and 25 MB per document on Pro.
  Beyond that, split it — which is also better content.
- **Deck limits still apply.** A free user's fourth deck is refused today
  (`limits.decks = 3`) and a bundle that would breach the cap says so *before*
  the generation runs, not after we have spent the money.

Rate limits: the API's global 300/min is irrelevant here. Ingestion gets its
own scoped `@fastify/rate-limit` registration — a handful of jobs per hour per
user — the same pattern `inviteRoutes` and `childLoginPublicRoutes` already
use in `server.ts`.

### What a document costs, roughly

At Opus 5 rates ($5/1M in, $25/1M out) and ~2,000 tokens per PDF page:

| Document | Read | Build (6 topics, cached) | Output | Total |
| --- | --- | --- | --- | --- |
| 5-page worksheet | ~$0.05 | ~$0.03 | ~$0.08 | **~$0.15** |
| 20-page chapter | ~$0.20 | ~$0.09 | ~$0.20 | **~$0.50** |
| 60-page study guide | ~$0.60 | ~$0.20 | ~$0.35 | **~$1.15** |

The cached fan-out is what keeps the middle column small; without it the
20-page row roughly triples. These are estimates to size a quota against, not
a forecast — instrument `usage` on every call from day one and replace this
table with measurements.

---

## 10. Jobs, on a half-gigabyte instance

A run takes one to three minutes. The API is one `apps-s-1vcpu-0.5gb` instance
with no worker component and no queue, and adding either is a bigger change
than this feature deserves.

**Jobs live in Postgres and run in-process.**

- `POST /content/sources` creates a source row and a job row, returns
  immediately with the job id.
- An in-process runner claims jobs with `select … for update skip locked`,
  concurrency capped at 2. `skip locked` costs nothing now and is what lets a
  second instance exist later without a rewrite.
- The client polls `GET /content/jobs/:id` every two seconds. Not SSE: polling
  is four lines, survives a reconnect, and matches every other route in the
  app. Revisit if a run ever gets long enough that a spinner is a problem.
- A job that is `running` with no heartbeat for five minutes is reclaimable —
  which is what happens to in-flight work when App Platform restarts the
  instance mid-deploy. The status the user sees is *"Still working"*, and it
  restarts rather than hanging forever.
- Stages are checkpointed: a read that succeeded is not re-run when a build
  call fails. The source map is persisted the moment it lands.

**Retention.** We do not build object storage for this. The original bytes go
to the Anthropic Files API, we keep the `file_id`, and:

- the file is **deleted after 30 days** by a daily sweep, which is also the
  window in which "generate more from this document" works without re-upload;
- we never keep a copy ourselves — the source row holds filename, size, page
  count, a SHA-256, the source map and the job history, and nothing else;
- the upload screen says where the file goes and how long it stays, in one
  sentence, before the file is chosen.

That is a real privacy position and it should be stated as one, not buried.

---

## 11. Data model

One migration. **Number:** the activities spec claims 0013 (`assignments.goal`)
and 0014 (rewards); whichever ships first takes 0013 — this document assumes
**0015** and the number is the only thing that changes if the order flips.

```sql
create table public.content_sources (
  id              uuid primary key,
  owner_user_id   uuid references auth.users (id) on delete cascade,
  learner_id      uuid references public.learners (id) on delete cascade,
  kind            text not null,          -- 'upload' | 'link'
  origin          text not null,          -- filename, or the URL
  mime            text not null,
  bytes           integer not null,
  pages           integer,
  sha256          text not null,
  provider_file_id text,                  -- the Anthropic file_id, null once swept
  file_expires_at timestamptz,
  source_map      jsonb,                  -- §4
  created_at      timestamptz not null default now(),
  constraint content_sources_one_owner
    check ((learner_id is null) <> (owner_user_id is null))
);

create table public.content_jobs (
  id            uuid primary key,
  source_id     uuid not null references public.content_sources (id) on delete cascade,
  status        text not null,            -- queued | reading | building | done | failed
  stage_detail  jsonb not null default '{}'::jsonb,
  claimed_at    timestamptz,
  heartbeat_at  timestamptz,
  attempts      smallint not null default 0,
  error         text,
  usage         jsonb,                    -- tokens and cache hits, per call
  result        jsonb,                    -- ids of what it produced
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index content_jobs_claimable on public.content_jobs (status, created_at)
  where status in ('queued', 'reading', 'building');

alter table public.decks      add column source_id uuid references public.content_sources (id) on delete set null;
alter table public.decks      add column accepted_at timestamptz;
alter table public.word_lists add column source_id uuid references public.content_sources (id) on delete set null;
alter table public.word_lists add column accepted_at timestamptz;
```

`accepted_at is null` **is** the draft state (§8) — no separate status column
to drift out of sync, and the predicate that gates assignment and rewards is
one `is not null`. RLS mirrors `decks` exactly, including the
`content_assigned_to_visible_learner()` path from 0011: a source is readable by
whoever can read the content it produced.

`content_sources.sha256` exists so a second upload of the same file is
recognised and offered the existing result rather than billed again.

---

## 12. API surface

```
POST   /api/content/sources          multipart upload → { sourceId, jobId }
POST   /api/content/sources/link     { url }          → { sourceId, jobId }
GET    /api/content/jobs/:id                          → { status, stage, sourceMap?, result?, error? }
POST   /api/content/sources/:id/build { topicIds, target: { learnerIds } | 'library' }
                                                      → { jobId }
GET    /api/content/sources/:id                       → the source record + what it produced
DELETE /api/content/sources/:id                       → deletes the record and the provider file
POST   /api/library/decks/:id/accept                  → sets accepted_at
```

`/build` is separate from `/sources` because the review screen sits between
them. A single-topic document calls both back to back with no screen in the
middle.

All of it is Zod-validated in `schemas.ts` alongside everything else, and
`ContentSource`, `SourceMap` and `ContentJob` are shared types in
`packages/shared` so the web app and the API describe the same thing.

---

## 13. Web surface

Three screens, one of which is a dialog.

**Load** (`/content/new`) — replaces the "Paste a list instead" affordance in
`DeckEditor` with a wider door: a drop zone, a URL field, and the existing
paste box, all landing in the same place. Paste stays exactly as it is; it is
still the fastest path for six words for tomorrow.

**Working** — the job's own screen, honest about stages (*reading page 12 of
20…*), safe to leave and come back to. Not a modal.

**Review** — the topic list from §4.4, with page chips and counts. One button.

Then the existing `DeckScreen` gains the draft banner: *"Made from
Chapter-7.pdf, not yet checked"* with **Looks right** and **Open the editor**,
and `DeckEditor` gains the per-card source chip and the generated-field
marking that activities spec §6 already calls for.

The learner side gains nothing. A learner sees a set; that it came out of a PDF
is not a fact they need.

---

## 14. Changes by layer

**`packages/shared`**
- `src/rich/**` — moved from `apps/web/src/lib/rich/` (§1), re-exported from
  the old path so no web import changes.
- `src/content.ts` — `SourceMap`, `ContentSource`, `ContentJob`, `JobStatus`.
- `QuizCard` gains the activities-spec §5 optional fields plus `sourcePages`.

**`apps/api`**
- `src/content/acquire.ts` — streaming upload, the fenced fetcher (§2), DOCX
  and PPTX extraction, Files API upload.
- `src/content/read.ts` — stage 2, citations, the source map.
- `src/content/build.ts` — stage 3, cached fan-out, structured output.
- `src/content/validate.ts` — §7, on top of the moved `rich` module.
- `src/content/jobs.ts` — claim, heartbeat, checkpoint, sweep.
- `src/routes/content.ts` — §12, on its own rate-limit scope.
- `src/env.ts` — `ANTHROPIC_API_KEY` (required only when ingestion is enabled,
  the same optional-secret pattern `SUPABASE_SERVICE_ROLE_KEY` uses, so the
  API still boots for a contributor without one).
- dependencies: `@anthropic-ai/sdk`, `mammoth`, an unzip for PPTX.

**`apps/web`**
- `src/screens/content/` — the three screens in §13.
- `src/lib/content/api.ts` — the client and the poll loop.
- `src/lib/plans.ts` — `documentsPerMonth` on `PlanLimits`.
- `DeckScreen` / `DeckEditor` — the draft banner and the provenance chips.

**`.do/app.yaml`** — `ANTHROPIC_API_KEY` as a `SECRET`, `RUN_TIME` scope.

**Migration 0015** — §11.

---

## 15. Build order

**Phase 1 — the upload path, end to end, PDF only.** Acquire → read → build →
validate → draft deck, with polling and the working screen. One format, one
happy path, real cards on the other side. Everything after this is widening.

**Phase 2 — review and acceptance.** The source map's topic list, the review
screen, `accepted_at`, the draft banner, and the gates in §8. Phase 1 is a
demo; this is what makes it shippable.

**Phase 3 — the other formats.** Photos, DOCX, PPTX, CSV, plain text, and the
"print to PDF" guidance. Mostly extraction code and messaging, no new pipeline.

**Phase 4 — links.** The Google export path, the fenced fetcher, the private
document remedy. Ships behind the same job machinery.

**Phase 5 — quota, cost telemetry and the plan gate.** Should not be last, and
will be, because phases 1–4 are the ones anyone can see. The counter and the
`usage` logging should be written in phase 1 even if the gate lands here.

**Phase 6 — generators from documents.** Recognising drill and emitting Tier 0
generator parameters instead of cards. Depends on the activities spec's phase 4
existing at all, and is the highest-quality output in this document when it
does.

---

## 16. Open questions

1. **Does `example` come from the document or from the model?** A sentence
   lifted from the source is better evidence and worse pedagogy (the learner
   has read it). A fresh one is a genuine transfer prompt and is invented.
   Recommendation: fresh, marked generated, with the source sentence kept in
   `hint` where one exists.
2. **What happens on a re-upload of the same chapter next term?** The `sha256`
   catches an identical file, but "Chapter 7, revised" is a different file with
   the same content, and merging into the existing deck preserves mastery while
   replacing it destroys it. Unspecified here, and it matters the second year a
   family uses the product.
3. **Google OAuth, or never?** §2 defers it. The decision should be made on a
   measured private-link failure rate, and it should be made — leaving it open
   indefinitely means a permanently mediocre link path.
4. **Does a teacher uploading their own copyrighted textbook create a problem
   we have to answer for?** Generated practice from material a user supplies
   for their own class is ordinary use, but the terms should say what we do and
   do not keep (§10 makes that answer easy), and the 30-day retention line is
   most of the answer.
5. **Should the read stage ever say "this is better as a spelling list than a
   quiz deck" and switch subject?** It has the information. It also means a
   parent who uploaded a vocabulary sheet gets an activity set they didn't ask
   for. Recommendation: propose it in the review screen, never silently.
6. **Batch API for the bulk case** — worth 50% on a "whole textbook" run, and
   an entirely separate code path with its own polling. Only if a paying user
   asks for it twice.

---

## 17. How we know it worked

- **Actions to first round.** Upload to a learner practising, counted in
  clicks. Target: three, matching the activities spec's budget. If a document
  costs more setup than a paste, this feature has failed at its only job.
- **Acceptance rate without edits.** Share of generated sets accepted whole.
  Below ~70% and the generation is not good enough to be a front door.
- **Cards dropped in validation.** Should be under 2%. A rising number means
  the grammar in the prompt has drifted from the parser.
- **Capability coverage on arrival.** Share of generated sets where every
  activity in the matrix reads `ready`. This is the number that says
  enrichment-on-write worked, and it should be near 100%.
- **Cache read share** across build calls. Should be above 80%; anything less
  is money going out for nothing.
- **Cost per accepted set**, measured not estimated, against the quota in §9.
- **Documents per Pro user per month.** If the median is one, this is a
  conversion feature and not a retention one, and the quota is the wrong shape.
