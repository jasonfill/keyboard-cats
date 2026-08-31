// The write boundary.
//
// RLS decides *whose* rows may be touched. These schemas decide whether the
// payload is a coherent piece of progress at all — so a hole here is a hole
// the database will happily store.
//
// Most of what follows checks the things a hostile or buggy client would send:
// out-of-range numbers, strings where numbers belong, and fields the caller is
// not supposed to be able to set.

import { describe, expect, it } from 'vitest'
import {
  achievementSchema,
  assignmentDraftSchema,
  assignmentPatchSchema,
  attemptSchema,
  itemMasterySchema,
  listProgressSchema,
  sessionRecordSchema,
  skillStateSchema,
  subjectSchema,
} from './schemas.js'

const UUID = '11111111-2222-4333-8444-555555555555'

function attempt(over: Record<string, unknown> = {}) {
  return {
    subject: 'spelling',
    itemKey: 'cat',
    activity: 'test',
    isTest: true,
    verified: true,
    correct: true,
    responseMs: 120,
    hintsUsed: 0,
    difficulty: 3,
    given: 'cat',
    at: 1700000000000,
    ...over,
  }
}

function session(over: Record<string, unknown> = {}) {
  return {
    id: UUID,
    subject: 'spelling',
    activity: 'test',
    listId: null,
    isTest: true,
    itemsTotal: 10,
    itemsCorrect: 9,
    accuracy: 90,
    score: 100,
    wpm: null,
    durationMs: 60000,
    abilityBefore: 3,
    abilityAfter: 3.2,
    meta: {},
    startedAt: 1700000000000,
    endedAt: 1700000060000,
    ...over,
  }
}

describe('subjectSchema', () => {
  it('accepts the three real subjects', () => {
    for (const s of ['spelling', 'typing', 'quiz']) {
      expect(subjectSchema.safeParse(s).success).toBe(true)
    }
  })

  it('rejects anything else', () => {
    for (const s of ['maths', '', null, 1, 'SPELLING']) {
      expect(subjectSchema.safeParse(s).success).toBe(false)
    }
  })
})

describe('attemptSchema', () => {
  it('accepts a well-formed attempt', () => {
    expect(attemptSchema.safeParse(attempt()).success).toBe(true)
  })

  it('defaults verified to true for clients that predate the flag', () => {
    const parsed = attemptSchema.parse(attempt({ verified: undefined }))
    expect(parsed.verified).toBe(true)
  })

  it('keeps an explicit verified:false rather than defaulting over it', () => {
    // This is the flag that keeps a self-graded answer out of the mastered
    // band. Losing it here would silently promote every claim.
    expect(attemptSchema.parse(attempt({ verified: false })).verified).toBe(false)
  })

  it('rejects a negative hint count', () => {
    expect(attemptSchema.safeParse(attempt({ hintsUsed: -1 })).success).toBe(false)
  })

  it('rejects a non-finite difficulty', () => {
    for (const d of [Infinity, -Infinity, NaN]) {
      expect(attemptSchema.safeParse(attempt({ difficulty: d })).success).toBe(false)
    }
  })

  it('rejects a timestamp before the epoch', () => {
    expect(attemptSchema.safeParse(attempt({ at: -1 })).success).toBe(false)
  })

  it('rejects an item key long enough to be an attack rather than a word', () => {
    expect(attemptSchema.safeParse(attempt({ itemKey: 'x'.repeat(201) })).success).toBe(false)
    expect(attemptSchema.safeParse(attempt({ itemKey: '' })).success).toBe(false)
  })

  it('caps what a learner typed, so a paste cannot become a row', () => {
    expect(attemptSchema.safeParse(attempt({ given: 'x'.repeat(401) })).success).toBe(false)
  })

  it('rejects a malformed session id', () => {
    expect(attemptSchema.safeParse(attempt({ sessionId: 'not-a-uuid' })).success).toBe(false)
  })
})

describe('sessionRecordSchema', () => {
  it('accepts a well-formed session', () => {
    expect(sessionRecordSchema.safeParse(session()).success).toBe(true)
  })

  it('requires a real uuid for the id', () => {
    expect(sessionRecordSchema.safeParse(session({ id: '1' })).success).toBe(false)
  })

  it('rejects an accuracy outside 0..100', () => {
    expect(sessionRecordSchema.safeParse(session({ accuracy: 101 })).success).toBe(false)
    expect(sessionRecordSchema.safeParse(session({ accuracy: -1 })).success).toBe(false)
  })

  it('rejects negative counts', () => {
    expect(sessionRecordSchema.safeParse(session({ itemsTotal: -1 })).success).toBe(false)
    expect(sessionRecordSchema.safeParse(session({ durationMs: -1 })).success).toBe(false)
  })

  it('defaults meta rather than requiring it', () => {
    expect(sessionRecordSchema.parse(session({ meta: undefined })).meta).toEqual({})
  })

  it('accepts provenance fields for round-tripping', () => {
    // Accepted so a snapshot survives a load/save cycle. The route overwrites
    // them from the attempts; that rule is asserted in the repo tests, not here.
    const parsed = sessionRecordSchema.parse(
      session({ evidence: 'attempts', verifiedItemsTotal: 10, verifiedItemsCorrect: 9 }),
    )
    expect(parsed.evidence).toBe('attempts')
  })

  it('rejects an evidence kind that is not one of the three', () => {
    expect(sessionRecordSchema.safeParse(session({ evidence: 'trust-me' })).success).toBe(false)
  })
})

