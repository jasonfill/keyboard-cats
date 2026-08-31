// Row shapes to domain shapes.
//
// Boring on the face of it, and the usual place a bug hides for months: node-pg
// hands back Date objects for timestamps, strings for numerics, and null for
// anything absent. Every one of those has a wrong-but-plausible reading, and
// nothing downstream can tell it went wrong.

import { describe, expect, it } from 'vitest'
import { toGuardian, toLearner } from './mappers.js'
import { dayOf, iso, toAttempt, toDaily, toSession, toSkill } from './progressMappers.js'

describe('toLearner', () => {
  const row = {
    id: 'l1',
    owner_id: 'u1',
    display_name: 'Ada',
    avatar_emoji: '🦊',
    grade_hint: 4,
    birth_year: 2016,
    auth_kind: 'provisioned',
    auth_user_id: 'u2',
    created_at: new Date('2026-01-01T00:00:00Z'),
    theme: 'ocean',
  }

  it('maps a full row', () => {
    expect(toLearner(row)).toMatchObject({
      id: 'l1',
      displayName: 'Ada',
      avatarEmoji: '🦊',
      gradeHint: 4,
      birthYear: 2016,
      authKind: 'provisioned',
      theme: 'ocean',
    })
  })

  it('reads a learner whose row predates the theme column as having none', () => {
    // The migration is additive, so rows written before it have no column at
    // all. Null here means "the client default", never a broken screen.
    expect(toLearner({ ...row, theme: undefined }).theme).toBeNull()
    expect(toLearner({ ...row, theme: null }).theme).toBeNull()
  })

  it('fills in the absent optional fields as null rather than undefined', () => {
    const sparse = toLearner({ ...row, grade_hint: null, birth_year: null, auth_user_id: null })
    expect(sparse.gradeHint).toBeNull()
    expect(sparse.birthYear).toBeNull()
    expect(sparse.authUserId).toBeNull()
  })

  it('defaults auth_kind to none rather than leaving it undefined', () => {
    expect(toLearner({ ...row, auth_kind: null }).authKind).toBe('none')
  })

  it('turns a timestamp into epoch milliseconds', () => {
    expect(toLearner(row).createdAt).toBe(Date.parse('2026-01-01T00:00:00Z'))
  })
})

describe('toGuardian', () => {
  it('defaults a missing role to parent', () => {
    const g = toGuardian({ guardian_id: 'g', learner_id: 'l', role: null, created_at: new Date(0) })
    expect(g.role).toBe('parent')
  })
})

describe('toSession', () => {
  const row = {
    id: 's1',
    subject: 'spelling',
    activity: 'test',
    list_id: null,
    is_test: true,
    items_total: 10,
    items_correct: 9,
    accuracy: '90.00', // numeric columns arrive as strings
    score: 100,
    wpm: null,
    duration_ms: 1000,
    ability_before: '3.10',
    ability_after: '3.40',
    meta: { predictedAccuracy: 70 },
    started_at: new Date('2026-01-01T00:00:00Z'),
    ended_at: new Date('2026-01-01T00:01:00Z'),
    evidence: 'attempts',
    verified_items_total: 10,
    verified_items_correct: 9,
  }

  it('coerces numeric columns out of the strings pg returns', () => {
    const s = toSession(row)
    expect(s.accuracy).toBe(90)
    expect(s.abilityBefore).toBe(3.1)
    expect(s.abilityAfter).toBe(3.4)
    expect(typeof s.accuracy).toBe('number')
  })

  it('keeps a null ability null rather than turning it into zero', () => {
    // Zero is a real ability. Confusing "we never measured" with "measured as
    // zero" would put a learner at the bottom of the curriculum.
    const s = toSession({ ...row, ability_before: null, ability_after: null })
    expect(s.abilityBefore).toBeNull()
    expect(s.abilityAfter).toBeNull()
  })

  it('calls a row with no recorded provenance legacy', () => {
    const s = toSession({ ...row, evidence: null })
    expect(s.evidence).toBe('legacy')
  })

  it('defaults meta so a caller can always read it', () => {
    expect(toSession({ ...row, meta: null }).meta).toEqual({})
  })
})

describe('toAttempt', () => {
  const row = {
    subject: 'spelling',
    item_key: 'cat',
    activity: 'test',
    is_test: true,
    verified: false,
    correct: true,
    response_ms: 100,
    hints_used: 1,
    difficulty: '3.50',
    given: 'kat',
    created_at: new Date('2026-01-01T00:00:00Z'),
    session_id: 's1',
  }

  it('preserves verified:false through the mapping', () => {
    // This is the flag that stops a claim reaching the mastered band. Reading
    // it back wrong on the parent's history screen would misreport the round.
    expect(toAttempt(row).verified).toBe(false)
  })

  it('coerces the numeric difficulty', () => {
    expect(toAttempt(row).difficulty).toBe(3.5)
  })

  it('reads a null difficulty as zero rather than NaN', () => {
    expect(toAttempt({ ...row, difficulty: null }).difficulty).toBe(0)
  })
})

describe('dayOf', () => {
  it('formats a Date in local time, not UTC', () => {
    // A date column is a calendar day. Formatting it via toISOString shifts it
    // backwards for anyone west of Greenwich, which silently moves a learner's
    // streak and their due words by a day.
    const local = new Date(2026, 0, 15, 0, 30)
    expect(dayOf(local)).toBe('2026-01-15')
  })

  it('trims a timestamp string to its day', () => {
    expect(dayOf('2026-01-15T22:00:00Z')).toBe('2026-01-15')
  })

  it('reads an absent date as null', () => {
    expect(dayOf(null)).toBeNull()
    expect(dayOf(undefined)).toBeNull()
  })
})

describe('toDaily', () => {
  it('maps a rollup row', () => {
    const d = toDaily({
      day: new Date(2026, 0, 15),
      subject: 'spelling',
      seconds: 120,
      items: 10,
      correct: 8,
    })
    expect(d).toMatchObject({ day: '2026-01-15', subject: 'spelling', items: 10, correct: 8 })
  })
})

describe('toSkill', () => {
  it('coerces the numerics and defaults the settings blob', () => {
    const s = toSkill({
      subject: 'spelling',
      ability: '4.25',
      ability_sd: '0.80',
      level_index: 2,
      placed: true,
      total_attempts: 10,
      total_correct: 8,
      streak_days: 3,
      best_streak_days: 5,
      last_active_on: new Date(2026, 0, 15),
      settings: null,
    })
    expect(s.ability).toBe(4.25)
    expect(s.abilitySd).toBe(0.8)
    expect(s.settings).toEqual({})
    expect(s.lastActiveOn).toBe('2026-01-15')
  })
})

describe('iso', () => {
  it('round-trips epoch milliseconds', () => {
    const ms = Date.parse('2026-01-01T00:00:00Z')
    expect(iso(ms)).toBe('2026-01-01T00:00:00.000Z')
  })

  it('keeps absent absent, rather than writing the epoch', () => {
    expect(iso(null)).toBeNull()
    expect(iso(undefined)).toBeNull()
  })
})
