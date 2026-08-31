// Plan limits.
//
// Two directions to get wrong. Gating something that should be free would
// paywall a child's curriculum, which the product explicitly refuses to do.
// Failing to gate something would give away what Pro is for.

import { describe, expect, it } from 'vitest'
import { allows, isPro, limitsFor, PLANS, type Gate } from './plans'

describe('the free plan', () => {
  const free = limitsFor('free')

  it('includes the whole curriculum', () => {
    // The stated promise: a spelling app that paywalls fourth grade is not
    // much use to the child who needs it. Nothing here limits words or grades.
    expect(free).not.toHaveProperty('grades')
    expect(free).not.toHaveProperty('words')
    expect(free).not.toHaveProperty('subjects')
  })

  it('allows saving at least one list and a few decks', () => {
    expect(free.customLists).toBeGreaterThan(0)
    expect(free.decks).toBeGreaterThan(0)
  })

  it('keeps a usable window of history', () => {
    expect(free.historyDays).toBeGreaterThanOrEqual(30)
  })

  it('withholds the grown-up extras', () => {
    expect(free.printableReports).toBe(false)
    expect(free.detailedWordReport).toBe(false)
    expect(free.dataExport).toBe(false)
  })
})

describe('the pro plan', () => {
  const pro = limitsFor('pro')

  it('grants everything free grants, and more of it', () => {
    const free = limitsFor('free')
    expect(pro.customLists).toBeGreaterThan(free.customLists)
    expect(pro.decks).toBeGreaterThan(free.decks)
    expect(pro.historyDays).toBeGreaterThan(free.historyDays)
  })

  it('grants every boolean the free plan withholds', () => {
    expect(pro.printableReports).toBe(true)
    expect(pro.detailedWordReport).toBe(true)
    expect(pro.dataExport).toBe(true)
  })

  it('keeps the full history rather than a longer window', () => {
    expect(pro.historyDays).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('limitsFor', () => {
  it('falls back to free for an unknown plan', () => {
    // A stale or corrupted plan string must never accidentally grant Pro.
    for (const bad of ['enterprise', '', null, undefined]) {
      expect(limitsFor(bad as never)).toEqual(limitsFor('free'))
    }
  })
})

describe('isPro', () => {
  it('is true only for pro', () => {
    expect(isPro('pro')).toBe(true)
    expect(isPro('free')).toBe(false)
    expect(isPro(undefined)).toBe(false)
  })
})

describe('allows', () => {
  const gates: Gate[] = [
    'customLists',
    'decks',
    'historyDays',
    'printableReports',
    'detailedWordReport',
    'dataExport',
  ]

  it('reads every gate for both plans without throwing', () => {
    for (const gate of gates) {
      expect(typeof allows('free', gate)).toBe('boolean')
      expect(typeof allows('pro', gate)).toBe('boolean')
    }
  })

  it('never grants a gate on free that free does not have', () => {
    expect(allows('free', 'detailedWordReport')).toBe(false)
    expect(allows('free', 'printableReports')).toBe(false)
    expect(allows('free', 'dataExport')).toBe(false)
  })

  it('grants everything on pro', () => {
    for (const gate of gates) {
      expect(allows('pro', gate), gate).toBe(true)
    }
  })

  it('treats a numeric limit as allowed when it is above zero', () => {
    expect(allows('free', 'customLists')).toBe(true)
    expect(allows('free', 'historyDays')).toBe(true)
  })
})

describe('the plan definitions themselves', () => {
  it('describes both plans for the upgrade screen', () => {
    for (const id of ['free', 'pro'] as const) {
      const plan = PLANS[id]
      expect(plan.name).toBeTruthy()
      expect(plan.price).toBeTruthy()
      expect(plan.tagline).toBeTruthy()
      expect(plan.perks.length).toBeGreaterThan(0)
    }
  })

  it('keeps each plan’s id matching its key', () => {
    for (const [key, plan] of Object.entries(PLANS)) {
      expect(plan.id).toBe(key)
    }
  })
})
