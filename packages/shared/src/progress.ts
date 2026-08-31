// Types shared by every learning objective in the suite. Adding a subject means
// adding a string here, not a new set of tables.

export type Subject = 'spelling' | 'typing' | 'quiz'

export const SUBJECTS: Subject[] = ['spelling', 'typing', 'quiz']

/** ISO calendar day, e.g. '2026-08-19'. */
export type DayString = string

/**
 * The adaptive engine's persistent state for one learner in one subject.
 * `ability` and item `difficulty` live on the same scale so they can be
 * compared directly; for spelling that scale is roughly "school grade".
 */
export interface SkillState {
  subject: Subject
  ability: number
  abilitySd: number
  levelIndex: number
  placed: boolean
  totalAttempts: number
  totalCorrect: number
  streakDays: number
  bestStreakDays: number
  lastActiveOn: DayString | null
  settings: Record<string, unknown>
}

/** What the learner knows about one word (or one key), and when to show it next. */
export interface ItemMastery {
  subject: Subject
  itemKey: string
  listId: string | null
  difficulty: number
  /** 0..1, recency-weighted share of graded attempts answered correctly. */
  mastery: number
  reps: number
  lapses: number
  correctStreak: number
  totalAttempts: number
  totalCorrect: number
  intervalDays: number
  dueOn: DayString | null
  firstSeenAt: number
  lastSeenAt: number
}

/** One graded or practised item. The append-only record everything derives from. */
export interface Attempt {
  subject: Subject
  itemKey: string
  activity: string
  /** Only test-quality attempts (no hints, spelled from scratch) move ability. */
  isTest: boolean
  /**
   * Did the system check this answer, or did the learner tell us how they did?
   *
   * Flashcard self-grades are the only unverified attempts in the app. The
   * distinction is orthogonal to `isTest` (which only means "no hints were
   * shown") and it has to survive all the way to the database, because
   * anything that hands out a reward has to be able to ask for evidence
   * rather than a claim.
   */
  verified: boolean
  correct: boolean
  responseMs: number | null
  hintsUsed: number
  difficulty: number
  /** What the learner actually typed, kept so mistakes can be reviewed. */
  given: string | null
  at: number
  /** The round this belongs to. Set by whoever stores it, not by the caller. */
  sessionId?: string | null
}

export interface SessionRecord {
  id: string
  subject: Subject
  activity: string
  listId: string | null
  isTest: boolean
  itemsTotal: number
  itemsCorrect: number
  accuracy: number
  score: number
  wpm: number | null
  durationMs: number
  abilityBefore: number | null
  abilityAfter: number | null
  meta: Record<string, unknown>
  startedAt: number
  endedAt: number
  /**
   * Where this session's counts came from. Derived, never sent by a client:
   * whoever stores the row works it out from the attempts that came with it.
   *
   *   'attempts' — counts recomputed from the submitted attempts
   *   'client'   — no attempts accompanied the session, so the summary is the
   *                finest grain there is (typing rounds count keystrokes)
   *   'legacy'   — recorded before provenance was tracked
   */
  evidence?: SessionEvidenceKind
  /** Of the distinct items here, how many were system-checked rather than self-graded. */
  verifiedItemsTotal?: number
  verifiedItemsCorrect?: number
}

export interface ListProgress {
  subject: Subject
  listId: string
  plays: number
  testsTaken: number
  bestScore: number
  bestAccuracy: number
  stars: number
  masteredAt: number | null
}

export interface UnlockedAchievement {
  achievementId: string
  subject: string
  unlockedAt: number
}

export interface HighScoreRow {
  id: string
  subject: Subject
  mode: string
  score: number
  wpm: number | null
  accuracy: number | null
  createdAt: number
}

export interface DailyActivityRow {
  day: DayString
  subject: Subject
  seconds: number
  items: number
  correct: number
  sessions: number
}

/**
 * One side-by-side pair on a study deck. `term` is the prompt side and
 * `definition` the answer side, but every activity can run the pair backwards,
 * so neither is privileged beyond which one shows first.
 */
export interface QuizCard {
  id: string
  term: string
  definition: string
  hint: string | null
  /**
   * Roughly 1-5, on the same scale as the learner's quiz ability. Derived from
   * the answer's shape when a deck is saved rather than asked of the author,
   * because nobody making a deck at 10pm wants to rate 40 cards by hand.
   */
  difficulty: number
}

/**
 * A study set. Decks are content, not progress: what the learner *knows* about
 * each card lives in `mastery` under the item key `deckId:cardId`, which is why
 * a deck can be edited without resetting anything the learner has earned.
 */
