import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  loadState,
  saveState,
  resetState,
  type GameState,
  type HighScore,
} from '../lib/storage'
import { ACHIEVEMENTS, type Achievement } from '../data/achievements'
import { starRating } from '../lib/stats'
import type { RoundResult } from '../lib/stats'

export interface LessonOutcome extends RoundResult {
  lessonId: string
  stars: number
  newAchievements: Achievement[]
  collectedCat: string | null
}

function recomputeTotals(s: GameState): GameState {
  const totalStars = Object.values(s.lessons).reduce((a, l) => a + l.stars, 0)
  return { ...s, totalStars }
}

export function useGameState() {
  const [state, setState] = useState<GameState>(() => loadState())
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    saveState(state)
  }, [state])

  const setPlayerName = useCallback((name: string) => {
    setState((s) => ({ ...s, playerName: name.slice(0, 16) }))
  }, [])

  const setSetting = useCallback(
    (key: keyof GameState['settings'], value: boolean) => {
      setState((s) => ({ ...s, settings: { ...s.settings, [key]: value } }))
    },
    [],
  )

  // Record a completed lesson round; returns stars + any new unlocks.
  const recordLesson = useCallback(
    (
      lessonId: string,
      result: RoundResult,
      catSeed: string,
    ): LessonOutcome => {
      const stars = starRating(result.accuracy, result.wpm)
      let outcome!: LessonOutcome

      setState((prev) => {
        const existing = prev.lessons[lessonId]
        const merged = {
          stars: Math.max(existing?.stars ?? 0, stars),
          bestWpm: Math.max(existing?.bestWpm ?? 0, result.wpm),
          bestAccuracy: Math.max(existing?.bestAccuracy ?? 0, result.accuracy),
          bestScore: Math.max(existing?.bestScore ?? 0, result.score),
          plays: (existing?.plays ?? 0) + 1,
        }

        // Collect a cat card the first time a lesson is finished.
        let collectedCat: string | null = null
        const collectedCats = [...prev.collectedCats]
        if (!existing && !collectedCats.includes(catSeed)) {
          collectedCats.push(catSeed)
          collectedCat = catSeed
        }

        let next: GameState = {
          ...prev,
          lessons: { ...prev.lessons, [lessonId]: merged },
          collectedCats,
        }
        next = recomputeTotals(next)

        const unlocked = ACHIEVEMENTS.filter(
          (a) => a.test(next) && !next.achievements.includes(a.id),
        )
        next = {
          ...next,
          achievements: [...next.achievements, ...unlocked.map((a) => a.id)],
        }

        outcome = {
          ...result,
          lessonId,
          stars,
          newAchievements: unlocked,
          collectedCat,
        }
        return next
      })

      return outcome
    },
    [],
  )

  const addHighScore = useCallback((entry: HighScore): Achievement[] => {
    let unlocked: Achievement[] = []
    setState((prev) => {
      const highScores = [...prev.highScores, entry]
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
      let next: GameState = { ...prev, highScores }
      unlocked = ACHIEVEMENTS.filter(
        (a) => a.test(next) && !next.achievements.includes(a.id),
      )
      next = {
        ...next,
        achievements: [...next.achievements, ...unlocked.map((a) => a.id)],
      }
      return next
    })
    return unlocked
  }, [])

  const reset = useCallback(() => {
    resetState()
    setState(loadState())
  }, [])

  const unlockedAchievements = useMemo(
    () => ACHIEVEMENTS.filter((a) => state.achievements.includes(a.id)),
    [state.achievements],
  )

  return {
    state,
    setPlayerName,
    setSetting,
    recordLesson,
    addHighScore,
    reset,
    unlockedAchievements,
  }
}

export type GameApi = ReturnType<typeof useGameState>
