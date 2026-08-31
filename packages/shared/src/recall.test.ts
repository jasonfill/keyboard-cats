// Free recall of a whole set, and fluency.
//
// The property that makes brain dump worth building: unprompted free recall of
// a *closed* set is fully machine-checkable, because we hold the answer key.
// Most flashcard apps cannot do this; we can.

import { describe, expect, it } from 'vitest'
import { fluency, fluencyLine, FLUENT_MS, gradeRecall, isFluent, splitRecall } from './recall.js'
import type { QuizCard } from './progress.js'

const cards: QuizCard[] = ['Paris', 'Berlin', 'Madrid', 'Rome'].map((c, i) => ({
  id: `c${i}`,
  term: `Capital ${i}`,
  definition: c,
  hint: null,
  difficulty: 2,
}))

/** Stands in for the app's real written grading. */
const grade = (given: string, answer: string): 'correct' | 'close' | 'wrong' => {
  const g = given.trim().toLowerCase()
  const a = answer.trim().toLowerCase()
  if (g === a) return 'correct'
  if (a.startsWith(g) && g.length >= a.length - 1 && g.length > 2) return 'close'
  return 'wrong'
}

describe('reading what somebody emptied out of their head', () => {
  it('splits on whatever they used', () => {
    expect(splitRecall('Paris, Berlin\nMadrid; Rome')).toEqual([
      'Paris',
      'Berlin',
      'Madrid',
      'Rome',
    ])
  })

  it('takes bullets and numbering off', () => {
    // Whether they wrote a list or a paragraph is not the thing being tested.
    expect(splitRecall('- Paris\n* Berlin\n1. Madrid\n2) Rome')).toEqual([
      'Paris',
      'Berlin',
      'Madrid',
      'Rome',
    ])
  })

  it('drops the blanks a trailing comma leaves', () => {
    expect(splitRecall('Paris,,  ,Berlin,')).toEqual(['Paris', 'Berlin'])
  })

  it('copes with nothing written at all', () => {
    expect(splitRecall('')).toEqual([])
    expect(splitRecall('   \n  ')).toEqual([])
  })
})

describe('grading it against the set', () => {
  it('counts what they got', () => {
    const result = gradeRecall('Paris, Berlin', cards, grade)
    expect(result.matched.map((m) => m.card.definition)).toEqual(['Paris', 'Berlin'])
  })

  it('reports everything they did not write as missed', () => {
    // These are real misses, and they go straight back into the schedule.
    const result = gradeRecall('Paris', cards, grade)
    expect(result.missed.map((c) => c.definition)).toEqual(['Berlin', 'Madrid', 'Rome'])
  })

  it('credits a near miss, like every other written answer in the app', () => {
    const result = gradeRecall('Pari', cards, grade)
    expect(result.matched).toHaveLength(1)
    expect(result.matched[0]!.exact).toBe(false)
  })

  it('lets an exact answer claim its card before a near miss can take it', () => {
    // Otherwise "Pari" swallows Paris and the person who also wrote "Paris"
    // gets it marked as a near miss.
    const result = gradeRecall('Pari, Paris', cards, grade)
    const paris = result.matched.find((m) => m.card.definition === 'Paris')
    expect(paris?.exact).toBe(true)
  })

  it('does not let one answer written six times score six times', () => {
    const result = gradeRecall('Paris, Paris, Paris', cards, grade)
    expect(result.matched).toHaveLength(1)
  })

  it('reports what matched nothing without counting it against them', () => {
    // Writing a wrong capital is not the same as failing a card, and treating
    // it as one would make guessing wildly expensive.
    const result = gradeRecall('Paris, Atlantis', cards, grade)
    expect(result.unmatched).toEqual(['Atlantis'])
    expect(result.missed).toHaveLength(3)
  })

  it('treats an empty answer as remembering nothing, not as an error', () => {
    const result = gradeRecall('', cards, grade)
    expect(result.matched).toEqual([])
    expect(result.missed).toHaveLength(4)
  })

  it('handles a set with nothing in it', () => {
    expect(gradeRecall('Paris', [], grade)).toMatchObject({ matched: [], missed: [] })
  })
})

describe('fluency', () => {
  it('takes the middle, so one long pause does not move it', () => {
    // Somebody answered the door. That is not a fact about their recall.
    expect(fluency([1000, 1200, 1100, 60_000])?.medianMs).toBe(1150)
  })

  it('ignores answers with no time recorded', () => {
    expect(fluency([null, 2000, null])).toMatchObject({ medianMs: 2000, answers: 1 })
  })

  it('says nothing when there is nothing to say', () => {
    expect(fluency([])).toBeNull()
    expect(fluency([null, null])).toBeNull()
  })

  it('calls a quick answer automatic', () => {
    expect(isFluent(900)).toBe(true)
    expect(isFluent(FLUENT_MS + 1)).toBe(false)
    expect(isFluent(null)).toBe(false)
  })
})

describe('the line an older learner opens the app for', () => {
  it('reads as evidence about them', () => {
    const line = fluencyLine(340, 96, { medianMs: 1400, answers: 50 }, { medianMs: 3100, answers: 50 })
    expect(line).toBe('340 known cold · 96% still right after 30 days · median recall 1.4s, down from 3.1s')
  })

  it('does not claim an improvement that has not happened', () => {
    const line = fluencyLine(10, null, { medianMs: 2000, answers: 5 }, { medianMs: 1000, answers: 5 })
    expect(line).not.toMatch(/down from/)
  })

  it('says only what it knows', () => {
    expect(fluencyLine(10, null, null, null)).toBe('10 known cold')
  })
})
