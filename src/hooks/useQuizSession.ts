import { useCallback, useMemo, useRef, useState } from 'react'
import { newlyUnlocked, type QuizAchievement } from '../data/quizAchievements'
import {
  applyAttemptToMastery,
  expectedCorrect,
  updateAbility,
  updateStreak,
} from '../lib/adaptive'
import { useProgress } from '../lib/progress/ProgressProvider'
import { applyChange, type ProgressChange } from '../lib/progress/repo'
import {
  cardKey,
  listKey,
  masteryKey,
  todayString,
  type Attempt,
  type HighScoreRow,
  type ItemMastery,
  type ListProgress,
  type QuizDeck,
  type SessionRecord,
  type SkillState,
} from '../lib/progress/types'
import { buildQuestion, type Grade, type Question } from '../lib/quiz/questions'
import {
  modeDef,
  planStudy,
  type DirectionSetting,
  type PlannedCard,
  type StudyMode,
} from '../lib/quiz/session'

export interface QuizItemResult {
  planned: PlannedCard
  question: Question
  given: string
  /** 'close' is a near miss — credited, but counted separately in the summary. */
  grade: Grade
  correct: boolean
  responseMs: number
  hintsUsed: number
}

export interface QuizSummary {
  mode: StudyMode
  deckId: string | null
  deckTitle: string
  results: QuizItemResult[]
  itemsTotal: number
  itemsCorrect: number
  nearMisses: number
  accuracy: number
  predictedAccuracy: number
  score: number
  stars: number
  durationMs: number
  abilityBefore: number
  abilityAfter: number
  /** Cards that went from "not mastered" to "mastered" in this round. */
  newlyMastered: string[]
  newAchievements: QuizAchievement[]
}

export interface StartQuizOptions {
  mode: StudyMode
  decks: QuizDeck[]
  deckId?: string
  size?: number
  direction?: DirectionSetting
}

/**
 * Stars are graded against what the model predicted for this exact set of
 * cards, not a flat percentage — the same reasoning as the spelling module.
 * A learner working through brand new material is meant to miss things.
 */
function starsFor(accuracy: number, predicted: number): number {
  if (accuracy >= 95 || accuracy >= predicted + 10) return 3
  if (accuracy >= 75 || accuracy >= predicted - 5) return 2
  return 1
}

