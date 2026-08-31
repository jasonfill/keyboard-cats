// Cross-subject readings of the snapshot that more than one screen needs.
//
// The important one is `unaidedAccuracy`. Everywhere the product talks about a
// level, it means the level that unaided answers earned — a hinted word stops
// counting, and a practice round never counted. Deriving that here rather than
// on each screen is what keeps the student home, the session footer and the
// parent report quoting the same number.

import type { ProgressSnapshot, SessionRecord } from './types'

/** Rounds the system graded: no hints taken, spelled from scratch. */
export function gradedSessions(snapshot: ProgressSnapshot): SessionRecord[] {
  return snapshot.sessions.filter((s) => s.isTest)
}

/**
 * Accuracy over graded rounds only, 0..100, or null when there are none yet.
 *
 * Null rather than zero on purpose: "no graded work yet" and "graded work that
 * went badly" are different things, and showing 0% for the first is a lie.
 */
export function unaidedAccuracy(snapshot: ProgressSnapshot): number | null {
  let total = 0
  let correct = 0
  for (const s of gradedSessions(snapshot)) {
    total += s.itemsTotal
    correct += s.itemsCorrect
  }
  if (total === 0) return null
  return Math.round((correct / total) * 100)
}

/** The longest run of consecutive days across every subject. */
export function bestStreak(snapshot: ProgressSnapshot): number {
  return Object.values(snapshot.skills).reduce((n, s) => Math.max(n, s?.streakDays ?? 0), 0)
}
