// Builds the word list for one round of spelling practice.
//
// Two modes:
//   * 'list'     — the learner picked a specific unit, SpellingCity style.
//   * 'adaptive' — the app chooses. This is the mode the whole system is built
//                  around: due reviews first, then unfinished words from the
//                  current grade, then a few stretch words when the learner is
//                  ready for them. Every choice is driven by that learner's own
//                  recorded attempts.

import {
  ALL_WORDS,
  GRADES,
  gradeAt,
  wordsInGrade,
  wordsInList,
  type CurriculumWord,
} from '../../data/spelling'
import {
  expectedCorrect,
  isDue,
  MASTERED_THRESHOLD,
  masteryBand,
  overdueBy,
} from '../adaptive'
import {
  masteryKey,
  todayString,
  type ItemMastery,
  type ProgressSnapshot,
  type SkillState,
} from '../progress/types'

export type SessionMode = 'adaptive' | 'list' | 'custom' | 'placement'

/** Why a word was chosen — surfaced in the UI so practice never feels arbitrary. */
export type WordReason = 'review' | 'relearn' | 'new' | 'stretch' | 'list' | 'placement'

export interface PlannedWord extends CurriculumWord {
  reason: WordReason
  mastery: ItemMastery | undefined
}

export interface PlanOptions {
  mode: SessionMode
  listId?: string
  customWords?: CurriculumWord[]
  size?: number
  today?: string
  /** Injectable for deterministic tests. */
  shuffle?: <T>(items: T[]) => T[]
}

export const DEFAULT_SESSION_SIZE = 10

