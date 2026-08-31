// Whether the learner on screen is covered.
//
// The two assertions that matter most here are both about not taking something
// away: a missing field must never open a gate, and a gate must never close on
// somebody who is paying.

import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { vi } from 'vitest'

vi.mock('../learners', async () => (await import('../../test/mockProviders')).learnersMock())

import { signIn, testState, aLearner } from '../../test/state'
import { useCoverage } from './coverage'
import { FREE_DECKS, FREE_HISTORY_DAYS } from '@whizzo/shared'

function coverageOf(covered: boolean | undefined) {
  signIn({ ...aLearner(), ...(covered === undefined ? {} : { covered }) })
  return renderHook(() => useCoverage()).result.current
}

describe('an uncovered learner', () => {
  it('is closed out of the grown-up extras', () => {
    const c = coverageOf(false)
    expect(c.covered).toBe(false)
    expect(c.can('itemReport')).toBe(false)
    expect(c.can('dataExport')).toBe(false)
    expect(c.can('rewards')).toBe(false)
  })

  it('still gets thirty days of history rather than none', () => {
    // The record is always kept; coverage unlocks the view, not the keeping.
    expect(coverageOf(false).historyDays).toBe(FREE_HISTORY_DAYS)
  })

  it('still gets a few decks of their own', () => {
    expect(coverageOf(false).deckLimit).toBe(FREE_DECKS)
  })
})

describe('a covered learner', () => {
  it('opens every grown-up capability', () => {
    const c = coverageOf(true)
    expect(c.covered).toBe(true)
    expect(c.can('itemReport')).toBe(true)
    expect(c.can('retentionReport')).toBe(true)
    expect(c.can('rewards')).toBe(true)
  })

  it('lifts the history window and the content cap', () => {
    const c = coverageOf(true)
    expect(c.historyDays).toBe(Number.POSITIVE_INFINITY)
    expect(c.deckLimit).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('the safe reading', () => {
  it('treats a missing field as uncovered rather than as covered', () => {
    // An older payload has no `covered` at all. A gate that opened on absence
    // would hand out the paid features to everyone the first time a client and
    // a server disagreed about a version.
    expect(coverageOf(undefined).covered).toBe(false)
  })

  it('treats no selected learner as uncovered', () => {
    signIn()
    testState.active = null
    expect(renderHook(() => useCoverage()).result.current.covered).toBe(false)
  })

  it('asks about the learner, not about who is looking', () => {
    // This is the whole model: a tutor working with a covered child sees the
    // full picture for that child and has bought nothing.
    signIn({ ...aLearner(), covered: true })
    testState.profile = { ...testState.profile!, plan: 'free' }
    expect(renderHook(() => useCoverage()).result.current.can('itemReport')).toBe(true)
  })
})
