// How old the learner is, and what that changes.
//
// This is the move `lib/themes.ts` already made, applied to age. A theme is one
// accent, one mascot and a handful of copy strings — and crucially the earn
// rate is fixed across all ten, so switching theme is never a way to farm easy
// wins. A maturity band works the same way: **it is paint, never curriculum.**
//
// Before this, the only age signal in the app was an advisory string on a theme
// that reordered a picker, and `feedbackLine()` was hardcoded at one register —
// "You are a typing wizard! 🧙" — which a sixteen-year-old revising biology
// got, along with confetti and a mascot.
//
// What the band changes: register, celebration, mascot, timers, round length.
// What it must never change: the ladder, item difficulty, what counts as
// evidence, or the earn rate. The moment a band changes earn rate it has
// become a difficulty setting.

export type MaturityBand = 'early' | 'growing' | 'middle' | 'upper'

export const MATURITY_BANDS: MaturityBand[] = ['early', 'growing', 'middle', 'upper']

export interface BandStyle {
  /** What the graded check is called. */
  checkName: string
  /** How long a celebration lingers, in ms. Zero means a line of text. */
  celebrationMs: number
  mascot: 'large' | 'ends' | 'corner' | 'none'
  /** Timed rounds: never, opt-in, or on by default. */
  timers: 'never' | 'opt-in' | 'default'
  /** How many items a round holds. */
  roundSize: number
  motion: 'bouncy' | 'moderate' | 'subtle' | 'minimal'
}

export const BAND_STYLE: Record<MaturityBand, BandStyle> = {
  early: {
    checkName: 'Boss Battle',
    celebrationMs: 2500,
    mascot: 'large',
    timers: 'never',
    roundSize: 6,
    motion: 'bouncy',
  },
  growing: {
    checkName: 'Boss Battle',
    celebrationMs: 1500,
    mascot: 'ends',
    timers: 'opt-in',
    roundSize: 9,
    motion: 'moderate',
  },
  middle: {
    checkName: 'Mastery Check',
    celebrationMs: 600,
    mascot: 'corner',
    timers: 'default',
    roundSize: 11,
    motion: 'subtle',
  },
  upper: {
    checkName: 'Mastery Check',
    celebrationMs: 0,
    mascot: 'none',
    timers: 'default',
    roundSize: 12,
    motion: 'minimal',
  },
}

/**
 * Which band a learner starts in.
 *
 * From their grade, and overridable — an eleven-year-old who wants a Boss
 * Battle should get a Boss Battle. Unknown lands in `growing` rather than at
 * either end: the middle of the range is the least wrong guess.
 */
export function bandForGrade(grade: number | null | undefined): MaturityBand {
  if (grade === null || grade === undefined) return 'growing'
  if (grade <= 2) return 'early'
  if (grade <= 5) return 'growing'
  if (grade <= 8) return 'middle'
  return 'upper'
}

/**
 * Praise, in the register of the person reading it.
 *
 * The upper band gets no exclamation mark and no emoji on purpose. For a
 * sixteen-year-old the motivating feedback is evidence of their own competence
 * delivered without decoration — and a response time is more of that than
 * "Amazing!" will ever be.
 */
export function praise(band: MaturityBand, correct: boolean, responseMs?: number | null): string {
  if (!correct) {
    switch (band) {
      case 'early':
        return 'Not this time — have another go! 💪'
      case 'growing':
        return 'Not quite. Try again.'
      default:
        return 'Not right.'
    }
  }

  switch (band) {
    case 'early':
      return 'Wow! You got it! 🌟'
    case 'growing':
      return 'Nice one.'
    case 'middle':
      return 'Correct.'
    case 'upper':
      return responseMs ? `Correct · ${(responseMs / 1000).toFixed(1)}s` : 'Correct.'
  }
}

/** Whether a round in this band may be timed at all. */
export function allowsTimer(band: MaturityBand, learnerOptedIn = false): boolean {
  const style = BAND_STYLE[band]
  if (style.timers === 'never') return false
  if (style.timers === 'opt-in') return learnerOptedIn
  return true
}
