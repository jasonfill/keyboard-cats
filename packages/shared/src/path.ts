// The Mastery Path.
//
// This is the part that removes the setup. A grown-up assigns a *goal on a set*
// — "master this by Friday" — and everything else is derived: which items are
// introduced when, what rung each one is asked at, when a round is a check
// rather than practice, and when the goal is done.
//
// Three decisions do most of the work, and all three are about not overwhelming
// somebody.
//
//   * **Items arrive in batches**, not forty at once. A round drawn from a
//     forty-card deck means meeting everything at once, badly.
//   * **Proportions are capped, not fixed.** A learner with nothing due still
//     gets a full round of new material; one returning after two weeks gets
//     mostly review. The same rule the spelling planner already follows.
//   * **The check is offered, never sprung.** A Mastery Check on a batch that
//     has not reached free recall is a round the learner was set up to fail.

import { deriveLadderState, supportLevelFromMastery, type SupportLevel } from './ladder.js'
import type { Attempt, ItemMastery, QuizCard } from './progress.js'

/** How many new items a learner meets at once. */
export const BATCH_SIZE = 6

/** A round is short enough to finish and long enough to be worth starting. */
export const ROUND_SIZE = 10

/** At most this share of a round is review, however much is overdue. */
export const MAX_REVIEW_SHARE = 0.4

/** Share of the current batch that must reach free recall before a check is offered. */
export const READY_SHARE = 0.7

export type ItemRole = 'batch' | 'review' | 'maintain' | 'stretch'

export interface PathItem {
  card: QuizCard
  role: ItemRole
  level: SupportLevel
  mastery: ItemMastery | undefined
}

export interface PathState {
  /** Items introduced so far, in the order they were introduced. */
  introduced: string[]
  /** Cards at free recall or above. */
  atFreeRecall: number
  /** 0..1 across the whole set. */
  progress: number
  /** Whether the current batch is ready to be checked. */
  readyForCheck: boolean
  /** Everything introduced is at free recall and checked. */
  complete: boolean
}

export interface PathInput {
  cards: readonly QuizCard[]
  /** What the learner knows, by card id. */
  masteryOf: (cardId: string) => ItemMastery | undefined
  /** Whether a card is due today. */
  isDue: (item: ItemMastery) => boolean
  /** Attempts per card, when they are to hand. Falls back to the mastery cache. */
  attemptsOf?: (cardId: string) => readonly Attempt[] | undefined
}

function levelOf(input: PathInput, card: QuizCard): SupportLevel {
  const attempts = input.attemptsOf?.(card.id)
  // The truth needs attempts; the cache is the honest approximation when the
  // planner does not have them, and it rounds toward more scaffolding.
  if (attempts?.length) return deriveLadderState([...attempts]).level
  return supportLevelFromMastery(input.masteryOf(card.id))
}

function hasBeenMet(item: ItemMastery | undefined): boolean {
  return Boolean(item && item.totalAttempts > 0)
}

/**
 * Where this learner is in this set.
 *
 * `introduced` is derived from what has actually been answered rather than
 * stored, so it survives a rebuild and cannot drift from the attempts it is
 * supposed to describe.
 */
export function pathState(input: PathInput): PathState {
  const introduced: string[] = []
  let atFreeRecall = 0

  for (const card of input.cards) {
    const item = input.masteryOf(card.id)
    if (!hasBeenMet(item)) continue
    introduced.push(card.id)
    if (levelOf(input, card) >= 3) atFreeRecall += 1
  }

  // The current batch is the most recently introduced group — the items still
  // being worked up, not everything ever met.
  const batch = introduced.slice(-BATCH_SIZE)
  const batchAtFreeRecall = batch.filter((id) => {
    const card = input.cards.find((c) => c.id === id)
    return card ? levelOf(input, card) >= 3 : false
  }).length

  const total = input.cards.length
  return {
    introduced,
    atFreeRecall,
    progress: total ? atFreeRecall / total : 0,
    readyForCheck: batch.length > 0 && batchAtFreeRecall / batch.length >= READY_SHARE,
    complete: total > 0 && atFreeRecall === total,
  }
}

/**
 * Build one round.
 *
 * Order of business: what is due comes first because it is closest to being
 * forgotten, then the batch being worked, then a new batch if the current one
 * has moved on, then maintenance. A stretch item only appears when there is
 * room, and never more than one — the point of a stretch is that it is unusual.
 */
export function planPath(input: PathInput, size = ROUND_SIZE): PathItem[] {
  const state = pathState(input)
  const met = new Set(state.introduced)
  const chosen: PathItem[] = []
  const taken = new Set<string>()

  const add = (card: QuizCard, role: ItemRole) => {
    if (taken.has(card.id) || chosen.length >= size) return
    taken.add(card.id)
    chosen.push({ card, role, level: levelOf(input, card), mastery: input.masteryOf(card.id) })
  }

  // 1. Review, capped. A round made mostly of things you already got wrong is
  //    accurate and demoralising.
  const reviewCap = Math.floor(size * MAX_REVIEW_SHARE)
  const due = input.cards.filter((c) => {
    const item = input.masteryOf(c.id)
    return item && hasBeenMet(item) && input.isDue(item)
  })
  for (const card of due.slice(0, reviewCap)) add(card, 'review')

  // 2. The batch being worked — everything met that is not yet at free recall.
  const working = input.cards.filter(
    (c) => met.has(c.id) && levelOf(input, c) < 3 && !taken.has(c.id),
  )
  for (const card of working) add(card, 'batch')

  // 3. A new batch, but only once the current one has largely moved on.
  //    Opening the next one early is how a learner ends up meeting forty cards
  //    at once, which is the thing batching exists to prevent.
  if (chosen.length < size && (state.readyForCheck || working.length === 0)) {
    const fresh = input.cards.filter((c) => !met.has(c.id))
    for (const card of fresh.slice(0, BATCH_SIZE)) add(card, 'batch')
  }

  // 4. Maintenance on what is already known, to fill the round out.
  if (chosen.length < size) {
    const sharp = input.cards.filter((c) => met.has(c.id) && !taken.has(c.id))
    for (const card of sharp) {
      if (chosen.length >= size - 1) break
      add(card, 'maintain')
    }
  }

  // 5. One stretch item, if there is still room — and only for a learner who
  //    has somewhere to stretch *from*. On a first round everything is new, so
  //    an extra new card is not a stretch, it is a seventh card in the batch
  //    wearing a different label.
  if (chosen.length < size && met.size > 0) {
    const fresh = input.cards.find((c) => !met.has(c.id) && !taken.has(c.id))
    if (fresh) add(fresh, 'stretch')
  }

  return chosen
}

/**
 * Whether the goal is met.
 *
 * Deliberately not "did they finish a round". A goal is a statement about a
 * *state* — this learner knows this material — and closing it on a session
 * would let one good afternoon end a week's work.
 */
export function goalMet(input: PathInput, fraction = 0.9): boolean {
  const total = input.cards.length
  if (!total) return false
  return pathState(input).progress >= fraction
}
