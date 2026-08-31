// The seam where a round in progress becomes a stored record.
//
// Everything downstream — the level, the parent's report, what earns a reward
// — is a reading of what these functions wrote, so a mistake here is invisible
// at the point it happens and wrong everywhere afterwards.

import { describe, expect, it } from 'vitest'
import { applyChange, mergeSnapshots, withDerivedEvidence, SESSION_HISTORY_LIMIT } from './repo'
import { defaultSkillState, emptySnapshot, masteryKey } from './types'
import type { Attempt, ProgressSnapshot, SessionRecord } from './types'

function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    subject: 'spelling',
    itemKey: 'cat',
    activity: 'test',
    isTest: true,
    verified: true,
    correct: true,
    responseMs: 100,
    hintsUsed: 0,
    difficulty: 2,
    given: 'cat',
    at: 0,
    ...over,
  }
}

function session(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 's1',
    subject: 'spelling',
    activity: 'test',
    listId: null,
    isTest: true,
    itemsTotal: 0,
    itemsCorrect: 0,
    accuracy: 0,
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

describe('withDerivedEvidence — the summary must agree with the answers', () => {
  it('recomputes a session summary from its attempts, ignoring what was claimed', () => {
    const change = withDerivedEvidence({
      session: session({ itemsTotal: 99, itemsCorrect: 99, accuracy: 100 }),
      attempts: [
        attempt({ itemKey: 'a', correct: true }),
        attempt({ itemKey: 'b', correct: false }),
      ],
    })
    expect(change.session).toMatchObject({
      itemsTotal: 2,
      itemsCorrect: 1,
      accuracy: 50,
      evidence: 'attempts',
    })
  })

  it('scores the first look at each item, not the retry', () => {
    // A missed word comes back before the round is out. Going back over it
    // must not score worse than never returning to it.
    const change = withDerivedEvidence({
      session: session(),
      attempts: [
        attempt({ itemKey: 'a', correct: false }),
        attempt({ itemKey: 'a', correct: true }),
        attempt({ itemKey: 'b', correct: true }),
      ],
    })
    expect(change.session).toMatchObject({ itemsTotal: 2, itemsCorrect: 1, accuracy: 50 })
  })

  it('overrules a claim of verified on a self-graded mode', () => {
    // The heart of it: whether an answer was checked is a property of the mode,
    // never something the caller gets to assert.
    const change = withDerivedEvidence({
      session: session({ activity: 'flashcards' }),
      attempts: [
        attempt({ itemKey: 'a', activity: 'flashcards', verified: true, correct: true }),
        attempt({ itemKey: 'b', activity: 'flashcards', verified: true, correct: true }),
      ],
    })
    expect(change.session?.verifiedItemsTotal).toBe(0)
    expect(change.attempts?.every((a) => a.verified === false)).toBe(true)
  })

  it('keeps verified answers verified on a checked mode', () => {
    const change = withDerivedEvidence({
      session: session(),
      attempts: [attempt({ itemKey: 'a' }), attempt({ itemKey: 'b', correct: false })],
    })
    expect(change.session).toMatchObject({ verifiedItemsTotal: 2, verifiedItemsCorrect: 1 })
  })

  it("marks a session with no attempts as the client's own account", () => {
    // A typing round's items are keystrokes; its summary is the finest grain
    // there is, and saying so is more honest than inventing counts.
    const change = withDerivedEvidence({ session: session({ subject: 'typing', itemsTotal: 40 }) })
    expect(change.session?.evidence).toBe('client')
    expect(change.session?.itemsTotal).toBe(40)
  })

  it('makes the daily rollup agree with the same attempts', () => {
    const change = withDerivedEvidence({
      session: session(),
      daily: { subject: 'spelling', seconds: 60, items: 99, correct: 99 },
      attempts: [attempt({ itemKey: 'a' }), attempt({ itemKey: 'b', correct: false })],
    })
    expect(change.daily).toMatchObject({ items: 2, correct: 1 })
  })

  it('passes through a change carrying neither session nor attempts', () => {
    const change = { customLists: [] }
    expect(withDerivedEvidence(change)).toBe(change)
  })
})

describe('applyChange', () => {
  it('replaces the skill state for its subject only', () => {
    const before: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: { typing: defaultSkillState('typing') },
    }
    const next = applyChange(before, {
      skill: { ...defaultSkillState('spelling'), ability: 4 },
    })
    expect(next.skills.spelling?.ability).toBe(4)
    expect(next.skills.typing).toBeDefined()
  })

  it('does not mutate the snapshot it was given', () => {
    const before = emptySnapshot()
    const frozen = JSON.stringify(before)
    applyChange(before, { session: session() })
    expect(JSON.stringify(before)).toBe(frozen)
  })

  it('puts the newest session first', () => {
    const one = applyChange(emptySnapshot(), { session: session({ id: 'a' }) })
    const two = applyChange(one, { session: session({ id: 'b' }) })
    expect(two.sessions.map((s) => s.id)).toEqual(['b', 'a'])
  })

  it('caps the session history so a long-lived device cannot grow forever', () => {
    let snap = emptySnapshot()
    for (let i = 0; i < SESSION_HISTORY_LIMIT + 25; i++) {
      snap = applyChange(snap, { session: session({ id: `s${i}` }) })
    }
    expect(snap.sessions).toHaveLength(SESSION_HISTORY_LIMIT)
    expect(snap.sessions[0]!.id).toBe(`s${SESSION_HISTORY_LIMIT + 24}`)
  })

  it('keys mastery by subject and item, so two subjects can share a key', () => {
    const next = applyChange(emptySnapshot(), {
      mastery: [
        { subject: 'spelling', itemKey: 'a', mastery: 0.5 },
        { subject: 'quiz', itemKey: 'a', mastery: 0.9 },
      ] as never,
    })
    expect(next.mastery[masteryKey('spelling', 'a')]).toMatchObject({ mastery: 0.5 })
    expect(next.mastery[masteryKey('quiz', 'a')]).toMatchObject({ mastery: 0.9 })
  })

  it('never unlocks the same achievement twice', () => {
    const one = applyChange(emptySnapshot(), {
      achievements: [{ achievementId: 'first-steps', unlockedAt: 1 }] as never,
    })
    const two = applyChange(one, {
      achievements: [{ achievementId: 'first-steps', unlockedAt: 2 }] as never,
    })
    expect(two.achievements).toHaveLength(1)
    expect(two.achievements[0]!.unlockedAt).toBe(1)
  })

  it('keeps only the best high scores, ranked', () => {
    let snap = emptySnapshot()
    for (const score of [10, 900, 50, 400]) {
      snap = applyChange(snap, {
        highScore: { name: 'x', score, wpm: 0, accuracy: 0, mode: 'm', date: 0 } as never,
      })
    }
    expect(snap.highScores.map((h) => h.score)).toEqual([900, 400, 50, 10])
  })
})