export interface QuizDeck {
  id: string
  title: string
  description: string
  tags: string[]
  cards: QuizCard[]
  /** Starter decks ship with the app and are copied, not edited, in place. */
  source: 'user' | 'starter'
  /** What to call each side, e.g. 'Spanish' / 'English'. Purely cosmetic. */
  termLabel: string
  definitionLabel: string
  createdAt: number
  updatedAt: number
}

export interface CustomWordList {
  id: string
  title: string
  subject: Subject
  grade: number | null
  words: Array<{ w: string; s: string }>
  updatedAt: number
}

/** Everything the app needs in memory to render and to plan a session. */
export interface ProgressSnapshot {
  skills: Record<string, SkillState>
  mastery: Record<string, ItemMastery> // key: `${subject}:${itemKey}`
  lists: Record<string, ListProgress> // key: `${subject}:${listId}`
  achievements: UnlockedAchievement[]
  highScores: HighScoreRow[]
  daily: DailyActivityRow[]
  sessions: SessionRecord[] // most recent first, capped
  customLists: CustomWordList[]
  decks: QuizDeck[]
}

export function masteryKey(subject: Subject, itemKey: string): string {
  return `${subject}:${itemKey}`
}

export function listKey(subject: Subject, listId: string): string {
  return `${subject}:${listId}`
}

/**
 * The mastery key for one card. Deck-scoped on purpose: the same term on two
 * different decks is two different things to learn, and merging them would let
 * a card the learner has never seen arrive pre-mastered.
 */
export function cardKey(deckId: string, cardId: string): string {
  return `${deckId}:${cardId}`
}

export function emptySnapshot(): ProgressSnapshot {
  return {
    skills: {},
    mastery: {},
    lists: {},
    achievements: [],
    highScores: [],
    daily: [],
    sessions: [],
    customLists: [],
    decks: [],
  }
}

export function defaultSkillState(subject: Subject): SkillState {
  return {
    subject,
    // Spelling starts the learner at second grade, as requested; typing and
    // quiz have no grade band so they just track a relative ability number.
    // Quiz starts mid-scale because deck difficulty is relative to the deck.
    ability: subject === 'spelling' ? 2.0 : subject === 'quiz' ? 2.0 : 1.0,
    abilitySd: 1.2,
    levelIndex: 0,
    placed: false,
    totalAttempts: 0,
    totalCorrect: 0,
    streakDays: 0,
    bestStreakDays: 0,
    lastActiveOn: null,
    settings: {},
  }
}

export function todayString(now: Date = new Date()): DayString {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(day: DayString, days: number): DayString {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + Math.round(days))
  return todayString(date)
}

export function daysBetween(from: DayString, to: DayString): number {
  const [ay, am, ad] = from.split('-').map(Number)
  const [by, bm, bd] = to.split('-').map(Number)
  const a = Date.UTC(ay, am - 1, ad)
  const b = Date.UTC(by, bm - 1, bd)
  return Math.round((b - a) / 86400000)
}

/**
 * One atomic unit of progress, produced at the end of a round of practice.
 *
 * This is a wire shape as well as a domain shape: the web app posts one of
 * these to the API, which is the only thing that turns it into rows.
 */
