// Whether the learner on screen is covered, and what that opens.
//
// One hook, so no screen has to know how billing works — and so the answer is
// the same everywhere. It asks about the *learner*, never about the person
// looking: a tutor working with a covered child gets the full picture for that
// child and has never bought anything.

import { allows, deckLimit, historyDays, wordListLimit, type Gate } from '@whizzo/shared'
import { useLearners } from '../learners'

export interface CoverageApi {
  covered: boolean
  can: (gate: Gate) => boolean
  historyDays: number
  deckLimit: number
  wordListLimit: number
}

export function useCoverage(): CoverageApi {
  const { active } = useLearners()
  // Absent means uncovered, which is the safe reading: a missing field must
  // never open a gate.
  const covered = active?.covered === true

  return {
    covered,
    can: (gate: Gate) => allows(covered, gate),
    historyDays: historyDays(covered),
    deckLimit: deckLimit(covered),
    wordListLimit: wordListLimit(covered),
  }
}
