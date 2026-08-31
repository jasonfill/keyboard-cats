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
import { useProgress } from '../lib/progress/ProgressProvider'
import { updateStreak } from '../lib/adaptive'
import { todayString, type SessionRecord } from '../lib/progress/types'

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

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Typing ability on the shared 0-12 scale, so the suite dashboard can put it
 * next to spelling. Roughly: 10 WPM at full accuracy is a 1, 60 WPM is a 6.
 */
function typingAbilityFrom(wpm: number, accuracy: number): number {
  return Math.max(0.5, Math.min(12, (wpm / 10) * (accuracy / 100)))
}

export function useGameState() {
  const [state, setState] = useState<GameState>(() => loadState())
  const stateRef = useRef(state)
  stateRef.current = state

  // The typing game keeps its own localStorage save (it predates the database),
  // but every finished round is also written to the shared progress store so
  // streaks and the cross-subject dashboard see it.
  const { commit, skill } = useProgress()

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

      // Computed from the ref rather than inside the state updater.
      //
      // This used to build `outcome` inside `setState` and return it
      // afterwards, which only worked because React eagerly evaluates an
      // updater when nothing else is pending. The moment a second round landed
      // before a re-render, the updater was deferred, `outcome` was still
      // undefined, and the caller read `.stars` off it. An updater has to be
      // pure and may be skipped, replayed, or run later; nothing outside is
      // allowed to depend on when it ran.
      const prev = stateRef.current
      const existing = prev.lessons[lessonId]
      const merged = {
        stars: Math.max(existing?.stars ?? 0, stars),
        bestWpm: Math.max(existing?.bestWpm ?? 0, result.wpm),
        bestAccuracy: Math.max(existing?.bestAccuracy ?? 0, result.accuracy),
        bestScore: Math.max(existing?.bestScore ?? 0, result.score),
        plays: (existing?.plays ?? 0) + 1,
      }

      // Collect a reward the first time a lesson is finished. The seed is
      // stored; which of the theme's items it names is worked out at render.
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

      const outcome: LessonOutcome = {
        ...result,
        lessonId,
        stars,
        newAchievements: unlocked,
        collectedCat,
      }

      // Keep the ref in step so two rounds recorded back to back build on each
      // other rather than both starting from the same snapshot.
      stateRef.current = next
      setState(next)

      const previous = skill('typing')
      const blended =
        previous.totalAttempts > 0
          ? previous.ability * 0.7 + typingAbilityFrom(result.wpm, result.accuracy) * 0.3
          : typingAbilityFrom(result.wpm, result.accuracy)
      const now = Date.now()
      const session: SessionRecord = {
        id: newSessionId(),
        subject: 'typing',
        activity: 'lesson',
        listId: lessonId,
        isTest: true,
        itemsTotal: result.totalTyped,
        itemsCorrect: result.correct,
        accuracy: result.accuracy,
        score: result.score,
        wpm: result.wpm,
        durationMs: result.elapsedMs,
        abilityBefore: previous.ability,
        abilityAfter: blended,
        meta: { stars, maxCombo: result.maxCombo },
        startedAt: now - result.elapsedMs,
        endedAt: now,
      }

      void commit({
        skill: updateStreak(
          {
            ...previous,
            ability: blended,
            totalAttempts: previous.totalAttempts + result.totalTyped,
            totalCorrect: previous.totalCorrect + result.correct,
          },
          todayString(),
        ),
        session,
        list: {
          subject: 'typing',
          listId: lessonId,
          plays: 1,
          testsTaken: 1,
          bestScore: result.score,
          bestAccuracy: result.accuracy,
          stars,
          masteredAt: stars >= 3 ? now : null,
        },
        daily: {
          subject: 'typing',
          seconds: Math.round(result.elapsedMs / 1000),
          items: result.totalTyped,
          correct: result.correct,
        },
      })

      return outcome
    },
    [commit, skill],
  )

  const addHighScore = useCallback((entry: HighScore): Achievement[] => {
    // Same reasoning as recordLesson: what this returns cannot be assembled
    // inside the state updater, because nothing guarantees the updater has run
    // by the time the caller reads the result.
    const prev = stateRef.current
    const highScores = [...prev.highScores, entry]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
    let next: GameState = { ...prev, highScores }
    const unlocked = ACHIEVEMENTS.filter(
      (a) => a.test(next) && !next.achievements.includes(a.id),
    )
    next = {
      ...next,
      achievements: [...next.achievements, ...unlocked.map((a) => a.id)],
    }
    stateRef.current = next
    setState(next)

    void commit({
      highScore: {
        id: newSessionId(),
        subject: 'typing',
        mode: entry.mode,
        score: entry.score,
        wpm: entry.wpm,
        accuracy: entry.accuracy,
        createdAt: entry.date,
      },
    })

    return unlocked
  }, [commit])

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