export interface ProgressChange {
  skill?: SkillState
  mastery?: ItemMastery[]
  session?: SessionRecord
  attempts?: Attempt[]
  list?: ListProgress
  achievements?: UnlockedAchievement[]
  highScore?: HighScoreRow
  daily?: { subject: Subject; seconds: number; items: number; correct: number }
  /** Full replacement of the learner's custom lists. */
  customLists?: CustomWordList[]
  /** Full replacement of the learner's study decks. */
  decks?: QuizDeck[]
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------
//
// A session summary is a convenience. The attempts are the record. These two
// helpers are the single definition of how you get from one to the other, and
// they live here because both sides need to agree: the API applies them to
// every round a signed-in learner posts, and guest storage applies them to
// every round played without an account.

export type SessionEvidenceKind = 'attempts' | 'client' | 'legacy'

/**
 * Modes where the learner grades themselves.
 *
 * Whether an answer was checked is a property of the mode it was answered in,
 * not something a caller gets to assert — so this is applied server-side to
 * every attempt that arrives, and a claim of `verified: true` on a self-graded
 * mode is corrected rather than believed.
 */
export const SELF_GRADED_ACTIVITIES: readonly string[] = ['flashcards']

export function isSelfGraded(activity: string): boolean {
  return SELF_GRADED_ACTIVITIES.includes(activity)
}

/** Apply the mode rule to one attempt, so `verified` reflects how it was answered. */
export function withVerifiedFlag(attempt: Attempt): Attempt {
  const verified = attempt.verified && !isSelfGraded(attempt.activity)
  return verified === attempt.verified ? attempt : { ...attempt, verified }
}

export interface DerivedSessionCounts {
  itemsTotal: number
  itemsCorrect: number
  accuracy: number
  verifiedItemsTotal: number
  verifiedItemsCorrect: number
  evidence: SessionEvidenceKind
}

/**
 * Recompute a session's counts from the attempts it was played with.
 *
 * Scored on the *first* attempt at each item, in the order they were played.
 * A round can ask the same card more than once — a missed card comes back
 * before the round is out — and a learner who goes back over something they
 * missed should not be scored worse than one who never returned to it.
 *
 * Returns null when there are no attempts to derive from, which is a real
 * case rather than an error: a typing round's items are keystrokes and its
 * summary is already the finest grain available.
 */
export function deriveSessionCounts(attempts: Attempt[]): DerivedSessionCounts | null {
  if (!attempts.length) return null

  const first = new Map<string, Attempt>()
  for (const attempt of attempts) {
    const key = masteryKey(attempt.subject, attempt.itemKey)
    if (!first.has(key)) first.set(key, withVerifiedFlag(attempt))
  }

  const firsts = [...first.values()]
  const itemsTotal = firsts.length
  const itemsCorrect = firsts.filter((a) => a.correct).length
  const verified = firsts.filter((a) => a.verified)

  return {
    itemsTotal,
    itemsCorrect,
    accuracy: Math.round((itemsCorrect / itemsTotal) * 100),
    verifiedItemsTotal: verified.length,
    verifiedItemsCorrect: verified.filter((a) => a.correct).length,
    evidence: 'attempts',
  }
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------
//
// Work a grown-up sets for a learner. A task names one piece of work and is
// closed by the round that satisfied it — never by anyone ticking it off — so
// `sessionId` on a finished task is the evidence, and the history screen can
// open it.

export type AssignmentStatus = 'open' | 'done' | 'cancelled'

/**
 * One learner's copy of a piece of work.
 *
 * Flattened for the client: the definition lives on the set and the state on
 * the row, but nothing above the API cares — what a task list wants is one
 * object per line it draws. `setId` is what makes two children's copies of the
 * same work recognisable as the same work.
 */
export interface Assignment {
  id: string
  setId: string
  learnerId: string
  createdBy: string | null
  subject: Subject
  /** Quiz mode, spelling activity, or 'lesson' for typing. */
  activity: string
  /** Deck, spelling list, or typing lesson. Null lets the activity choose. */
  targetId: string | null
  size: number | null
  title: string
  note: string | null
  /**
   * An optional bar to clear, judged on answers the app checked rather than on
   * the headline score. A self-graded mode has no checked answers and so can
   * never clear one — which is why the UI only offers this on graded work.
   */
  minAccuracy: number | null
  dueOn: DayString | null
  sortOrder: number
  status: AssignmentStatus
  completedAt: number | null
  /** The round that closed this task. Always set when status is 'done'. */
  sessionId: string | null
  createdAt: number
}

/**
 * One piece of work and everyone it was given to.
 *
 * The author's view — a tutor asking "who has done this yet?". `learners` holds
 * only the rows the caller is allowed to see, so a parent who shares work with
 * another family sees their own child on it and nobody else's.
 */
export interface AssignmentSetSummary {
  setId: string
  subject: Subject
  activity: string
  targetId: string | null
  title: string
  note: string | null
  minAccuracy: number | null
  dueOn: DayString | null
  createdAt: number
  learners: Array<{
    assignmentId: string
    learnerId: string
    displayName: string
    avatarEmoji: string
    status: AssignmentStatus
    completedAt: number | null
    sessionId: string | null
  }>
}

/** What a grown-up sends to set a task. Everything else is decided here or by evidence. */
export interface AssignmentDraft {
  subject: Subject
  activity: string
  targetId?: string | null
  size?: number | null
  title: string
  note?: string | null
  minAccuracy?: number | null
  dueOn?: DayString | null
  sortOrder?: number
}

/** One child's line on the family dashboard. */
export interface LearnerOverview {
  learnerId: string
  displayName: string
  avatarEmoji: string
  /** Tasks still to do, and how many of those are past their due date. */
  openAssignments: number
  overdueAssignments: number
  /** Tasks finished in the last week. */
  doneThisWeek: number
  /** The most recent round of any kind, for "last seen practising". */
  lastActiveAt: number | null
  /** Practice in the last seven days. */
  minutesThisWeek: number
  itemsThisWeek: number
  /** Accuracy over the last seven days, counting only answers the app checked. */
  verifiedAccuracyThisWeek: number | null
  currentStreakDays: number
}
