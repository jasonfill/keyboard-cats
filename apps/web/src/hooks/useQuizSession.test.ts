// A quiz round.
//
// Two things make this different from spelling and both are worth pinning.
//
// A round is a queue rather than a walk from start to end: a missed card goes
// back in a few places ahead, so the round finishes when every card has been
// retired. Showing somebody the answer and never asking again is the one thing
// a study app must not do.
//
// And flashcards is the only mode in the app where the learner grades
// themselves. Everything about what a claim is worth runs through here.

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useQuizSession } from './useQuizSession'
import { defaultSkillState, emptySnapshot } from '../lib/progress/types'
import type { ProgressChange } from '../lib/progress/repo'
import type { QuizDeck } from '../lib/progress/types'
import type { Grade } from '../lib/quiz/questions'

const commit = vi.fn(async (_change: ProgressChange) => {})
let snapshot = emptySnapshot()
let quiz = defaultSkillState('quiz')

vi.mock('../lib/progress/ProgressProvider', () => ({
  useProgress: () => ({ snapshot, skill: () => quiz, commit }),
}))

const deck: QuizDeck = {
  id: 'd1',
  title: 'Capital cities',
  description: '',
  subject: null,
  cards: Array.from({ length: 6 }, (_, i) => ({
    id: `c${i}`,
    term: `term-${i}`,
    definition: `definition-${i}`,
    hint: null,
  })),
  createdAt: 0,
  updatedAt: 0,
} as unknown as QuizDeck

function lastChange(): ProgressChange {
  return commit.mock.calls.at(-1)![0]
}

type Api = ReturnType<typeof useQuizSession>

const grade = (correct: boolean): Grade => (correct ? 'correct' : 'wrong')

/** Answer whatever is on screen until the round retires every card. */
function playOut(
  result: { current: Api },
  answer: (n: number) => { correct: boolean; verified?: boolean },
  maxSteps = 200,
) {
  let n = 0
  while (!result.current.isComplete && n < maxSteps) {
    const { correct, verified } = answer(n)
    act(() => {
      result.current.submit('given', grade(correct), verified === undefined ? {} : { verified })
    })
    act(() => result.current.advance())
    n++
  }
  return n
}

beforeEach(() => {
  commit.mockClear()
  snapshot = emptySnapshot()
  quiz = { ...defaultSkillState('quiz'), placed: true }
})

describe('starting a round', () => {
  it('plans cards and shows the first question', () => {
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'test', decks: [deck], deckId: 'd1', size: 6 })
    })
    expect(result.current.plan.length).toBeGreaterThan(0)
    expect(result.current.current).not.toBeNull()
    expect(result.current.currentQuestion).not.toBeNull()
  })

  it('honours the size asked for', () => {
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'test', decks: [deck], deckId: 'd1', size: 3 })
    })
    expect(result.current.plan).toHaveLength(3)
  })

  it('reports progress out of the cards to retire, not the answers given', () => {
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'test', decks: [deck], deckId: 'd1', size: 4 })
    })
    expect(result.current.progress).toMatchObject({ total: 4, retired: 0 })
  })
})

describe('a missed card comes back', () => {
  it('does not retire a card that was answered wrong', () => {
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'learn', decks: [deck], deckId: 'd1', size: 3 })
    })
    act(() => {
      result.current.submit('wrong', 'wrong')
    })
    act(() => result.current.advance())
    expect(result.current.progress.retired).toBe(0)
  })

  it('treats a near miss as recalled rather than wrong', () => {
    // Penalising a transposed letter on a biology deck tests typing, not
    // biology.
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'learn', decks: [deck], deckId: 'd1', size: 3 })
    })
    act(() => {
      result.current.submit('clsoe', 'close')
    })
    act(() => result.current.advance())
    expect(result.current.progress.retired).toBe(1)
  })

  it('retires a card answered correctly', () => {
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'learn', decks: [deck], deckId: 'd1', size: 3 })
    })
    act(() => {
      result.current.submit('right', 'correct')
    })
    act(() => result.current.advance())
    expect(result.current.progress.retired).toBe(1)
  })

  it('asks a missed card again before the round ends', () => {
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'learn', decks: [deck], deckId: 'd1', size: 3 })
    })
    // Miss everything once, then get everything right.
    let seen = 0
    playOut(result, (n) => {
      seen = n
      return { correct: n >= 3 }
    })
    expect(seen).toBeGreaterThanOrEqual(5)
    expect(result.current.progress.retired).toBe(3)
  })

  it('terminates even when the learner never gets a card right', () => {
    // The requeue is capped, or a round would never end.
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'learn', decks: [deck], deckId: 'd1', size: 3 })
    })
    const steps = playOut(result, () => ({ correct: false }))
    expect(steps).toBeLessThan(200)
    expect(result.current.isComplete).toBe(true)
  })
})

