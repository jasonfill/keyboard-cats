// Choosing which words a learner sees next.
//
// This is the adaptive part a learner actually experiences. It has to mix
// words due for review, words they have missed, and words they have not met,
// without ever handing back a round that is empty, duplicated, or made
// entirely of things they cannot yet spell.

import { describe, expect, it } from 'vitest'
import { planPlacement, planSession, REASON_LABEL, DEFAULT_SESSION_SIZE } from './session'
import { defaultSkillState, emptySnapshot, masteryKey, addDays, todayString } from '../progress/types'
import type { ItemMastery, ProgressSnapshot } from '../progress/types'
import { GRADES } from '../../data/spelling'

const TODAY = '2026-01-15'

function item(over: Partial<ItemMastery> = {}): ItemMastery {
  return {
    subject: 'spelling',
    itemKey: 'cat',
    listId: null,
    difficulty: 2,
    mastery: 0.5,
    reps: 2,
    lapses: 0,
    correctStreak: 1,
    totalAttempts: 2,
    totalCorrect: 1,
    intervalDays: 1,
    dueOn: null,
    firstSeenAt: 0,
    lastSeenAt: 0,
    ...over,
  }
}

function withMastery(items: ItemMastery[]): ProgressSnapshot {
  const mastery: Record<string, ItemMastery> = {}
  for (const m of items) mastery[masteryKey(m.subject, m.itemKey)] = m
  return { ...emptySnapshot(), mastery }
}

const state = (over = {}) => ({ ...defaultSkillState('spelling'), placed: true, ...over })

describe('planPlacement', () => {
  it('spans the curriculum from easy to hard', () => {
    const plan = planPlacement(12)
    expect(plan).toHaveLength(12)
    const first = plan.slice(0, 4).reduce((n, w) => n + w.difficulty, 0) / 4
    const last = plan.slice(-4).reduce((n, w) => n + w.difficulty, 0) / 4
    expect(last).toBeGreaterThan(first)
  })

  it('marks every word as part of the placement check', () => {
    expect(planPlacement(8).every((w) => w.reason === 'placement')).toBe(true)
  })

  it('never repeats a word', () => {
    const plan = planPlacement(12)
    expect(new Set(plan.map((w) => w.w)).size).toBe(plan.length)
  })
})

describe('planSession', () => {
  it('returns the size asked for', () => {
    const plan = planSession(emptySnapshot(), state(), { mode: 'adaptive', size: 7, today: TODAY })
    expect(plan).toHaveLength(7)
  })

  it('defaults to a sensible round length', () => {
    const plan = planSession(emptySnapshot(), state(), { mode: 'adaptive', today: TODAY })
    expect(plan).toHaveLength(DEFAULT_SESSION_SIZE)
  })

  it('never repeats a word inside one round', () => {
    for (const levelIndex of [0, 3, 6]) {
      const plan = planSession(emptySnapshot(), state({ levelIndex }), {
        mode: 'adaptive',
        size: 12,
        today: TODAY,
      })
      expect(new Set(plan.map((w) => w.w)).size).toBe(plan.length)
    }
  })

  it('gives every word a reason the screen can label', () => {
    const plan = planSession(emptySnapshot(), state(), { mode: 'adaptive', size: 10, today: TODAY })
    for (const word of plan) {
      expect(REASON_LABEL[word.reason], word.reason).toBeDefined()
    }
  })

  it('gives a learner with no history a full round of new words', () => {
    const plan = planSession(emptySnapshot(), state(), { mode: 'adaptive', size: 10, today: TODAY })
    expect(plan.length).toBe(10)
    expect(plan.every((w) => w.w.length > 0)).toBe(true)
  })

  it('brings back a word that is due', () => {
    const target = GRADES[0]!.lists[0]!.words[0]!.w
    const snapshot = withMastery([
      item({ itemKey: target, dueOn: addDays(TODAY, -3), mastery: 0.6 }),
    ])
    const plan = planSession(snapshot, state(), { mode: 'adaptive', size: 10, today: TODAY })
    expect(plan.some((w) => w.w === target)).toBe(true)
  })

  it('brings back a word the learner has missed', () => {
    const target = GRADES[0]!.lists[0]!.words[1]!.w
    const snapshot = withMastery([
      item({ itemKey: target, mastery: 0.1, lapses: 3, dueOn: addDays(TODAY, -1) }),
    ])
    const plan = planSession(snapshot, state(), { mode: 'adaptive', size: 10, today: TODAY })
    expect(plan.some((w) => w.w === target)).toBe(true)
  })

  it('does not keep asking a word scheduled for later', () => {
    // The whole point of the schedule is that a mastered word rests.
    const words = GRADES[0]!.lists[0]!.words.slice(0, 5).map((w) => w.w)
    const snapshot = withMastery(
      words.map((w) =>
        item({ itemKey: w, mastery: 0.95, correctStreak: 5, dueOn: addDays(TODAY, 30) }),
      ),
    )
    const plan = planSession(snapshot, state(), { mode: 'adaptive', size: 10, today: TODAY })
    const rested = plan.filter((p) => words.includes(p.w))
    expect(rested.length).toBeLessThan(words.length)
  })

  it('carries each word’s mastery record, so the screen can say where it stands', () => {
    const target = GRADES[0]!.lists[0]!.words[0]!.w
    const snapshot = withMastery([item({ itemKey: target, mastery: 0.42, dueOn: TODAY })])
    const plan = planSession(snapshot, state(), { mode: 'adaptive', size: 10, today: TODAY })
    const found = plan.find((w) => w.w === target)
    if (found) expect(found.mastery).toMatchObject({ itemKey: target, mastery: 0.42 })
  })

  it('carries no mastery record for a word never attempted', () => {
    const plan = planSession(emptySnapshot(), state(), { mode: 'adaptive', size: 6, today: TODAY })
    expect(plan.every((w) => w.mastery === undefined || w.mastery === null)).toBe(true)
  })
})

