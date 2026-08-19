// The storage boundary. Everything above this line works with a
// ProgressSnapshot and a ProgressChange; everything below is either
// localStorage (guest play) or Supabase (a signed-in learner).

import {
  emptySnapshot,
  listKey,
  masteryKey,
  todayString,
  type Attempt,
  type CustomWordList,
  type DailyActivityRow,
  type HighScoreRow,
  type ItemMastery,
  type ListProgress,
  type ProgressSnapshot,
  type SessionRecord,
  type SkillState,
  type Subject,
  type UnlockedAchievement,
} from './types'

/** One atomic unit of progress, produced at the end of a round of practice. */
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
}

export interface ProgressRepo {
  readonly kind: 'local' | 'cloud'
  load(): Promise<ProgressSnapshot>
  persist(change: ProgressChange): Promise<void>
  reset(): Promise<void>
}

/** How many recent sessions and attempts we keep in memory / in localStorage. */
export const SESSION_HISTORY_LIMIT = 200

/**
 * Fold a change into a snapshot. Pure, and used by both repos so the in-memory
 * view is identical whether the learner is signed in or not.
 */
export function applyChange(
  snapshot: ProgressSnapshot,
  change: ProgressChange,
  now = Date.now(),
): ProgressSnapshot {
  const next: ProgressSnapshot = { ...snapshot }

  if (change.skill) {
    next.skills = { ...next.skills, [change.skill.subject]: change.skill }
  }

  if (change.mastery?.length) {
    const mastery = { ...next.mastery }
    for (const item of change.mastery) {
      mastery[masteryKey(item.subject, item.itemKey)] = item
    }
    next.mastery = mastery
  }

  if (change.list) {
    next.lists = { ...next.lists, [listKey(change.list.subject, change.list.listId)]: change.list }
  }

  if (change.session) {
    next.sessions = [change.session, ...next.sessions].slice(0, SESSION_HISTORY_LIMIT)
  }

  if (change.achievements?.length) {
    const known = new Set(next.achievements.map((a) => a.achievementId))
    const added = change.achievements.filter((a) => !known.has(a.achievementId))
    if (added.length) next.achievements = [...next.achievements, ...added]
  }

  if (change.highScore) {
    next.highScores = [...next.highScores, change.highScore]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
  }

  if (change.daily) {
    const day = todayString(new Date(now))
    const idx = next.daily.findIndex((d) => d.day === day && d.subject === change.daily!.subject)
    const row: DailyActivityRow =
      idx >= 0
        ? { ...next.daily[idx] }
        : { day, subject: change.daily.subject, seconds: 0, items: 0, correct: 0, sessions: 0 }
    row.seconds += Math.max(0, change.daily.seconds)
    row.items += Math.max(0, change.daily.items)
    row.correct += Math.max(0, change.daily.correct)
    row.sessions += 1
    next.daily = idx >= 0 ? next.daily.map((d, i) => (i === idx ? row : d)) : [...next.daily, row]
  }

  if (change.customLists) {
    next.customLists = change.customLists
  }

  return next
}

// ---------------------------------------------------------------------------
// Guest -> account merge
// ---------------------------------------------------------------------------

function betterSkill(a: SkillState | undefined, b: SkillState | undefined): SkillState | undefined {
  if (!a) return b
  if (!b) return a
  // Take the more experienced record, then keep the best of each counter so a
  // learner never loses a level or a streak by signing in.
  const base = a.totalAttempts >= b.totalAttempts ? a : b
  return {
    ...base,
    levelIndex: Math.max(a.levelIndex, b.levelIndex),
    ability: Math.max(a.ability, b.ability),
    totalAttempts: a.totalAttempts + b.totalAttempts,
    totalCorrect: a.totalCorrect + b.totalCorrect,
    streakDays: Math.max(a.streakDays, b.streakDays),
    bestStreakDays: Math.max(a.bestStreakDays, b.bestStreakDays),
    placed: a.placed || b.placed,
    lastActiveOn:
      (a.lastActiveOn ?? '') > (b.lastActiveOn ?? '') ? a.lastActiveOn : b.lastActiveOn,
  }
}