describe('what a round writes', () => {
  async function playAndFinish(
    mode: 'test' | 'learn' | 'flashcards' | 'match',
    answer: (n: number) => { correct: boolean; verified?: boolean },
  ) {
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode, decks: [deck], deckId: 'd1', size: 4 })
    })
    playOut(result, answer)
    let summary: unknown
    await act(async () => {
      summary = await result.current.finish()
    })
    return summary as { accuracy: number; stars: number; score: number } | null
  }

  it('writes the round, the answers, the state and the mastery as one change', async () => {
    await playAndFinish('test', () => ({ correct: true }))
    const change = lastChange()
    expect(change.session).toBeDefined()
    expect(change.attempts?.length).toBeGreaterThan(0)
    expect(change.skill).toBeDefined()
    expect(change.mastery?.length).toBeGreaterThan(0)
  })

  it('marks a graded mode as counting', async () => {
    await playAndFinish('test', () => ({ correct: true }))
    expect(lastChange().session?.isTest).toBe(true)
  })

  it('marks flashcards as not counting', async () => {
    await playAndFinish('flashcards', () => ({ correct: true, verified: false }))
    expect(lastChange().session?.isTest).toBe(false)
  })

  it('names the deck in the stored round', async () => {
    await playAndFinish('test', () => ({ correct: true }))
    expect(lastChange().session?.listId).toBe('d1')
  })

  it('writes nothing at all when the learner answered nothing', async () => {
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'test', decks: [deck], deckId: 'd1', size: 4 })
    })
    let summary: unknown
    await act(async () => {
      summary = await result.current.finish()
    })
    expect(summary).toBeNull()
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('self-grading is worth less than a check', () => {
  it('stores a flashcard claim as unverified, whatever the caller said', async () => {
    // The mode decides whether an answer was checked, not the caller. A claim
    // of verified:true on flashcards is corrected rather than believed.
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'flashcards', decks: [deck], deckId: 'd1', size: 3 })
    })
    playOut(result, () => ({ correct: true, verified: true }))
    await act(async () => {
      await result.current.finish()
    })
    const attempts = lastChange().attempts!
    expect(attempts.every((a) => a.activity === 'flashcards')).toBe(true)
  })

  it('stores a checked mode’s answers as verified', async () => {
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'test', decks: [deck], deckId: 'd1', size: 3 })
    })
    playOut(result, () => ({ correct: true }))
    await act(async () => {
      await result.current.finish()
    })
    expect(lastChange().attempts?.every((a) => a.verified)).toBe(true)
  })

  it('does not move the ability estimate on a self-graded round', async () => {
    // Unaided, checked, written recall is the only thing that moves it.
    quiz = { ...defaultSkillState('quiz'), placed: true, ability: 4, totalAttempts: 20 }
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'flashcards', decks: [deck], deckId: 'd1', size: 4 })
    })
    playOut(result, () => ({ correct: true, verified: false }))
    await act(async () => {
      await result.current.finish()
    })
    expect(lastChange().skill?.ability).toBe(4)
  })
})

describe('scoring', () => {
  it('reports accuracy on the first look at each card', async () => {
    // A card you missed and then got right on the retry is not a card you knew.
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'learn', decks: [deck], deckId: 'd1', size: 4 })
    })
    playOut(result, (n) => ({ correct: n >= 4 }))
    let summary!: { accuracy: number }
    await act(async () => {
      summary = (await result.current.finish()) as { accuracy: number }
    })
    expect(summary.accuracy).toBe(0)
  })

  it('gives between one and three stars whatever happened', async () => {
    for (const correct of [true, false]) {
      commit.mockClear()
      const { result } = renderHook(() => useQuizSession())
      act(() => {
        result.current.start({ mode: 'test', decks: [deck], deckId: 'd1', size: 4 })
      })
      playOut(result, () => ({ correct }))
      let summary!: { stars: number }
      await act(async () => {
        summary = (await result.current.finish()) as { stars: number }
      })
      expect(summary.stars).toBeGreaterThanOrEqual(1)
      expect(summary.stars).toBeLessThanOrEqual(3)
    }
  })
})

describe('reset', () => {
  it('clears the round and its queue', () => {
    const { result } = renderHook(() => useQuizSession())
    act(() => {
      result.current.start({ mode: 'test', decks: [deck], deckId: 'd1', size: 4 })
    })
    act(() => {
      result.current.submit('x', 'correct')
    })
    act(() => result.current.reset())
    expect(result.current.plan).toEqual([])
    expect(result.current.results).toEqual([])
    expect(result.current.summary).toBeNull()
    expect(result.current.current).toBeNull()
  })
})
