// Typing metrics and the round summary.
//
// Small arithmetic, shown to a child as their score. The edges — a round with
// no time on the clock, one with nothing typed — are where a NaN or an
// Infinity would surface as a number on the results screen.

import { describe, expect, it } from 'vitest'
import { computeAccuracy, computeScore, computeWpm, feedbackLine, starRating } from './stats'

describe('computeWpm', () => {
  it('uses the five-characters-to-a-word convention', () => {
    expect(computeWpm(300, 60_000)).toBe(60)
  })

  it('is zero rather than Infinity when no time has passed', () => {
    expect(computeWpm(100, 0)).toBe(0)
    expect(computeWpm(100, -1)).toBe(0)
  })

  it('is zero when nothing was typed', () => {
    expect(computeWpm(0, 60_000)).toBe(0)
  })

  it('always returns a finite whole number', () => {
    for (const [chars, ms] of [[7, 1], [0, 0], [1e6, 1]]) {
      const wpm = computeWpm(chars!, ms!)
      expect(Number.isFinite(wpm)).toBe(true)
      expect(Number.isInteger(wpm)).toBe(true)
    }
  })
})

describe('computeAccuracy', () => {
  it('is a whole percentage', () => {
    expect(computeAccuracy(9, 10)).toBe(90)
    expect(computeAccuracy(1, 3)).toBe(33)
  })

  it('treats an empty round as perfect rather than as a failure', () => {
    // Nothing typed is nothing wrong. Reporting 0% would open a round by
    // telling a child they had already failed it.
    expect(computeAccuracy(0, 0)).toBe(100)
  })

  it('stays within 0..100', () => {
    expect(computeAccuracy(0, 10)).toBe(0)
    expect(computeAccuracy(10, 10)).toBe(100)
  })
})

describe('starRating', () => {
  it('rewards accuracy before speed', () => {
    // A fast, sloppy round should not beat a careful one.
    expect(starRating(70, 60)).toBeLessThan(starRating(96, 20))
  })

  it('gives three stars for accurate and reasonably quick', () => {
    expect(starRating(95, 18)).toBe(3)
    expect(starRating(90, 10)).toBe(3)
  })

  it('never returns fewer than one star', () => {
    for (const acc of [0, 10, 50]) expect(starRating(acc, 0)).toBe(1)
  })

  it('never returns more than three', () => {
    expect(starRating(100, 200)).toBe(3)
  })

  it('is monotonic in accuracy at a fixed speed', () => {
    let previous = 0
    for (const acc of [0, 60, 70, 85, 90, 95, 100]) {
      const stars = starRating(acc, 20)
      expect(stars).toBeGreaterThanOrEqual(previous)
      previous = stars
    }
  })
})

describe('computeScore', () => {
  it('rises with every input', () => {
    const base = computeScore(10, 90, 20, 5)
    expect(computeScore(11, 90, 20, 5)).toBeGreaterThan(base)
    expect(computeScore(10, 95, 20, 5)).toBeGreaterThan(base)
    expect(computeScore(10, 90, 25, 5)).toBeGreaterThan(base)
    expect(computeScore(10, 90, 20, 6)).toBeGreaterThan(base)
  })

  it('is zero for a round where nothing happened', () => {
    expect(computeScore(0, 0, 0, 0)).toBe(0)
  })

  it('is never negative', () => {
    expect(computeScore(0, 0, 0, 0)).toBeGreaterThanOrEqual(0)
  })
})

describe('feedbackLine', () => {
  it('says something for every accuracy from 0 to 100', () => {
    for (let acc = 0; acc <= 100; acc++) {
      expect(feedbackLine(acc)).toBeTruthy()
    }
  })

  it('never tells a low scorer they failed', () => {
    // Same principle that retired the sad mascot: working at the edge of your
    // ability is the system working, not the learner failing.
    const low = feedbackLine(20).toLowerCase()
    expect(low).not.toMatch(/fail|bad|poor|terrible|wrong/)
  })

  it('reserves the strongest praise for the highest accuracy', () => {
    expect(feedbackLine(99)).not.toBe(feedbackLine(50))
  })
})