describe('skillStateSchema', () => {
  const state = {
    subject: 'spelling',
    ability: 4,
    abilitySd: 1,
    levelIndex: 2,
    placed: true,
    totalAttempts: 10,
    totalCorrect: 8,
    streakDays: 3,
    bestStreakDays: 5,
    lastActiveOn: '2026-01-15',
    settings: {},
  }

  it('accepts a well-formed state', () => {
    expect(skillStateSchema.safeParse(state).success).toBe(true)
  })

  it('rejects a negative level index', () => {
    expect(skillStateSchema.safeParse({ ...state, levelIndex: -1 }).success).toBe(false)
  })

  it('rejects a negative uncertainty', () => {
    expect(skillStateSchema.safeParse({ ...state, abilitySd: -1 }).success).toBe(false)
  })

  it('rejects a malformed day string', () => {
    for (const d of ['2026-1-5', '15/01/2026', 'today', '20260115']) {
      expect(skillStateSchema.safeParse({ ...state, lastActiveOn: d }).success).toBe(false)
    }
  })

  it('accepts a null last-active day for a learner who has never played', () => {
    expect(skillStateSchema.safeParse({ ...state, lastActiveOn: null }).success).toBe(true)
  })

  it('defaults settings so an older client is not rejected for omitting them', () => {
    expect(skillStateSchema.parse({ ...state, settings: undefined }).settings).toEqual({})
  })
})

describe('itemMasterySchema', () => {
  const item = {
    subject: 'spelling',
    itemKey: 'cat',
    listId: null,
    difficulty: 3,
    mastery: 0.5,
    reps: 2,
    lapses: 0,
    correctStreak: 2,
    totalAttempts: 3,
    totalCorrect: 2,
    intervalDays: 4,
    dueOn: '2026-01-20',
    firstSeenAt: 1,
    lastSeenAt: 2,
  }

  it('accepts a well-formed record', () => {
    expect(itemMasterySchema.safeParse(item).success).toBe(true)
  })

  it('holds mastery to 0..1, so a client cannot declare itself expert', () => {
    expect(itemMasterySchema.safeParse({ ...item, mastery: 1.5 }).success).toBe(false)
    expect(itemMasterySchema.safeParse({ ...item, mastery: -0.1 }).success).toBe(false)
  })

  it('rejects a negative review interval', () => {
    expect(itemMasterySchema.safeParse({ ...item, intervalDays: -1 }).success).toBe(false)
  })
})

describe('listProgressSchema', () => {
  const list = {
    subject: 'spelling',
    listId: 'g2-short-vowels',
    plays: 1,
    testsTaken: 1,
    bestScore: 100,
    bestAccuracy: 90,
    stars: 3,
    masteredAt: null,
  }

  it('accepts a well-formed record', () => {
    expect(listProgressSchema.safeParse(list).success).toBe(true)
  })

  it('caps stars at three', () => {
    expect(listProgressSchema.safeParse({ ...list, stars: 4 }).success).toBe(false)
    expect(listProgressSchema.safeParse({ ...list, stars: -1 }).success).toBe(false)
  })
})

describe('achievementSchema', () => {
  it('accepts a well-formed unlock', () => {
    const ok = { achievementId: 'first-steps', subject: 'typing', unlockedAt: 1 }
    expect(achievementSchema.safeParse(ok).success).toBe(true)
  })

  it('rejects an empty achievement id', () => {
    expect(
      achievementSchema.safeParse({ achievementId: '', subject: 'typing', unlockedAt: 1 }).success,
    ).toBe(false)
  })
})

describe('assignments — what a grown-up may and may not set', () => {
  const draft = { subject: 'spelling', activity: 'test', title: 'Friday list' }

  it('accepts a minimal draft', () => {
    expect(assignmentDraftSchema.safeParse(draft).success).toBe(true)
  })

  it('requires a title somebody could read', () => {
    expect(assignmentDraftSchema.safeParse({ ...draft, title: '' }).success).toBe(false)
    expect(
      assignmentDraftSchema.safeParse({ ...draft, title: 'x'.repeat(121) }).success,
    ).toBe(false)
  })

  it('holds a minimum accuracy to a real percentage', () => {
    expect(assignmentDraftSchema.safeParse({ ...draft, minAccuracy: 0 }).success).toBe(false)
    expect(assignmentDraftSchema.safeParse({ ...draft, minAccuracy: 101 }).success).toBe(false)
    expect(assignmentDraftSchema.safeParse({ ...draft, minAccuracy: 80 }).success).toBe(true)
  })

  it('strips status, completedAt and sessionId from a draft', () => {
    // A task is closed by the round that satisfied it, so none of these are
    // ever something a caller supplies.
    const parsed = assignmentDraftSchema.parse({
      ...draft,
      status: 'done',
      completedAt: 1,
      sessionId: UUID,
    })
    expect(parsed).not.toHaveProperty('status')
    expect(parsed).not.toHaveProperty('completedAt')
    expect(parsed).not.toHaveProperty('sessionId')
  })

  it('will not let a patch declare work finished', () => {
    // Finishing work is something you do, not something you say.
    expect(assignmentPatchSchema.safeParse({ status: 'done' }).success).toBe(false)
    expect(assignmentPatchSchema.safeParse({ status: 'cancelled' }).success).toBe(true)
    expect(assignmentPatchSchema.safeParse({ status: 'open' }).success).toBe(true)
  })
})
