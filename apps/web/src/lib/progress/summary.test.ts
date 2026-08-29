// Cross-subject readings the student home and the parent report both quote.
//
// The number that matters is unaided accuracy. Everywhere the product talks
// about a level it means the level unaided answers earned, so if this counted
// practice the app would be quietly overstating what a child can do.

import { describe, expect, it } from 'vitest'
import { bestStreak, gradedSessions, unaidedAccuracy } from './summary'
import { defaultSkillState, emptySnapshot } from './types'
import type { ProgressSnapshot, SessionRecord } from './types'

function session(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: Math.random().toString(36).slice(2),
    subject: 'spelling',
    activity: 'test',
    listId: null,
    isTest: true,
    itemsTotal: 10,
    itemsCorrect: 8,
    accuracy: 80,
    score: 0,
    wpm: null,
    durationMs: 0,
    abilityBefore: null,
    abilityAfter: null,
    meta: {},
    startedAt: 0,
    endedAt: 0,
    ...over,
  }
}

function snap(sessions: SessionRecord[]): ProgressSnapshot {
  return { ...emptySnapshot(), sessions }
}

describe('gradedSessions', () => {
  it('keeps only the rounds that counted', () => {
    const rounds = [session({ isTest: true }), session({ isTest: false })]
    expect(gradedSessions(snap(rounds))).toHaveLength(1)
  })

  it('is empty rather than undefined for a learner with no history', () => {
    expect(gradedSessions(emptySnapshot())).toEqual([])
  })
})

describe('unaidedAccuracy', () => {
  it('averages over items, not over rounds', () => {
    // A ten-word round and a two-word round are not equally informative.
    const rounds = [
      session({ itemsTotal: 10, itemsCorrect: 10 }),
      session({ itemsTotal: 2, itemsCorrect: 0 }),
    ]
    expect(unaidedAccuracy(snap(rounds))).toBe(83) // 10 of 12
  })

  it('ignores practice rounds entirely', () => {
    const rounds = [
      session({ isTest: true, itemsTotal: 10, itemsCorrect: 5 }),
      session({ isTest: false, itemsTotal: 10, itemsCorrect: 10 }),
    ]
    expect(unaidedAccuracy(snap(rounds))).toBe(50)
  })

  it('says "no graded work yet" rather than reporting zero', () => {
    // Nothing attempted and everything wrong are different things, and showing
    // 0% for the first is a lie a parent would act on.
    expect(unaidedAccuracy(emptySnapshot())).toBeNull()
    expect(unaidedAccuracy(snap([session({ isTest: false })]))).toBeNull()
  })

  it('reports a real zero when graded work genuinely went badly', () => {
    expect(unaidedAccuracy(snap([session({ itemsTotal: 8, itemsCorrect: 0 })]))).toBe(0)
  })

  it('reports a whole percentage between 0 and 100', () => {
    const rounds = [session({ itemsTotal: 3, itemsCorrect: 1 })]
    const value = unaidedAccuracy(snap(rounds))!
    expect(Number.isInteger(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(100)
  })

  it('counts every subject, since the number is cross-subject', () => {
    const rounds = [
      session({ subject: 'spelling', itemsTotal: 5, itemsCorrect: 5 }),
      session({ subject: 'quiz', itemsTotal: 5, itemsCorrect: 0 }),
    ]
    expect(unaidedAccuracy(snap(rounds))).toBe(50)
  })
})

describe('bestStreak', () => {
  it('is zero for a learner who has never played', () => {
    expect(bestStreak(emptySnapshot())).toBe(0)
  })

  it('takes the longest streak across subjects, not the sum', () => {
    const snapshot: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: {
        spelling: { ...defaultSkillState('spelling'), streakDays: 3 },
        typing: { ...defaultSkillState('typing'), streakDays: 7 },
        quiz: { ...defaultSkillState('quiz'), streakDays: 1 },
      },
    }
    expect(bestStreak(snapshot)).toBe(7)
  })

  it('copes with a subject that has no state recorded', () => {
    const snapshot: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: { spelling: undefined as never },
    }
    expect(() => bestStreak(snapshot)).not.toThrow()
    expect(bestStreak(snapshot)).toBe(0)
  })
})
