// What a learner has actually earned, in collectibles.
//
// The earn rate is FIXED ACROSS ALL TEN THEMES and nothing in this file reads
// the theme except to know how many slots there are to fill. A ribbon and a
// fossil cost exactly the same work; otherwise switching themes would be a way
// to farm easy wins, and a reward would stop meaning anything.
//
// Two ways to earn, both of which require the system to have checked the work:
//
//   1. A graded round that clears the accuracy predicted for it. Beating the
//      prediction is the bar because it is the one that scales with the
//      learner — a hard set cleared is worth what an easy set cleared is.
//   2. A level promotion.
//
// Practice rounds earn nothing. Neither does a hinted word: hints make a round
// non-graded upstream, so those sessions never reach the first branch. A hinted
// word cannot buy a fossil.

import type { ProgressSnapshot, SessionRecord } from '../progress/types'
import type { Theme } from '../themes'

export interface Earned {
  /** How many collectibles the learner holds, never more than the set size. */
  owned: number
  total: number
  /** Owned as a fraction of the set, 0..1. */
  fraction: number
  /** Rounds that cleared their prediction. */
  fromRounds: number
  /** Level promotions. */
  fromPromotions: number
}

/**
 * Did the system actually check this round, rather than take the learner's
 * word for it?
 *
 * `isTest` means "no hints were shown" and `verified` means "we checked the
 * answer" — the shared types are explicit that the two are orthogonal. Today
 * no graded quiz mode self-grades, so `isTest` alone happens to be enough; the
 * comment in useQuizSession even says so. That is a coincidence of the current
 * mode list, not a rule, and a reward is exactly the wrong thing to hang on a
 * coincidence. A flashcard self-grade must never buy a collectible.
 */
function wasChecked(s: SessionRecord): boolean {
  if (typeof s.verifiedItemsTotal !== 'number') {
    // No provenance recorded: 'client' summaries and legacy rows. Trust the
    // round only if it never claimed to be graded in the first place.
    return s.evidence !== 'legacy'
  }
  return s.verifiedItemsTotal >= s.itemsTotal
}

function beatPrediction(s: SessionRecord): boolean {
  // Only graded rounds count, only ones the system checked, and only where a
  // prediction was recorded to beat.
  if (!s.isTest || !wasChecked(s)) return false
  const predicted = s.meta?.predictedAccuracy
  if (typeof predicted !== 'number') return false
  return s.accuracy >= predicted
}

function wasPromotion(s: SessionRecord): boolean {
  return s.meta?.level === 'promote' && wasChecked(s)
}

export function earnedFor(snapshot: ProgressSnapshot, theme: Theme): Earned {
  let fromRounds = 0
  let fromPromotions = 0
  for (const s of snapshot.sessions) {
    if (beatPrediction(s)) fromRounds += 1
    if (wasPromotion(s)) fromPromotions += 1
  }
  const owned = Math.min(theme.total, fromRounds + fromPromotions)
  return {
    owned,
    total: theme.total,
    fraction: theme.total > 0 ? owned / theme.total : 0,
    fromRounds,
    fromPromotions,
  }
}
