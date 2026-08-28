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

function beatPrediction(s: SessionRecord): boolean {
  // Only graded rounds count, and only where a prediction was recorded to beat.
  if (!s.isTest) return false
  const predicted = s.meta?.predictedAccuracy
  if (typeof predicted !== 'number') return false
  return s.accuracy >= predicted
}

function wasPromotion(s: SessionRecord): boolean {
  return s.meta?.level === 'promote'
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