describe('mergeSnapshots — signing in must never cost a learner progress', () => {
  it('adds the attempt counts from both sides', () => {
    const cloud: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: {
        spelling: { ...defaultSkillState('spelling'), totalAttempts: 10, totalCorrect: 6 },
      },
    }
    const local: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: {
        spelling: { ...defaultSkillState('spelling'), totalAttempts: 4, totalCorrect: 3 },
      },
    }
    const merged = mergeSnapshots(cloud, local)
    expect(merged.skills.spelling).toMatchObject({ totalAttempts: 14, totalCorrect: 9 })
  })

  it('keeps the higher level and ability rather than the newer one', () => {
    const cloud: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: {
        spelling: {
          ...defaultSkillState('spelling'),
          totalAttempts: 100,
          levelIndex: 1,
          ability: 3,
        },
      },
    }
    const local: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: {
        spelling: { ...defaultSkillState('spelling'), totalAttempts: 1, levelIndex: 4, ability: 6 },
      },
    }
    const merged = mergeSnapshots(cloud, local)
    expect(merged.skills.spelling).toMatchObject({ levelIndex: 4, ability: 6 })
  })

  it('keeps the best streak from either side', () => {
    const cloud: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: {
        spelling: { ...defaultSkillState('spelling'), streakDays: 2, bestStreakDays: 9 },
      },
    }
    const local: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: {
        spelling: { ...defaultSkillState('spelling'), streakDays: 5, bestStreakDays: 5 },
      },
    }
    const merged = mergeSnapshots(cloud, local)
    expect(merged.skills.spelling).toMatchObject({ streakDays: 5, bestStreakDays: 9 })
  })

  it('keeps a subject present on only one side', () => {
    const cloud: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: { spelling: defaultSkillState('spelling') },
    }
    const local: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: { typing: defaultSkillState('typing') },
    }
    const merged = mergeSnapshots(cloud, local)
    expect(Object.keys(merged.skills).sort()).toEqual(['spelling', 'typing'])
  })

  it('remembers a learner was placed if either side says so', () => {
    const cloud: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: { spelling: { ...defaultSkillState('spelling'), placed: false, totalAttempts: 50 } },
    }
    const local: ProgressSnapshot = {
      ...emptySnapshot(),
      skills: { spelling: { ...defaultSkillState('spelling'), placed: true } },
    }
    expect(mergeSnapshots(cloud, local).skills.spelling?.placed).toBe(true)
  })
})
