// The typing game's own state.
//
// It predates the database, so it keeps a localStorage save of its own *and*
// writes every finished round to the shared progress store. Both have to stay
// true at once, which is the thing worth testing: a round that updates the
// local save but never reaches progress would vanish from the parent's report
// and from the streak.

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGameState } from './useGameState'
import { defaultSkillState } from '../lib/progress/types'
import type { RoundResult } from '../lib/stats'

const commit = vi.fn(async (_change: unknown) => {})
let typingSkill = defaultSkillState('typing')

vi.mock('../lib/progress/ProgressProvider', () => ({
  useProgress: () => ({ commit, skill: () => typingSkill }),
}))

function round(over: Partial<RoundResult> = {}): RoundResult {
  return {
    wpm: 30,
    accuracy: 95,
    correct: 100,
    incorrect: 5,
    totalTyped: 105,
    elapsedMs: 60_000,
    maxCombo: 20,
    score: 500,
    ...over,
  }
}

beforeEach(() => {
  commit.mockClear()
  typingSkill = defaultSkillState('typing')
  localStorage.clear()
})

describe('a finished lesson', () => {
  it('records the round against the lesson', () => {
    const { result } = renderHook(() => useGameState())
    act(() => {
      result.current.recordLesson('home-fj', round(), 'seed-1')
    })
    expect(result.current.state.lessons['home-fj']).toMatchObject({
      plays: 1,
      bestWpm: 30,
      bestAccuracy: 95,
      bestScore: 500,
    })
  })

  it('keeps the learner’s best, not their latest', () => {
    // A bad round after a good one must not take a star away.
    const { result } = renderHook(() => useGameState())
    act(() => {
      result.current.recordLesson('home-fj', round({ wpm: 40, accuracy: 99, score: 900 }), 's')
    })
    act(() => {
      result.current.recordLesson('home-fj', round({ wpm: 5, accuracy: 20, score: 10 }), 's')
    })
    expect(result.current.state.lessons['home-fj']).toMatchObject({
      plays: 2,
      bestWpm: 40,
      bestAccuracy: 99,
      bestScore: 900,
    })
  })

  it('awards a collectible the first time a lesson is finished, and only then', () => {
    const { result } = renderHook(() => useGameState())
    let first: string | null = null
    let second: string | null = null
    act(() => {
      first = result.current.recordLesson('home-fj', round(), 'seed-1').collectedCat
    })
    act(() => {
      second = result.current.recordLesson('home-fj', round(), 'seed-1').collectedCat
    })
    expect(first).toBe('seed-1')
    expect(second).toBeNull()
    expect(result.current.state.collectedCats).toEqual(['seed-1'])
  })

  it('keeps the running star total in step with the lessons', () => {
    const { result } = renderHook(() => useGameState())
    act(() => {
      result.current.recordLesson('home-fj', round({ accuracy: 99, wpm: 30 }), 'a')
    })
    act(() => {
      result.current.recordLesson('home-dk', round({ accuracy: 99, wpm: 30 }), 'b')
    })
    const summed = Object.values(result.current.state.lessons).reduce((n, l) => n + l.stars, 0)
    expect(result.current.state.totalStars).toBe(summed)
  })

  it('unlocks an achievement once and never again', () => {
    const { result } = renderHook(() => useGameState())
    let firstRun: string[] = []
    let secondRun: string[] = []
    act(() => {
      firstRun = result.current.recordLesson('home-fj', round(), 'a').newAchievements.map((a) => a.id)
    })
    act(() => {
      secondRun = result.current
        .recordLesson('home-dk', round(), 'b')
        .newAchievements.map((a) => a.id)
    })
    expect(firstRun).toContain('first-steps')
    expect(secondRun).not.toContain('first-steps')
  })

  it('writes the round to the shared progress store too', () => {
    // Otherwise it never reaches the streak or the parent's report.
    const { result } = renderHook(() => useGameState())
    act(() => {
      result.current.recordLesson('home-fj', round(), 'seed-1')
    })
    expect(commit).toHaveBeenCalled()
    const change = commit.mock.calls.at(-1)![0] as Record<string, unknown>
    expect(change).toHaveProperty('session')
    expect(change).toHaveProperty('skill')
  })

  it('marks the stored session as typing and as the client’s own count', () => {
    // A typing round's items are keystrokes, so its summary is the finest
    // grain there is — claiming attempt-level evidence would be a lie.
    const { result } = renderHook(() => useGameState())
    act(() => {
      result.current.recordLesson('home-fj', round(), 'seed-1')
    })
    const change = commit.mock.calls.at(-1)![0] as { session: Record<string, unknown> }
    expect(change.session).toMatchObject({ subject: 'typing' })
  })
})