function betterMastery(a: ItemMastery, b: ItemMastery): ItemMastery {
  const newer = a.lastSeenAt >= b.lastSeenAt ? a : b
  const older = newer === a ? b : a
  return {
    ...newer,
    totalAttempts: a.totalAttempts + b.totalAttempts,
    totalCorrect: a.totalCorrect + b.totalCorrect,
    reps: a.reps + b.reps,
    lapses: Math.max(a.lapses, b.lapses),
    mastery: newer.mastery, // the more recent evidence wins
    firstSeenAt: Math.min(a.firstSeenAt, b.firstSeenAt),
    // The sooner of the two due dates: reviewing early is harmless, late is not.
    dueOn:
      newer.dueOn && older.dueOn
        ? newer.dueOn < older.dueOn
          ? newer.dueOn
          : older.dueOn
        : (newer.dueOn ?? older.dueOn),
  }
}

function betterList(a: ListProgress, b: ListProgress): ListProgress {
  return {
    ...a,
    plays: a.plays + b.plays,
    testsTaken: a.testsTaken + b.testsTaken,
    bestScore: Math.max(a.bestScore, b.bestScore),
    bestAccuracy: Math.max(a.bestAccuracy, b.bestAccuracy),
    stars: Math.max(a.stars, b.stars),
    masteredAt: a.masteredAt ?? b.masteredAt,
  }
}

/**
 * Merge guest progress (local) into cloud progress. Conservative on purpose:
 * counters add, bests win, and nothing is ever thrown away silently.
 */
export function mergeSnapshots(
  cloud: ProgressSnapshot,
  local: ProgressSnapshot,
): ProgressSnapshot {
  const out = emptySnapshot()

  const subjects = new Set([...Object.keys(cloud.skills), ...Object.keys(local.skills)])
  for (const s of subjects) {
    const merged = betterSkill(cloud.skills[s], local.skills[s])
    if (merged) out.skills[s] = merged
  }

  out.mastery = { ...cloud.mastery }
  for (const [key, item] of Object.entries(local.mastery)) {
    out.mastery[key] = out.mastery[key] ? betterMastery(out.mastery[key], item) : item
  }

  out.lists = { ...cloud.lists }
  for (const [key, list] of Object.entries(local.lists)) {
    out.lists[key] = out.lists[key] ? betterList(out.lists[key], list) : list
  }

  const seenAchievements = new Set<string>()
  out.achievements = [...cloud.achievements, ...local.achievements].filter((a) => {
    if (seenAchievements.has(a.achievementId)) return false
    seenAchievements.add(a.achievementId)
    return true
  })

  out.highScores = [...cloud.highScores, ...local.highScores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)

  const dailyIndex = new Map<string, DailyActivityRow>()
  for (const row of [...cloud.daily, ...local.daily]) {
    const key = `${row.day}:${row.subject}`
    const existing = dailyIndex.get(key)
    dailyIndex.set(
      key,
      existing
        ? {
            ...existing,
            seconds: existing.seconds + row.seconds,
            items: existing.items + row.items,
            correct: existing.correct + row.correct,
            sessions: existing.sessions + row.sessions,
          }
        : row,
    )
  }
  out.daily = [...dailyIndex.values()].sort((a, b) => (a.day < b.day ? 1 : -1))

  const seenSessions = new Set<string>()
  out.sessions = [...cloud.sessions, ...local.sessions]
    .filter((s) => {
      if (seenSessions.has(s.id)) return false
      seenSessions.add(s.id)
      return true
    })
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, SESSION_HISTORY_LIMIT)

  out.customLists = [...cloud.customLists, ...local.customLists]

  return out
}

export type { Attempt, ProgressSnapshot, SessionRecord }
