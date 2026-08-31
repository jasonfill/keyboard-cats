// What the marketing site says, kept apart from how it is laid out.
//
// Two reasons this is a module rather than JSX scattered through six screens.
//
// **A claim is made once.** "Only unaided spelling counts" appears on the front
// page, on How it works and on the teacher's page, and three hand-written
// versions of one sentence is how a product ends up describing itself three
// slightly different ways.
//
// **The lists that can be derived are derived.** The activity table quotes
// `ACTIVITIES` and `MODES` directly, so an activity added to the app appears on
// the site and cannot appear there with the wrong rule beside it — the same
// move as quoting prices from `@whizzo/shared/billing` rather than typing them
// into a page.

import { MODES } from '../../lib/quiz/session'
import { ACTIVITIES } from '../../lib/spelling/activities'

export interface Subject {
  emoji: string
  title: string
  body: string
  points: string[]
}

export const SUBJECTS: Subject[] = [
  {
    emoji: '🔤',
    title: 'Spelling',
    body: 'Adaptive spelling from 2nd through 8th grade, on a curriculum of 420 words in 42 rule-based lists.',
    points: [
      'Finds the level in a handful of words',
      'Six activities, one honest score',
      'Every word carries its own review date',
    ],
  },
  {
    emoji: '⌨️',
    title: 'Typing',
    body: 'The full touch-typing course: home row to numbers, guided lessons, arcade rounds and a collection to build.',
    points: [
      'Hands and keyboard on screen while you learn',
      'Speed and accuracy tracked key by key',
      'Ten worlds to choose from',
    ],
  },
  {
    emoji: '🃏',
    title: 'Study decks',
    body: 'Everything else — vocabulary, state capitals, formulas, French verbs, cell biology. Paste a list and study it five ways.',
    points: [
      'Maths, fractions and figures on a card',
      'Free recall of a whole set, machine-checked',
      'The same spaced review as spelling',
    ],
  },
]

/** The engine, in the three claims that make it different from a shuffle. */
export const ENGINE_STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'One scale for learners and words',
    body: 'Ability and word difficulty sit on the same axis — roughly school grade — so the model can predict how likely a learner is to get a word they have never seen. Nothing here is configured by hand, and nothing waits for a placement test that a child has to sit through.',
  },
  {
    title: 'Only unaided work counts',
    body: 'Unscrambling letters, filling blanks and picking from four options are good practice, and none of them move the level. Ask for a hint and that word stops counting. It is the one rule that keeps the number honest — and the reason the number is worth reading.',
  },
  {
    title: 'Items come back on their own schedule',
    body: 'Every word and every card carries its own review state. Right, and the gap grows 1 → 2 → 4 → 8 → 16 → 32 → 60 days. Wrong, and it is due again immediately — in the same sitting, while the moment to fix it is still there.',
  },
]

/** What a grown-up gets, said as four jobs rather than four features. */
export const GROWNUP: Array<{ title: string; body: string }> = [
  {
    title: 'Add each child to your account',
    body: 'A child gets a full record without ever handing over an email address. They sign in on their own device with a code and a secret number you set.',
  },
  {
    title: 'Set work, and see it done',
    body: 'Assign a spelling list, a deck or a typing lesson to one child or to twenty at once. A task is closed by a finished session the app graded — never by a child saying so.',
  },
  {
    title: 'Progress you can actually read',
    body: 'Level by grade, accuracy over checked answers, every word missed, what is about to slip out of memory, and the sessions behind each number.',
  },
  {
    title: 'One product, every kind of grown-up',
    body: 'Parents, tutors and teachers use the same screens and the same permissions. What differs between them is wording and scale, not capability.',
  },
]

/** The evidence story — the part most practice apps cannot say at all. */
export const EVIDENCE: Array<{ title: string; body: string }> = [
  {
    title: 'The summary is derived, not asserted',
    body: 'A round arrives as answers plus the app’s summary of them. The server recomputes the counts from the answers and stores its own, so a score can never disagree with the work behind it.',
  },
  {
    title: 'Self-grading is labelled as such',
    body: 'Flashcards are self-graded by construction, so those answers are recorded as unchecked whatever the round claims. A history screen that says "0 of 14 checked" is telling you something true.',
  },
  {
    title: 'The record is append-only',
    body: 'A child signed into their own account can add to their history and can never revise it. Erasing progress is the owner’s to do, and it reopens the tasks those rounds had closed.',
  },
  {
    title: 'Done means done',
    body: 'A task is closed in the same transaction that records the round that closed it, and stores that round’s id — so "finished" always has the answers attached, and a score bar is measured against checked answers only.',
  },
]

/** Every activity in the suite, and whether it moves the level. */
export interface ActivityRow {
  subject: string
  emoji: string
  name: string
  blurb: string
  counts: boolean
  note?: string
}

export const ACTIVITY_TABLE: ActivityRow[] = [
  ...ACTIVITIES.map((activity) => ({
    subject: 'Spelling',
    emoji: activity.emoji,
    name: activity.name,
    blurb: activity.blurb,
    counts: activity.isTest,
    note: activity.unaided ? 'unaided — unless a hint is taken' : undefined,
  })),
  ...MODES.map((mode) => ({
    subject: 'Study decks',
    emoji: mode.emoji,
    name: mode.name,
    blurb: mode.blurb,
    counts: mode.isTest,
    note: mode.id === 'flashcards' ? 'self-graded, so never counted' : undefined,
  })),
]

/** The questions people actually ask before they sign up. */
export const CORE_FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Does my child need an email address?',
    a: 'No. You add them to your account, and they sign in with a code and a secret number. Anyone who tells us they are under 13 is sent to fetch a grown-up rather than shown a sign-up form.',
  },
  {
    q: 'Why do I have to make an account to try it?',
    a: 'Practice is only worth anything if it is attributed to a learner: the level, the review schedule and the report all hang off one record. Signing in first is what makes a session count toward something. It is free and takes a minute.',
  },
  {
    q: 'Is the curriculum really free?',
    a: 'Yes, permanently. A spelling app that locks fourth grade behind a card number is not much use to the kid who needs fourth grade. Paying covers the reporting, the rewards and the unlimited content — the things a grown-up wants, not the things a learner needs.',
  },
  {
    q: 'What do you do with the data?',
    a: 'We store what is needed to track learning progress and nothing else. No ads, no third-party trackers, and you can export the lot as CSV or delete it outright.',
  },
  {
    q: 'What age is it for?',
    a: 'The spelling curriculum runs 2nd through 8th grade. Study decks have no ceiling — a sixteen-year-old revising biology is a normal use of this. The app changes its register with the learner’s grade, so an older student is not congratulated by a cartoon.',
  },
  {
    q: 'Can more than one grown-up see a child?',
    a: 'Yes. A parent owns the child’s record and can connect a tutor or a teacher to it. The family chooses which children a connection covers, can see who they are letting in before they let them in, and can disconnect at any time.',
  },
  {
    q: 'Does it work on a tablet or a phone?',
    a: 'It runs in the browser on anything — no install, no app store. Typing lessons want a real keyboard; spelling and decks are fine on a tablet.',
  },
  {
    q: 'Can I pay for it yet?',
    a: 'Not yet. Payments are not switched on, so every account is free today and the prices on the pricing page are what coverage will cost when they are. Nothing is being charged in the meantime.',
  },
]
