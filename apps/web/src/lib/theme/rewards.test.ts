// The reward rule is the one place in the theme system where getting it wrong
// costs a child something real, so it is the one place worth pinning hardest.
//
// Two invariants these tests exist to defend:
//
//   1. Earn rate is identical across all ten themes. If it ever is not,
//      switching theme becomes a way to farm easy wins.
//   2. Nothing a learner merely *claims* can buy a collectible. Only rounds
//      the system checked count.

import { describe, expect, it } from 'vitest'
import { earnedFor } from './rewards'
import { THEMES, themeById } from '../themes'
import type { ProgressSnapshot, SessionRecord } from '../progress/types'

function session(over: Partial<SessionRecord> = {}): SessionRecord {
  const itemsTotal = over.itemsTotal ?? 10
  return {
    id: Math.random().toString(36).slice(2),
    subject: 'spelling',
    activity: 'test',
    listId: null,
    isTest: true,
    itemsTotal,
    itemsCorrect: itemsTotal,
    accuracy: 90,
    score: 100,
    wpm: null,
    durationMs: 1000,
    abilityBefore: 2,
    abilityAfter: 2,
    meta: { predictedAccuracy: 70 },
    startedAt: 0,
    endedAt: 0,
    evidence: 'attempts',
    verifiedItemsTotal: itemsTotal,
    verifiedItemsCorrect: itemsTotal,
    ...over,
  }
}

function snapshot(sessions: SessionRecord[]): ProgressSnapshot {
  return {
    skills: {},
    mastery: {},
    lists: {},
    sessions,
    achievements: [],
    highScores: [],
    daily: [],
    customLists: [],
    decks: [],
  } as unknown as ProgressSnapshot
}

const cats = themeById('cats')

describe('what earns a collectible', () => {
  it('counts a graded round that cleared its prediction', () => {
    const e = earnedFor(snapshot([session({ accuracy: 90, meta: { predictedAccuracy: 70 } })]), cats)
    expect(e.fromRounds).toBe(1)
    expect(e.owned).toBe(1)
  })

  it('counts a round that exactly meets its prediction', () => {
    const e = earnedFor(snapshot([session({ accuracy: 70, meta: { predictedAccuracy: 70 } })]), cats)
    expect(e.fromRounds).toBe(1)
  })

  it('does not count a graded round that missed its prediction', () => {
    const e = earnedFor(snapshot([session({ accuracy: 69, meta: { predictedAccuracy: 70 } })]), cats)
    expect(e.owned).toBe(0)
  })

  it('does not count practice, however well it went', () => {
    const e = earnedFor(
      snapshot([session({ isTest: false, accuracy: 100, meta: { predictedAccuracy: 10 } })]),
      cats,
    )
    expect(e.owned).toBe(0)
  })

  it('counts a level promotion', () => {
    const e = earnedFor(
      snapshot([session({ meta: { level: 'promote' }, accuracy: 50 })]),
      cats,
    )
    expect(e.fromPromotions).toBe(1)
  })

  it('ignores a round with no prediction recorded to beat', () => {
    const e = earnedFor(snapshot([session({ meta: {} })]), cats)
    expect(e.owned).toBe(0)
  })
})

describe('a claim never buys a reward', () => {
  it('rejects a graded round where some answers were self-graded', () => {
    // The shape a flashcard self-grade would take if a graded mode ever
    // allowed one: isTest true, but not every item was checked by the app.
    const e = earnedFor(
      snapshot([session({ itemsTotal: 10, verifiedItemsTotal: 4, verifiedItemsCorrect: 4 })]),
      cats,
    )
    expect(e.owned).toBe(0)
  })

  it('rejects a self-graded round even when it claims a promotion', () => {
    const e = earnedFor(
      snapshot([
        session({ meta: { level: 'promote' }, itemsTotal: 10, verifiedItemsTotal: 0 }),
      ]),
      cats,
    )
    expect(e.owned).toBe(0)
  })

  it('rejects legacy rows with no provenance at all', () => {
    const e = earnedFor(
      snapshot([session({ evidence: 'legacy', verifiedItemsTotal: undefined })]),
      cats,
    )
    expect(e.owned).toBe(0)
  })
})

describe('earn rate is fixed across all ten themes', () => {
  const history = snapshot([
    session({ accuracy: 90, meta: { predictedAccuracy: 70 } }),
    session({ accuracy: 60, meta: { predictedAccuracy: 80 } }), // missed
    session({ isTest: false, accuracy: 100, meta: { predictedAccuracy: 10 } }), // practice
    session({ meta: { level: 'promote' } }),
  ])

  it('awards the same number of items whichever world is on', () => {
    const counts = THEMES.map((t) => earnedFor(history, t).owned)
    expect(new Set(counts).size).toBe(1)
    expect(counts[0]).toBe(2) // one cleared round, one promotion
  })

  it('differs only in the size of the set, never in what was earned', () => {
    for (const t of THEMES) {
      const e = earnedFor(history, t)
      expect(e.fromRounds).toBe(1)
      expect(e.fromPromotions).toBe(1)
      expect(e.total).toBe(t.total)
    }
  })
})

describe('bounds', () => {
  it('never reports more owned than the set holds', () => {
    const many = snapshot(Array.from({ length: 200 }, () => session()))
    for (const t of THEMES) {
      const e = earnedFor(many, t)
      expect(e.owned).toBe(t.total)
      expect(e.fraction).toBeLessThanOrEqual(1)
    }
  })

  it('reports nothing owned for a learner who has done nothing', () => {
    const e = earnedFor(snapshot([]), cats)
    expect(e).toMatchObject({ owned: 0, fraction: 0, fromRounds: 0, fromPromotions: 0 })
  })
})