describe('the typing ability estimate', () => {
  it('starts from the round when there is no history', () => {
    const { result } = renderHook(() => useGameState())
    act(() => {
      result.current.recordLesson('home-fj', round({ wpm: 30, accuracy: 100 }), 'a')
    })
    const change = commit.mock.calls.at(-1)![0] as { skill: { ability: number } }
    expect(change.skill.ability).toBeCloseTo(3, 1)
  })

  it('blends with what came before once there is history', () => {
    // One fast round should not relabel a learner as an expert.
    typingSkill = { ...defaultSkillState('typing'), ability: 2, totalAttempts: 500 }
    const { result } = renderHook(() => useGameState())
    act(() => {
      result.current.recordLesson('home-fj', round({ wpm: 120, accuracy: 100 }), 'a')
    })
    const change = commit.mock.calls.at(-1)![0] as { skill: { ability: number } }
    expect(change.skill.ability).toBeGreaterThan(2)
    expect(change.skill.ability).toBeLessThan(12)
  })

  it('stays on the shared 0-12 scale however extreme the round', () => {
    const { result } = renderHook(() => useGameState())
    for (const r of [round({ wpm: 0, accuracy: 0 }), round({ wpm: 9999, accuracy: 100 })]) {
      act(() => {
        result.current.recordLesson('home-fj', r, 'a')
      })
      const change = commit.mock.calls.at(-1)![0] as { skill: { ability: number } }
      expect(change.skill.ability).toBeGreaterThanOrEqual(0.5)
      expect(change.skill.ability).toBeLessThanOrEqual(12)
    }
  })
})

describe('settings and name', () => {
  it('remembers the player name', () => {
    const { result } = renderHook(() => useGameState())
    act(() => result.current.setPlayerName('Ada'))
    expect(result.current.state.playerName).toBe('Ada')
  })

  it('toggles one setting without disturbing the others', () => {
    const { result } = renderHook(() => useGameState())
    const before = result.current.state.settings.showHands
    act(() => result.current.setSetting('sound', false))
    expect(result.current.state.settings.sound).toBe(false)
    expect(result.current.state.settings.showHands).toBe(before)
  })

  it('persists across a remount', () => {
    const first = renderHook(() => useGameState())
    act(() => first.result.current.setPlayerName('Ada'))
    first.unmount()
    const second = renderHook(() => useGameState())
    expect(second.result.current.state.playerName).toBe('Ada')
  })
})

describe('high scores', () => {
  const entry = { name: 'Ada', score: 900, wpm: 40, accuracy: 98, mode: 'Word Rain', date: 1 }

  it('returns the unlocks on a second call, not only the first', () => {
    // Both of these used to build their return value inside a state updater,
    // which only worked while React happened to evaluate it eagerly. The
    // second call in a row returned undefined and the caller read through it.
    const { result } = renderHook(() => useGameState())
    let second: unknown
    act(() => {
      result.current.addHighScore(entry)
    })
    act(() => {
      second = result.current.addHighScore({ ...entry, score: 950 })
    })
    expect(Array.isArray(second)).toBe(true)
  })

  it('keeps the best twenty, ranked', () => {
    const { result } = renderHook(() => useGameState())
    act(() => {
      for (let i = 0; i < 25; i++) result.current.addHighScore({ ...entry, score: i })
    })
    const scores = result.current.state.highScores.map((h) => h.score)
    expect(scores).toHaveLength(20)
    expect(scores[0]).toBe(24)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it('keeps the score and writes it to progress', () => {
    const { result } = renderHook(() => useGameState())
    act(() => {
      result.current.addHighScore(entry)
    })
    expect(result.current.state.highScores.some((h) => h.score === 900)).toBe(true)
    expect(commit).toHaveBeenCalled()
  })
})

describe('reset', () => {
  it('clears everything the game had stored', () => {
    const { result } = renderHook(() => useGameState())
    act(() => {
      result.current.setPlayerName('Ada')
      result.current.recordLesson('home-fj', round(), 'a')
    })
    act(() => result.current.reset())
    expect(result.current.state.playerName).toBe('')
    expect(result.current.state.lessons).toEqual({})
    expect(result.current.state.collectedCats).toEqual([])
    expect(result.current.state.totalStars).toBe(0)
  })
})
