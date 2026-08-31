// The domain rules both the API and the web app depend on.
//
// These functions were only ever exercised indirectly, through whichever
// workspace happened to import them. That is not the same as being tested:
// the evidence rules below are what let a parent believe a progress report,
// and they deserve assertions that fail here rather than three layers away.

import { describe, expect, it } from 'vitest'
import {
  addDays,
  cardKey,
  daysBetween,
  defaultSkillState,
  deriveSessionCounts,
  emptySnapshot,
  isSelfGraded,
  listKey,
  masteryKey,
  SELF_GRADED_ACTIVITIES,
  SUBJECTS,
  todayString,
  withVerifiedFlag,
  type Attempt,
} from './progress.js'

function anAttempt(over: Partial<Attempt> = {}): Attempt {
  return {
    subject: 'quiz',
    itemKey: 'deck-1:card-1',
    activity: 'learn',
    isTest: true,
    verified: true,
    correct: true,
    responseMs: 1200,
    hintsUsed: 0,
    difficulty: 2,
    given: 'answer',
    at: 1_700_000_000_000,
    ...over,
  }
}

describe('keys', () => {
  it('namespaces mastery by subject so two subjects never collide', () => {
    expect(masteryKey('spelling', 'cat')).toBe('spelling:cat')
    expect(masteryKey('quiz', 'cat')).toBe('quiz:cat')
    expect(masteryKey('spelling', 'cat')).not.toBe(masteryKey('quiz', 'cat'))
  })

  it('scopes a card to its deck, so the same term on two decks is two things', () => {
    expect(cardKey('deck-a', 'c1')).toBe('deck-a:c1')
    expect(cardKey('deck-b', 'c1')).not.toBe(cardKey('deck-a', 'c1'))
  })

  it('keys a list by subject too', () => {
    expect(listKey('spelling', 'g2-l1')).toBe('spelling:g2-l1')
  })
})

describe('starting state', () => {
  it('gives every subject a skill state', () => {
    for (const subject of SUBJECTS) {
      expect(defaultSkillState(subject).subject).toBe(subject)
    }
  })

  it('starts spelling at second grade, because that is where the curriculum starts', () => {
    expect(defaultSkillState('spelling').ability).toBe(2)
  })

  it('starts nobody as placed, and nobody with a streak', () => {
    for (const subject of SUBJECTS) {
      const state = defaultSkillState(subject)
      expect(state.placed).toBe(false)
      expect(state.streakDays).toBe(0)
      expect(state.lastActiveOn).toBeNull()
    }
  })

  it('hands back an empty snapshot with every collection present', () => {
    const snap = emptySnapshot()
    expect(snap.decks).toEqual([])
    expect(snap.sessions).toEqual([])
    expect(Object.keys(snap.mastery)).toHaveLength(0)
  })
})

describe('calendar days', () => {
  it('formats a local date, not a UTC one', () => {
    expect(todayString(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('adds days across a month boundary', () => {
    expect(addDays('2026-01-30', 3)).toBe('2026-02-02')
  })

  it('adds days across a leap year', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('subtracts', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts the gap between two days in both directions', () => {
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7)
    expect(daysBetween('2026-01-08', '2026-01-01')).toBe(-7)
    expect(daysBetween('2026-01-01', '2026-01-01')).toBe(0)
  })

  it('is unaffected by daylight saving, because it compares UTC midnights', () => {
    // US DST begins 2026-03-08; a naive local-time subtraction returns 0.96 days.
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2)
  })
})

describe('verification is decided by the mode, not claimed by the caller', () => {
  it('knows which activities grade themselves', () => {
    expect(isSelfGraded('flashcards')).toBe(true)
    expect(isSelfGraded('learn')).toBe(false)
    expect(SELF_GRADED_ACTIVITIES).toContain('flashcards')
  })

  it('corrects a flashcard attempt that claims to have been checked', () => {
    const claimed = anAttempt({ activity: 'flashcards', verified: true })
    expect(withVerifiedFlag(claimed).verified).toBe(false)
  })

  it('leaves a checked mode alone, and returns the same object when nothing changes', () => {
    const attempt = anAttempt({ activity: 'test', verified: true })
    expect(withVerifiedFlag(attempt)).toBe(attempt)
  })

  it('never promotes an unverified attempt to verified', () => {
    const attempt = anAttempt({ activity: 'test', verified: false })
    expect(withVerifiedFlag(attempt).verified).toBe(false)
  })
})

describe('a session summary is derived from its attempts', () => {
  it('reports nothing to derive when there are no attempts', () => {
    expect(deriveSessionCounts([])).toBeNull()
  })

  it('counts distinct items, not answers', () => {
    const counts = deriveSessionCounts([
      anAttempt({ itemKey: 'd:1', correct: true }),
      anAttempt({ itemKey: 'd:2', correct: false }),
    ])
    expect(counts).toMatchObject({ itemsTotal: 2, itemsCorrect: 1, accuracy: 50 })
  })

  it('scores the first answer to an item, so going back over a miss cannot hurt', () => {
    // The round asked d:1 again after it was missed, and the learner got it.
    const counts = deriveSessionCounts([
      anAttempt({ itemKey: 'd:1', correct: false }),
      anAttempt({ itemKey: 'd:2', correct: true }),
      anAttempt({ itemKey: 'd:1', correct: true }),
    ])
    expect(counts).toMatchObject({ itemsTotal: 2, itemsCorrect: 1 })
  })

  it('separates the same item key in two different subjects', () => {
    const counts = deriveSessionCounts([
      anAttempt({ subject: 'spelling', itemKey: 'cat' }),
      anAttempt({ subject: 'quiz', itemKey: 'cat' }),
    ])
    expect(counts?.itemsTotal).toBe(2)
  })

  it('counts checked answers separately from the headline', () => {
    const counts = deriveSessionCounts([
      anAttempt({ itemKey: 'd:1', activity: 'flashcards', correct: true }),
      anAttempt({ itemKey: 'd:2', activity: 'learn', correct: true }),
      anAttempt({ itemKey: 'd:3', activity: 'learn', correct: false }),
    ])
    // Three right-looking items, but only the two the app checked count as checked.
    expect(counts).toMatchObject({
      itemsTotal: 3,
      itemsCorrect: 2,
      verifiedItemsTotal: 2,
      verifiedItemsCorrect: 1,
    })
  })

  it('gives a wholly self-graded round no checked answers at all', () => {
    const counts = deriveSessionCounts([
      anAttempt({ itemKey: 'd:1', activity: 'flashcards', verified: true, correct: true }),
      anAttempt({ itemKey: 'd:2', activity: 'flashcards', verified: true, correct: true }),
    ])
    // This is what stops a self-graded round clearing a score bar or earning a reward.
    expect(counts).toMatchObject({ verifiedItemsTotal: 0, verifiedItemsCorrect: 0 })
  })

  it('says where the counts came from', () => {
    expect(deriveSessionCounts([anAttempt()])?.evidence).toBe('attempts')
  })

  it('rounds accuracy to a whole percent', () => {
    const counts = deriveSessionCounts([
      anAttempt({ itemKey: 'a', correct: true }),
      anAttempt({ itemKey: 'b', correct: true }),
      anAttempt({ itemKey: 'c', correct: false }),
    ])
    expect(counts?.accuracy).toBe(67)
  })
})
