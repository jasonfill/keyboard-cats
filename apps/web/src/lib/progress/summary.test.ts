// Cross-subject readings the student home and the parent report both quote.
//
// The number that matters is unaided accuracy. Everywhere the product talks
// about a level it means the level unaided answers earned, so if this counted
// practice the app would be quietly overstating what a child can do.

import { describe, expect, it } from 'vitest'
import { bestStreak, gradedSessions, trackReadings, unaidedAccuracy } from './summary'
import { defaultSkillState, emptySnapshot, masteryKey } from './types'
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

// ---------------------------------------------------------------------------
// Per-track reading
// ---------------------------------------------------------------------------
//
// The reason tracks exist at all. One "quiz" number averages Spanish, biology
// and state capitals and tells a parent nothing they can act on.

describe('reading progress by pool', () => {
  const TRACK_OF: Record<string, string | null> = {
    bio: 'science.biology',
    esp: 'world.spanish',
    misc: null,
  }
  const deckTrackOf = (deckId: string) => TRACK_OF[deckId]

  function withItems(entries: Array<[string, number, number]>): ProgressSnapshot {
    const mastery: Record<string, unknown> = {}
    entries.forEach(([deckId, index, score]) => {
      const itemKey = `${deckId}:c${index}`
      mastery[masteryKey('quiz', itemKey)] = {
        subject: 'quiz',
        itemKey,
        listId: deckId,
        difficulty: 2,
        mastery: score,
        reps: 4,
        lapses: 0,
        correctStreak: score >= 0.8 ? 3 : 0,
        totalAttempts: 4,
        totalCorrect: 3,
        intervalDays: 2,
        dueOn: null,
        firstSeenAt: 1,
        lastSeenAt: 100 + index,
      }
    })
    return { ...emptySnapshot(), mastery: mastery as never }
  }

  it('separates two subjects that used to be one number', () => {
    const snapshot = withItems([
      ['bio', 1, 0.9],
      ['bio', 2, 0.3],
      ['esp', 1, 0.9],
    ])
    const readings = trackReadings(snapshot, deckTrackOf)
    expect(readings.map((r) => r.name).sort()).toEqual(['Biology', 'Spanish'])
  })

  it('counts items and what is mastered in each', () => {
    const snapshot = withItems([
      ['bio', 1, 0.9],
      ['bio', 2, 0.3],
    ])
    const [bio] = trackReadings(snapshot, deckTrackOf)
    expect(bio).toMatchObject({ items: 2, mastered: 1 })
  })

  it('files unfiled work under General rather than losing it', () => {
    const readings = trackReadings(withItems([['misc', 1, 0.5]]), deckTrackOf)
    expect(readings[0].name).toBe('General')
  })

  it('leaves out pools with no work in them', () => {
    // Twenty subjects at 0% is a worse report than three a learner has touched.
    const readings = trackReadings(withItems([['bio', 1, 0.5]]), deckTrackOf)
    expect(readings).toHaveLength(1)
  })

  it('puts the most-worked pool first', () => {
    const snapshot = withItems([
      ['esp', 1, 0.5],
      ['bio', 1, 0.5],
      ['bio', 2, 0.5],
      ['bio', 3, 0.5],
    ])
    expect(trackReadings(snapshot, deckTrackOf)[0].name).toBe('Biology')
  })

  it('shows no ability number until there is enough evidence for one', () => {
    // Two answers is noise wearing a decimal point.
    const [bio] = trackReadings(withItems([['bio', 1, 0.9], ['bio', 2, 0.9]]), deckTrackOf)
    expect(bio.ability).toBeNull()
  })

  it('says nothing rather than 0% when a pool has no checked answers yet', () => {
    const [bio] = trackReadings(withItems([['bio', 1, 0.5]]), deckTrackOf)
    expect(bio.accuracy).toBeNull()
  })

  it('reports accuracy over checked answers only', () => {
    const snapshot = withItems([['bio', 1, 0.5]])
    snapshot.sessions = [
      {
        id: 's1', subject: 'quiz', track: 'science.biology', activity: 'learn', listId: 'bio',
        isTest: true, itemsTotal: 10, itemsCorrect: 9, accuracy: 90, score: 0, wpm: null,
        durationMs: 1, abilityBefore: null, abilityAfter: null, meta: {}, startedAt: 1,
        endedAt: 2, verifiedItemsTotal: 4, verifiedItemsCorrect: 2,
      },
    ] as never
    // Nine of ten looked right; four were checked and two of those were right.
    expect(trackReadings(snapshot, deckTrackOf)[0].accuracy).toBe(50)
  })

  it('names the area a pool sits in', () => {
    expect(trackReadings(withItems([['bio', 1, 0.5]]), deckTrackOf)[0].areaName).toBe('Science')
  })

  it('handles a learner who has done nothing at all', () => {
    expect(trackReadings(emptySnapshot(), deckTrackOf)).toEqual([])
  })

  it('reads a round recorded before tracks existed via its deck', () => {
    // Sessions written before 0014 have no track column. Falling back to the
    // deck it was played on keeps that history in the report instead of
    // silently dropping it into nothing.
    const snapshot = withItems([['bio', 1, 0.5]])
    snapshot.sessions = [
      {
        id: 's1', subject: 'quiz', activity: 'learn', listId: 'bio',
        isTest: true, itemsTotal: 4, itemsCorrect: 4, accuracy: 100, score: 0, wpm: null,
        durationMs: 1, abilityBefore: null, abilityAfter: null, meta: {}, startedAt: 1,
        endedAt: 2, verifiedItemsTotal: 4, verifiedItemsCorrect: 3,
      },
    ] as never
    expect(trackReadings(snapshot, deckTrackOf)[0].accuracy).toBe(75)
  })

  it('ignores a round from another subject entirely', () => {
    const snapshot = withItems([['bio', 1, 0.5]])
    snapshot.sessions = [
      {
        id: 's1', subject: 'spelling', activity: 'test', listId: 'g2-l1',
        isTest: true, itemsTotal: 4, itemsCorrect: 4, accuracy: 100, score: 0, wpm: null,
        durationMs: 1, abilityBefore: null, abilityAfter: null, meta: {}, startedAt: 1,
        endedAt: 2, verifiedItemsTotal: 4, verifiedItemsCorrect: 4,
      },
    ] as never
    expect(trackReadings(snapshot, deckTrackOf)[0].accuracy).toBeNull()
  })

  it('shows an ability number once a pool has enough evidence behind it', () => {
    const entries: Array<[string, number, number]> = Array.from(
      { length: 30 },
      (_, i) => ['bio', i, 0.9],
    )
    const snapshot = withItems(entries)
    snapshot.skills = { 'quiz:science.biology': { ability: 3.4 } } as never
    expect(trackReadings(snapshot, deckTrackOf)[0].ability).toBe(3.4)
  })

  it('says nothing when a pool is big enough but has never been scored', () => {
    const entries: Array<[string, number, number]> = Array.from(
      { length: 30 },
      (_, i) => ['bio', i, 0.5],
    )
    expect(trackReadings(withItems(entries), deckTrackOf)[0].ability).toBeNull()
  })
})
