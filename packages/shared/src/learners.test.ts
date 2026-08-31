// The age gate, which decides whether a child's record can be attached to an
// identity of their own. The database enforces it (the `learners_guard`
// trigger in migration 0003); this is the copy the UI reads, so the two must
// agree — and the interesting cases are all at the boundary.

import { describe, expect, it } from 'vitest'
import { ageOf, canUseSelfSignIn, SELF_SIGNIN_MIN_AGE } from './learners.js'

const now = new Date(2026, 5, 15)

describe('age', () => {
  it('is whole years from the birth year', () => {
    expect(ageOf({ birthYear: 2010 }, now)).toBe(16)
  })

  it('is null when no birth year was recorded', () => {
    expect(ageOf({ birthYear: null }, now)).toBeNull()
    expect(ageOf({}, now)).toBeNull()
  })

  it('treats a zero birth year as absent rather than as year zero', () => {
    expect(ageOf({ birthYear: 0 }, now)).toBeNull()
  })
})

describe('self sign-in', () => {
  it('is allowed at the minimum age', () => {
    expect(canUseSelfSignIn({ birthYear: new Date().getFullYear() - SELF_SIGNIN_MIN_AGE })).toBe(true)
  })

  it('is refused a year below it', () => {
    expect(
      canUseSelfSignIn({ birthYear: new Date().getFullYear() - SELF_SIGNIN_MIN_AGE + 1 }),
    ).toBe(false)
  })

  it('is refused when the age is unknown', () => {
    // An unknown age is a no on purpose: the gate exists so a child's record is
    // never handed to an unverified identity, and "we do not know" is not a yes.
    expect(canUseSelfSignIn({ birthYear: null })).toBe(false)
    expect(canUseSelfSignIn({})).toBe(false)
  })

  it('allows an adult', () => {
    expect(canUseSelfSignIn({ birthYear: 1985 })).toBe(true)
  })
})
