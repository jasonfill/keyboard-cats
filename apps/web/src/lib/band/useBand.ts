// Which register the app speaks in.
//
// Derived from the learner's grade, which a grown-up already sets — so the
// override the spec asks for is the grade hint itself, and this needs no new
// field and no new screen. A fifteen-year-old who wants Dinosaurs still gets
// Dinosaurs; they just get it presented seriously.
//
// A band is paint, never curriculum. Nothing here reaches the ladder, the
// difficulty, what counts as evidence, or what earns a reward.

import { BAND_STYLE, bandForGrade, praise, type BandStyle, type MaturityBand } from '@whizzo/shared'
import { useLearners } from '../learners'

export interface BandApi {
  band: MaturityBand
  style: BandStyle
  /** Praise in this learner's register. */
  say: (correct: boolean, responseMs?: number | null) => string
  /**
   * Whether confetti and a cheering mascot belong on this screen.
   *
   * One question rather than four screens each reading `celebrationMs` and
   * `mascot` and drawing their own conclusion — which is how the registers
   * drift apart.
   */
  celebrates: boolean
  /** How many items a round of this learner's holds. */
  roundSize: number
}

export function useBand(): BandApi {
  const { active } = useLearners()
  const band = bandForGrade(active?.gradeHint)
  return {
    band,
    style: BAND_STYLE[band],
    say: (correct, responseMs) => praise(band, correct, responseMs),
    celebrates: BAND_STYLE[band].celebrationMs > 0,
    roundSize: BAND_STYLE[band].roundSize,
  }
}