function defaultShuffle<T>(items: T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function masteryFor(
  snapshot: ProgressSnapshot,
  word: CurriculumWord,
): ItemMastery | undefined {
  return snapshot.mastery[masteryKey('spelling', word.w)]
}

/**
 * Placement check: a short ladder that spans the whole curriculum so a strong
 * speller is not stuck grinding second grade. Words are sampled at widening
 * difficulty rather than in list order.
 */
export function planPlacement(size = 12, shuffle = defaultShuffle): PlannedWord[] {
  const perGrade = Math.max(1, Math.round(size / GRADES.length))
  const picks: CurriculumWord[] = []
  for (const grade of GRADES) {
    const pool = shuffle(wordsInGrade(grade.grade))
    picks.push(...pool.slice(0, perGrade))
  }
  return picks
    .sort((a, b) => a.difficulty - b.difficulty)
    .slice(0, size)
    .map((w) => ({ ...w, reason: 'placement' as const, mastery: undefined }))
}

/**
 * The adaptive mix. Proportions are capped rather than fixed so a learner with
 * nothing due still gets a full session of new material, and a learner
 * returning after two weeks gets mostly review.
 */
export function planSession(
  snapshot: ProgressSnapshot,
  state: SkillState,
  opts: PlanOptions,
): PlannedWord[] {
  const size = opts.size ?? DEFAULT_SESSION_SIZE
  const today = opts.today ?? todayString()
  const shuffle = opts.shuffle ?? defaultShuffle

  if (opts.mode === 'placement') return planPlacement(size, shuffle)

  if (opts.mode === 'list' && opts.listId) {
    return shuffle(wordsInList(opts.listId)).map((w) => ({
      ...w,
      reason: 'list' as const,
      mastery: masteryFor(snapshot, w),
    }))
  }

  if (opts.mode === 'custom' && opts.customWords) {
    return shuffle(opts.customWords).map((w) => ({
      ...w,
      reason: 'list' as const,
      mastery: masteryFor(snapshot, w),
    }))
  }

  const grade = gradeAt(state.levelIndex)
  const nextGrade = GRADES[Math.min(GRADES.length - 1, state.levelIndex + 1)]
  const chosen: PlannedWord[] = []
  const used = new Set<string>()

  const take = (word: CurriculumWord, reason: WordReason) => {
    if (used.has(word.w) || chosen.length >= size) return
    used.add(word.w)
    chosen.push({ ...word, reason, mastery: masteryFor(snapshot, word) })
  }

  // 1. Words the learner has actually missed before and that are due again.
  //    Most overdue first, and words with lapses jump the queue.
  const dueReviews = ALL_WORDS.map((w) => ({ w, m: masteryFor(snapshot, w) }))
    .filter((x): x is { w: CurriculumWord; m: ItemMastery } => !!x.m && isDue(x.m, today))
    .sort((a, b) => {
      const lapse = b.m.lapses - a.m.lapses
      if (lapse !== 0) return lapse
      return overdueBy(b.m, today) - overdueBy(a.m, today)
    })

  const relearn = dueReviews.filter((x) => x.m.mastery < MASTERED_THRESHOLD)
  const maintain = dueReviews.filter((x) => x.m.mastery >= MASTERED_THRESHOLD)

  // Missed words get up to 40% of the session; consolidated words up to a fifth.
  // Review is deliberately capped: a round made mostly of words the learner has
  // already got wrong is accurate but demoralising.
  relearn.slice(0, Math.ceil(size * 0.4)).forEach((x) => take(x.w, 'relearn'))
  maintain.slice(0, Math.ceil(size * 0.2)).forEach((x) => take(x.w, 'review'))

  // 2. Fill with unfinished words from the current grade, most winnable first.
  //    Note what this does and does not promise: within a single grade band
  //    every word sits within about a point of the learner's ability, so first
  //    exposure lands nearer half right than four-fifths. That is the same shape
  //    as a Monday pretest, and it is the point — the words you miss are the
  //    words the list is for. The success rate climbs on review, which is where
  //    the target below actually bites.
  const gradePool = wordsInGrade(grade.grade).filter(
    (w) => masteryBand(masteryFor(snapshot, w)) !== 'mastered',
  )
  shuffleNearTarget(gradePool, state.ability, shuffle).forEach((w) => take(w, 'new'))

  // 3. If the learner is running hot, salt in a couple of harder words. Target
  //    around a 75% chance of success — hard enough to learn from, not to sink.
  if (chosen.length < size || state.ability >= grade.grade + 0.4) {
    const stretch = wordsInGrade(nextGrade.grade)
      .filter((w) => masteryBand(masteryFor(snapshot, w)) !== 'mastered')
      .map((w) => ({ w, p: expectedCorrect(state.ability, w.difficulty) }))
      .filter((x) => x.p >= 0.45)
      .sort((a, b) => Math.abs(0.75 - a.p) - Math.abs(0.75 - b.p))
      .slice(0, Math.max(1, Math.round(size * 0.2)))
    stretch.forEach((x) => take(x.w, 'stretch'))
  }

  // 4. Last resort — the learner has mastered everything in reach, so revisit
  //    the least recently seen words rather than ending the session short.
  if (chosen.length < size) {
    const fallback = wordsInGrade(grade.grade)
      .map((w) => ({ w, m: masteryFor(snapshot, w) }))
      .sort((a, b) => (a.m?.lastSeenAt ?? 0) - (b.m?.lastSeenAt ?? 0))
    fallback.forEach((x) => take(x.w, 'review'))
  }

  // Interleave so review and new material alternate instead of clumping.
  return interleave(chosen)
}

/**
 * The success rate practice aims for on words the learner has already met.
 * Used to order candidates most-winnable first and to pick stretch words.
 */
export const TARGET_SUCCESS = 0.8

/**
 * Order words by how close their predicted success rate is to the target,
 * randomising within a band so two sessions in a row are not identical.
 */
function shuffleNearTarget(
  words: CurriculumWord[],
  ability: number,
  shuffle: <T>(items: T[]) => T[],
): CurriculumWord[] {
  const buckets = new Map<number, CurriculumWord[]>()
  for (const w of words) {
    const gap = Math.abs(expectedCorrect(ability, w.difficulty) - TARGET_SUCCESS)
    const bucket = Math.round(gap * 20) / 20
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), w])
  }
  return [...buckets.keys()]
    .sort((a, b) => a - b)
    .flatMap((k) => shuffle(buckets.get(k)!))
}

/** Alternates reasons so a session does not open with six review words. */
function interleave(words: PlannedWord[]): PlannedWord[] {
  const fresh = words.filter((w) => w.reason === 'new' || w.reason === 'stretch')
  const old = words.filter((w) => w.reason === 'relearn' || w.reason === 'review')
  const out: PlannedWord[] = []
  while (fresh.length || old.length) {
    if (old.length) out.push(old.shift()!)
    if (fresh.length) out.push(fresh.shift()!)
    if (fresh.length) out.push(fresh.shift()!)
  }
  return out
}

export const REASON_LABEL: Record<WordReason, { label: string; emoji: string }> = {
  review: { label: 'Keeping it sharp', emoji: '🔁' },
  relearn: { label: 'You missed this before', emoji: '🎯' },
  new: { label: 'New word', emoji: '✨' },
  stretch: { label: 'Stretch word', emoji: '🚀' },
  list: { label: 'From your list', emoji: '📋' },
  placement: { label: 'Placement check', emoji: '🧭' },
}