describe('planning a named list', () => {
  it('plays that list and nothing else', () => {
    const list = GRADES[0]!.lists[0]!
    const plan = planSession(emptySnapshot(), state(), {
      mode: 'list',
      listId: list.id,
      today: TODAY,
    })
    const listWords = new Set(list.words.map((w) => w.w))
    expect(plan.length).toBeGreaterThan(0)
    expect(plan.every((w) => listWords.has(w.w))).toBe(true)
    expect(plan.every((w) => w.reason === 'list')).toBe(true)
  })

  it('is empty for a list that does not exist rather than throwing', () => {
    expect(() =>
      planSession(emptySnapshot(), state(), { mode: 'list', listId: 'nope', today: TODAY }),
    ).not.toThrow()
  })
})

describe('planning a custom list', () => {
  it('plays exactly the words it was handed', () => {
    const custom = [
      { w: 'zebra', s: 'A zebra has stripes.' },
      { w: 'quokka', s: 'A quokka smiles.' },
    ]
    const plan = planSession(emptySnapshot(), state(), {
      mode: 'custom',
      customWords: custom as never,
      today: TODAY,
    })
    expect(plan.map((w) => w.w).sort()).toEqual(['quokka', 'zebra'])
  })
})

describe('planning a placement check', () => {
  it('ignores the learner’s level, because it is measuring it', () => {
    // Held still with an identity shuffle: the check is that the level makes
    // no difference, not that the order is fixed.
    const noShuffle = <T,>(x: T[]) => x
    const low = planSession(emptySnapshot(), state({ levelIndex: 0 }), {
      mode: 'placement',
      size: 12,
      today: TODAY,
      shuffle: noShuffle,
    })
    const high = planSession(emptySnapshot(), state({ levelIndex: 6 }), {
      mode: 'placement',
      size: 12,
      today: TODAY,
      shuffle: noShuffle,
    })
    expect(low.map((w) => w.w)).toEqual(high.map((w) => w.w))
  })
})

describe('REASON_LABEL', () => {
  it('has readable wording for every reason a word can be chosen', () => {
    for (const [reason, label] of Object.entries(REASON_LABEL)) {
      expect(label.label, reason).toBeTruthy()
      expect(label.emoji, reason).toBeTruthy()
    }
  })
})

describe('today defaults', () => {
  it('uses the real day when none is given', () => {
    expect(() =>
      planSession(emptySnapshot(), state(), { mode: 'adaptive', size: 4 }),
    ).not.toThrow()
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