/** Harder cards and unaided recall are worth more, and streaks compound. */
function scoreFor(results: QuizItemResult[]): number {
  let score = 0
  let streak = 0
  for (const r of results) {
    if (!r.correct) {
      streak = 0
      continue
    }
    streak += 1
    const difficultyBonus = Math.round(r.planned.card.difficulty * 6)
    const recallBonus = r.question.kind === 'written' ? 12 : r.question.kind === 'true-false' ? 2 : 6
    const streakBonus = Math.min(streak, 8) * 5
    const hintPenalty = r.hintsUsed * 4
    score += Math.max(5, 15 + difficultyBonus + recallBonus + streakBonus - hintPenalty)
  }
  return score
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function useQuizSession() {
  const { snapshot, skill, commit } = useProgress()

  const [plan, setPlan] = useState<PlannedCard[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [results, setResults] = useState<QuizItemResult[]>([])
  const [summary, setSummary] = useState<QuizSummary | null>(null)
  const [options, setOptions] = useState<StartQuizOptions | null>(null)

  const startedAtRef = useRef(0)
  const itemStartedAtRef = useRef(0)
  const state = skill('quiz')

  const start = useCallback(
    (opts: StartQuizOptions) => {
      const planned = planStudy(snapshot, {
        mode: opts.mode,
        decks: opts.decks,
        deckId: opts.deckId,
        size: opts.size,
        direction: opts.direction,
      })

      // Questions are built once, up front. Building them per render would
      // reshuffle the multiple-choice options on every keystroke.
      const byDeck = new Map(opts.decks.map((d) => [d.id, d]))
      const built = planned.map((p) =>
        buildQuestion(p.card, byDeck.get(p.deckId)?.cards ?? [], p.kind, p.direction),
      )

      setOptions(opts)
      setPlan(planned)
      setQuestions(built)
      setIndex(0)
      setResults([])
      setSummary(null)
      startedAtRef.current = Date.now()
      itemStartedAtRef.current = Date.now()
      return planned
    },
    [snapshot],
  )

  const beginItem = useCallback(() => {
    itemStartedAtRef.current = Date.now()
  }, [])

  const submit = useCallback(
    (given: string, grade: Grade, hintsUsed = 0): QuizItemResult | null => {
      const planned = plan[index]
      const question = questions[index]
      if (!planned || !question) return null
      const result: QuizItemResult = {
        planned,
        question,
        given,
        grade,
        // A near miss counts. The learner recalled the answer; penalising a
        // transposed letter on a biology deck tests typing, not biology.
        correct: grade !== 'wrong',
        responseMs: Math.max(0, Date.now() - itemStartedAtRef.current),
        hintsUsed,
      }
      setResults((prev) => [...prev, result])
      return result
    },
    [index, plan, questions],
  )

  const advance = useCallback(() => {
    setIndex((i) => i + 1)
    itemStartedAtRef.current = Date.now()
  }, [])

  const current = plan[index] ?? null
  const currentQuestion = questions[index] ?? null
  const isLast = index >= plan.length - 1
  const isComplete = index >= plan.length && plan.length > 0

  /**
   * Turn a finished round into progress.
   *
   * Two different flags are at work and they are deliberately not the same one:
   *   * mastery and the review schedule move on every honest attempt, because
   *     recognising a card is still evidence about that card;
   *   * the learner's overall ability only moves on unaided recall — a written
   *     answer with no hint. Multiple choice is recognition, and a run of lucky
   *     four-way guesses should not read as getting cleverer.
   */
  const finish = useCallback(
    async (
      finalResults?: QuizItemResult[],
      extra?: { highScore?: Omit<HighScoreRow, 'id' | 'createdAt'>; meta?: Record<string, unknown> },
    ): Promise<QuizSummary | null> => {
      const rows = finalResults ?? results
      if (!options || rows.length === 0) return null

      const def = modeDef(options.mode)
      const now = Date.now()
      const today = todayString()
      const durationMs = Math.max(0, now - startedAtRef.current)

      let working: SkillState = { ...state }
      const abilityBefore = working.ability

      const attempts: Attempt[] = []
      const masteryUpdates = new Map<string, ItemMastery>()
      const newlyMastered: string[] = []

      for (const r of rows) {
        const key = cardKey(r.planned.deckId, r.planned.card.id)
        const graded = r.hintsUsed === 0

        const attempt: Attempt = {
          subject: 'quiz',
          itemKey: key,
          activity: options.mode,
          isTest: graded,
          correct: r.correct,
          responseMs: r.responseMs,
          hintsUsed: r.hintsUsed,
          difficulty: r.planned.card.difficulty,
          given: r.given,
          at: now,
        }
        attempts.push(attempt)

        const movesAbility = graded && def.isTest && r.question.kind === 'written'
        if (movesAbility) {
          const update = updateAbility(working, r.planned.card.difficulty, r.correct)
          working = {
            ...working,
            ability: update.ability,
            abilitySd: update.abilitySd,
            totalAttempts: working.totalAttempts + 1,
            totalCorrect: working.totalCorrect + (r.correct ? 1 : 0),
          }
        }

        const masteryStoreKey = masteryKey('quiz', key)
        const previous = masteryUpdates.get(masteryStoreKey) ?? snapshot.mastery[masteryStoreKey]
        const next = applyAttemptToMastery(previous, attempt, {
          today,
          ability: working.ability,
        })
        masteryUpdates.set(masteryStoreKey, { ...next, listId: r.planned.deckId })

        if ((previous?.mastery ?? 0) < 0.8 && next.mastery >= 0.8) {
          newlyMastered.push(r.planned.card.term)
        }
      }

      working = updateStreak(working, today)
      // Quiz has no curriculum ladder to be placed on, but the flag still marks
      // "this learner has done graded work", which the home screen reads.
      if (!working.placed && def.isTest) working = { ...working, placed: true }

      const itemsTotal = rows.length
      const itemsCorrect = rows.filter((r) => r.correct).length
      const nearMisses = rows.filter((r) => r.grade === 'close').length
      const accuracy = Math.round((itemsCorrect / itemsTotal) * 100)
      const score = scoreFor(rows)
      const predictedAccuracy = Math.round(
        (rows.reduce(
          (sum, r) => sum + expectedCorrect(abilityBefore, r.planned.card.difficulty),
          0,
        ) /
          rows.length) *
          100,
      )
      const stars = starsFor(accuracy, predictedAccuracy)
      const deckId = options.deckId ?? null
      const deckTitle = options.deckId
        ? (options.decks.find((d) => d.id === options.deckId)?.title ?? 'Deck')
        : 'Review'

      const sessionRecord: SessionRecord = {
        id: newSessionId(),
        subject: 'quiz',
        activity: options.mode,
        listId: deckId,
        isTest: def.isTest,
        itemsTotal,
        itemsCorrect,
        accuracy,
        score,
        wpm: null,
        durationMs,
        abilityBefore,
        abilityAfter: working.ability,
        meta: { predictedAccuracy, nearMisses, deckTitle, ...extra?.meta },
        startedAt: startedAtRef.current,
        endedAt: now,
      }

      // Per-deck progress, so a deck can show stars and a best score.
      let listProgress: ListProgress | undefined
      if (deckId) {
        const existing = snapshot.lists[listKey('quiz', deckId)]
        const deck = options.decks.find((d) => d.id === deckId)
        const allMastered =
          !!deck &&
          deck.cards.length > 0 &&
          deck.cards.every((c) => {
            const k = masteryKey('quiz', cardKey(deckId, c.id))
            return ((masteryUpdates.get(k) ?? snapshot.mastery[k])?.mastery ?? 0) >= 0.8
          })
        listProgress = {
          subject: 'quiz',
          listId: deckId,
          plays: (existing?.plays ?? 0) + 1,
          testsTaken: (existing?.testsTaken ?? 0) + (def.isTest ? 1 : 0),
          bestScore: Math.max(existing?.bestScore ?? 0, score),
          bestAccuracy: Math.max(existing?.bestAccuracy ?? 0, accuracy),
          stars: Math.max(existing?.stars ?? 0, stars),
          masteredAt: existing?.masteredAt ?? (allMastered ? now : null),
        }
      }

      const change: ProgressChange = {
        skill: working,
        mastery: [...masteryUpdates.values()],
        attempts,
        session: sessionRecord,
        list: listProgress,
        daily: {
          subject: 'quiz',
          seconds: Math.round(durationMs / 1000),
          items: itemsTotal,
          correct: itemsCorrect,
        },
      }

      if (extra?.highScore) {
        change.highScore = {
          ...extra.highScore,
          id: newSessionId(),
          createdAt: now,
        }
      }

      const projected = applyChange(snapshot, change, now)
      const owned = new Set(projected.achievements.map((a) => a.achievementId))
      const unlocked = newlyUnlocked(projected, working, owned)
      if (unlocked.length) {
        change.achievements = unlocked.map((a) => ({
          achievementId: a.id,
          subject: 'quiz',
          unlockedAt: now,
        }))
      }

      await commit(change)

      const built: QuizSummary = {
        mode: options.mode,
        deckId,
        deckTitle,
        results: rows,
        itemsTotal,
        itemsCorrect,
        nearMisses,
        accuracy,
        predictedAccuracy,
        score,
        stars,
        durationMs,
        abilityBefore,
        abilityAfter: working.ability,
        newlyMastered,
        newAchievements: unlocked,
      }
      setSummary(built)
      return built
    },
    [commit, options, results, snapshot, state],
  )

  const reset = useCallback(() => {
    setPlan([])
    setQuestions([])
    setIndex(0)
    setResults([])
    setSummary(null)
    setOptions(null)
  }, [])

  return useMemo(
    () => ({
      plan,
      questions,
      index,
      current,
      currentQuestion,
      results,
      summary,
      options,
      isLast,
      isComplete,
      state,
      start,
      beginItem,
      submit,
      advance,
      finish,
      reset,
    }),
    [
      plan,
      questions,
      index,
      current,
      currentQuestion,
      results,
      summary,
      options,
      isLast,
      isComplete,
      state,
      start,
      beginItem,
      submit,
      advance,
      finish,
      reset,
    ],
  )
}

export type QuizSessionApi = ReturnType<typeof useQuizSession>
