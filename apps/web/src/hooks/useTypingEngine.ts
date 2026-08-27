import { useCallback, useEffect, useRef, useState } from 'react'
import { computeAccuracy, computeWpm } from '../lib/stats'

export type CharState = 'pending' | 'correct' | 'wrong' | 'current'

export interface EngineSnapshot {
  target: string
  cursor: number
  correct: number
  incorrect: number
  combo: number
  maxCombo: number
  started: boolean
  finished: boolean
  elapsedMs: number
  wpm: number
  accuracy: number
  nextChar: string | null
  lastWrong: string | null // char the learner mistyped most recently
  errorsByChar: Record<string, number>
}

export interface EngineCallbacks {
  onCorrect?: (char: string, combo: number) => void
  onWrong?: (expected: string, got: string) => void
  onFinish?: (snap: EngineSnapshot) => void
}

const initial = (target: string): Omit<EngineSnapshot, 'wpm' | 'accuracy' | 'nextChar' | 'elapsedMs'> => ({
  target,
  cursor: 0,
  correct: 0,
  incorrect: 0,
  combo: 0,
  maxCombo: 0,
  started: false,
  finished: false,
  lastWrong: null,
  errorsByChar: {},
})

export function useTypingEngine(target: string, cbs: EngineCallbacks = {}) {
  const [core, setCore] = useState(() => initial(target))
  const [startTime, setStartTime] = useState<number | null>(null)
  const [endTime, setEndTime] = useState<number | null>(null)
  const [now, setNow] = useState<number>(() => Date.now())

  const cbsRef = useRef(cbs)
  cbsRef.current = cbs

  // Reset whenever the target text changes.
  useEffect(() => {
    setCore(initial(target))
    setStartTime(null)
    setEndTime(null)
    setNow(Date.now())
  }, [target])

  // Live clock for WPM while a round is in progress.
  useEffect(() => {
    if (startTime === null || endTime !== null) return
    const id = window.setInterval(() => setNow(Date.now()), 100)
    return () => window.clearInterval(id)
  }, [startTime, endTime])

  const reset = useCallback((newTarget?: string) => {
    setCore(initial(newTarget ?? target))
    setStartTime(null)
    setEndTime(null)
    setNow(Date.now())
  }, [target])

  const handleChar = useCallback((typed: string) => {
    setCore((prev) => {
      if (prev.finished) return prev
      const expected = prev.target[prev.cursor]
      if (expected === undefined) return prev

      // Start the timer on the first real keystroke.
      if (!prev.started) {
        const t = Date.now()
        setStartTime(t)
        setNow(t)
      }

      const matches = typed === expected
      if (matches) {
        const cursor = prev.cursor + 1
        const combo = prev.combo + 1
        const maxCombo = Math.max(prev.maxCombo, combo)
        const finished = cursor >= prev.target.length
        cbsRef.current.onCorrect?.(expected, combo)
        const next = {
          ...prev,
          cursor,
          correct: prev.correct + 1,
          combo,
          maxCombo,
          finished,
          lastWrong: null,
        }
        if (finished) {
          const end = Date.now()
          setEndTime(end)
        }
        return next
      }

      // Wrong key: record the error, reset combo, do not advance.
      const errorsByChar = { ...prev.errorsByChar }
      errorsByChar[expected] = (errorsByChar[expected] ?? 0) + 1
      cbsRef.current.onWrong?.(expected, typed)
      return {
        ...prev,
        incorrect: prev.incorrect + 1,
        combo: 0,
        lastWrong: expected,
        errorsByChar,
      }
    })
  }, [])

  // Fire onFinish exactly once, after state settles.
  const finishedRef = useRef(false)
  useEffect(() => {
    if (core.finished && !finishedRef.current) {
      finishedRef.current = true
      const elapsedMs = (endTime ?? Date.now()) - (startTime ?? Date.now())
      const snap: EngineSnapshot = {
        ...core,
        elapsedMs,
        wpm: computeWpm(core.correct, elapsedMs),
        accuracy: computeAccuracy(core.correct, core.correct + core.incorrect),
        nextChar: null,
      }
      cbsRef.current.onFinish?.(snap)
    }
    if (!core.finished) finishedRef.current = false
  }, [core, endTime, startTime])

  const elapsedMs =
    startTime === null ? 0 : (endTime ?? now) - startTime
  const wpm = computeWpm(core.correct, elapsedMs)
  const accuracy = computeAccuracy(core.correct, core.correct + core.incorrect)
  const nextChar = core.target[core.cursor] ?? null

  const snapshot: EngineSnapshot = {
    ...core,
    elapsedMs,
    wpm,
    accuracy,
    nextChar,
  }

  return { snapshot, handleChar, reset }
}
