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
  correct: boolean
  responseMs: number | null
  hintsUsed: number
  difficulty: number
  /** What the learner actually typed, kept so mistakes can be reviewed. */
  given: string | null
  at: number
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
