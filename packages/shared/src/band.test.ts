// How old the learner is, and what that changes.
//
// The rule this exists to keep: a band is paint, never curriculum. It changes
// register, celebration and pacing — it must never touch the ladder, the
// difficulty, what counts as evidence, or the earn rate.

import { describe, expect, it } from 'vitest'
import {
  allowsTimer,
  BAND_STYLE,
  bandForGrade,
  MATURITY_BANDS,
  praise,
  type MaturityBand,
} from './band.js'

describe('picking a band', () => {
  it('reads it off the grade', () => {
    expect(bandForGrade(1)).toBe('early')
    expect(bandForGrade(4)).toBe('growing')
    expect(bandForGrade(7)).toBe('middle')
    expect(bandForGrade(11)).toBe('upper')
  })

  it('guesses the middle of the range when the grade is unknown', () => {
    // The least wrong answer: either end is confidently wrong for half of them.
    expect(bandForGrade(null)).toBe('growing')
    expect(bandForGrade(undefined)).toBe('growing')
  })

  it('handles kindergarten and beyond school', () => {
    expect(bandForGrade(0)).toBe('early')
    expect(bandForGrade(13)).toBe('upper')
  })
})

describe('what a band changes', () => {
  it('describes every band', () => {
    for (const band of MATURITY_BANDS) {
      const style = BAND_STYLE[band]
      expect(style.checkName.length, band).toBeGreaterThan(3)
      expect(style.roundSize, band).toBeGreaterThan(0)
    }
  })

  it('calls the check something a young child would want to do', () => {
    expect(BAND_STYLE.early.checkName).toBe('Boss Battle')
    expect(BAND_STYLE.upper.checkName).toBe('Mastery Check')
  })

  it('quietens the celebration as they get older', () => {
    const lengths = MATURITY_BANDS.map((b) => BAND_STYLE[b].celebrationMs)
    expect(lengths).toEqual([...lengths].sort((a, b) => b - a))
    // A sixteen-year-old gets a line of type, not confetti.
    expect(BAND_STYLE.upper.celebrationMs).toBe(0)
  })

  it('retires the mascot rather than shrinking it forever', () => {
    expect(BAND_STYLE.upper.mascot).toBe('none')
  })

  it('lengthens the round as attention grows', () => {
    const sizes = MATURITY_BANDS.map((b) => BAND_STYLE[b].roundSize)
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b))
  })
})

describe('praise, in the right register', () => {
  it('is warm for a small child', () => {
    expect(praise('early', true)).toMatch(/Wow/)
  })

  it('is plain for a teenager', () => {
    // "Amazing! 🧙" to a sixteen-year-old revising biology is the thing this
    // whole module exists to stop.
    const said = praise('upper', true)
    expect(said).not.toMatch(/!/)
    expect(said).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  it('gives an older learner the number instead of the exclamation mark', () => {
    // Evidence of their own competence is the motivating feedback.
    expect(praise('upper', true, 1400)).toBe('Correct · 1.4s')
  })

  it('softens a miss most for the youngest', () => {
    expect(praise('early', false)).toMatch(/another go/)
    expect(praise('upper', false)).toBe('Not right.')
  })

  it('never blames anybody for a miss, in any band', () => {
    for (const band of MATURITY_BANDS) {
      const said = praise(band, false)
      expect(said, band).not.toMatch(/wrong|bad|should have|failed/i)
    }
  })
})

describe('timers', () => {
  it('never times a small child', () => {
    // Speed pressure raises anxiety, and it falls hardest on the learners
    // already struggling.
    expect(allowsTimer('early', true)).toBe(false)
  })

  it('lets an older child opt in', () => {
    expect(allowsTimer('growing', false)).toBe(false)
    expect(allowsTimer('growing', true)).toBe(true)
  })

  it('times the older bands by default', () => {
    for (const band of ['middle', 'upper'] as MaturityBand[]) {
      expect(allowsTimer(band), band).toBe(true)
    }
  })
})
