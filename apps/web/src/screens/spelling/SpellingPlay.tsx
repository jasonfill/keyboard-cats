import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CatMascot, { type Mood } from '../../components/CatMascot'
import Confetti from '../../components/Confetti'
import { Button, Card, Pill } from '../../components/ui'
import type { CurriculumWord } from '../../data/spelling'
import { wordDifficulty } from '../../data/spelling'
import { useSpellingSession, type ItemResult } from '../../hooks/useSpellingSession'
import { useProgress } from '../../lib/progress/ProgressProvider'
import { sfx, unlockAudio } from '../../lib/sound'
import {
  activity as activityDef,
  buildMissingLetters,
  diffAnswer,
  isCorrect,
  maskWordInSentence,
  proofreadChoices,
  scramble,
  type ActivityId,
} from '../../lib/spelling/activities'
import { REASON_LABEL, type SessionMode } from '../../lib/spelling/session'
import {
  dictate,
  isSpeechAvailable,
  primeVoices,
  speak,
  stopSpeaking,
  whenVoicesReady,
} from '../../lib/spelling/speech'
import type { Navigate } from '../../routes'
import SpellingResults from './SpellingResults'

interface Props {
  activity: ActivityId
  mode: SessionMode
  listId?: string
  customListId?: string
  size?: number
  navigate: Navigate
}

type Phase = 'prompt' | 'feedback' | 'grading' | 'done'

export default function SpellingPlay({ activity, mode, listId, customListId, size, navigate }: Props) {
  const session = useSpellingSession()
  const { snapshot } = useProgress()
  const def = activityDef(activity)

  const [phase, setPhase] = useState<Phase>('prompt')
  const [answer, setAnswer] = useState('')
  const [last, setLast] = useState<ItemResult | null>(null)
  const [hints, setHints] = useState(0)
  const [speechReady, setSpeechReady] = useState(isSpeechAvailable())
  const [flashWord, setFlashWord] = useState(false)
  const collected = useRef<ItemResult[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const startedRef = useRef(false)

  const customWords = useMemo<CurriculumWord[] | undefined>(() => {
    if (!customListId) return undefined
    const list = snapshot.customLists.find((l) => l.id === customListId)
    if (!list) return undefined
    return list.words.map((entry) => ({
      ...entry,
      listId: `custom:${list.id}`,
      listTitle: list.title,
      grade: list.grade ?? 4,
      difficulty: wordDifficulty(entry.w, list.grade ?? 4),
    }))
  }, [customListId, snapshot.customLists])

  // Start the round exactly once; the plan must not be rebuilt on re-render or
  // the learner would get a different word mid-question.
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    primeVoices()
    session.start({ activity, mode, listId, customWords, size })
  }, [activity, customWords, listId, mode, session, size])

  // Voices load asynchronously, so the answer to "can this device talk?" may
  // change a beat after mount.
  useEffect(() => whenVoicesReady(setSpeechReady), [])

  const current = session.current
  const total = session.plan.length

  // Read the word aloud when a new dictation prompt appears. Browsers without a
  // voice get a two-second flash of the word instead, so the activity still works.
  useEffect(() => {
    if (!current || phase !== 'prompt') return
    session.beginItem()
    setAnswer('')
    setHints(0)
    if (activity === 'listen-spell' || activity === 'test') {
      if (speechReady) {
        dictate(current.w, current.s)
      } else {
        // No voice on this device, so fall back to look-cover-write-check: show
        // the word briefly, hide it, then ask for it. That is a real spelling
        // method, not a degraded one.
        setFlashWord(true)
        const t = setTimeout(() => setFlashWord(false), 2500)
        return () => clearTimeout(t)
      }
    } else if (activity === 'study') {
      speak(current.w)
    }
    inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.w, phase, activity, speechReady])

  useEffect(() => () => stopSpeaking(), [])

  const finishRound = useCallback(async () => {
    stopSpeaking()
    await session.finish(collected.current)
    setPhase('done')
  }, [session])

  const grade = useCallback(
    (given: string, correct: boolean) => {
      const result = session.submit(given, correct, hints)
      if (!result) return
      collected.current = [...collected.current, result]
      setLast(result)
      if (correct) sfx.correct()
      else sfx.wrong()
      setPhase('feedback')
    },
    [hints, session],
  )

  const submitTyped = useCallback(() => {
    if (!current || !answer.trim()) return
    unlockAudio()
    grade(answer, isCorrect(answer, current.w))
  }, [answer, current, grade])

  const next = useCallback(() => {
    stopSpeaking()
    if (session.index >= total - 1) {
      // Marking the round in flight before awaiting matters: clearing the last
      // result while the feedback panel is still mounted would render it
      // against nothing.
      setPhase('grading')
      void finishRound()
      return
    }
    setLast(null)
    session.advance()
    setPhase('prompt')
  }, [finishRound, session, total])

  if (phase === 'done' && session.summary) {
    return (
      <SpellingResults
        summary={session.summary}
        navigate={navigate}
        onAgain={() => {
          collected.current = []
          startedRef.current = false
          session.reset()
          setPhase('prompt')
        }}
      />
    )
  }

  if (phase === 'grading' || (phase === 'done' && !session.summary)) {
    return (
      <div className="mx-auto w-full max-w-2xl py-16 text-center">
        <CatMascot mood="happy" size={120} className="mx-auto animate-floaty" />
        <p className="mt-4 text-lg font-bold text-slate-500">Adding up your round…</p>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="mx-auto w-full max-w-2xl py-16 text-center">
        <CatMascot mood="sleepy" size={120} className="mx-auto animate-floaty" />
        <p className="mt-4 text-lg font-bold text-slate-500">Rounding up some words…</p>
      </div>
    )
  }

  const reason = REASON_LABEL[current.reason]
  const mood: Mood = phase === 'feedback' ? (last?.correct ? 'excited' : 'sad') : 'neutral'

  return (
    <div className="mx-auto w-full max-w-2xl py-4">
      {/* Progress rail */}
      <div className="mb-4 flex items-center gap-3">
        <Button
          variant="ghost"
          onClick={() => {
            stopSpeaking()
            navigate({ name: 'spelling' })
          }}
        >
          ← Quit
        </Button>
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-white/70 ring-1 ring-purple-100">
          <div
            className="h-full bg-grape transition-all duration-300"
            style={{ width: `${(session.index / Math.max(1, total)) * 100}%` }}
          />
        </div>
        <span className="text-sm font-extrabold text-slate-500">
          {session.index + 1}/{total}
        </span>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pill className="bg-purple-100 text-grape">
            {def.emoji} {def.name}
          </Pill>
          {mode === 'adaptive' && (
            <Pill className="bg-slate-100 text-slate-500">
              {reason.emoji} {reason.label}
            </Pill>
          )}
          {def.isTest && (
            <Pill className="bg-emerald-100 text-emerald-700">Counts toward your level</Pill>
          )}
        </div>

        {phase === 'prompt' || !last ? (
          <PromptArea
            activity={activity}
            word={current.w}
            sentence={current.s}
            difficulty={current.difficulty}
            answer={answer}
            setAnswer={setAnswer}
            inputRef={inputRef}
            onSubmit={submitTyped}
            onChoose={(choice) => grade(choice, isCorrect(choice, current.w))}
            hints={hints}
            onHint={() => setHints((h) => h + 1)}
            onReveal={() => {
              setHints((h) => h + 1)
              setFlashWord(true)
              window.setTimeout(() => setFlashWord(false), 2000)
            }}
            speechReady={speechReady}
            flashWord={flashWord}
          />
        ) : (
          <Feedback result={last} onNext={next} isLast={session.index >= total - 1} />
        )}
      </Card>

      <div className="mt-5 flex justify-center">
        <CatMascot mood={mood} size={110} className={phase === 'prompt' ? 'animate-floaty' : ''} />
      </div>
      {phase === 'feedback' && last?.correct && <Confetti count={16} />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

interface PromptProps {
  activity: ActivityId
  word: string
  sentence: string
  difficulty: number
  answer: string
  setAnswer: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement>
  onSubmit: () => void
  onChoose: (choice: string) => void
  hints: number
  onHint: () => void
  onReveal: () => void
  speechReady: boolean
  flashWord: boolean
}

function PromptArea(props: PromptProps) {
  const { activity, word, sentence, difficulty } = props

  // Puzzle shapes are generated once per word so they do not reshuffle while
  // the learner is looking at them.
  const puzzle = useMemo(() => buildMissingLetters(word, difficulty), [word, difficulty])
  const scrambled = useMemo(() => scramble(word), [word])
  const choices = useMemo(() => proofreadChoices(word), [word])

  if (activity === 'proofread') {
    return (
      <div>
        <p className="mb-1 text-lg font-extrabold text-grape">Which one is spelled correctly?</p>
        <p className="mb-4 font-bold text-slate-500">{maskWordInSentence(sentence, word)}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {choices.map((choice) => (
            <button
              key={choice}
              onClick={() => props.onChoose(choice)}
              className="rounded-2xl border-2 border-purple-200 bg-white px-4 py-4 font-mono text-xl font-bold text-grape transition-colors hover:border-grape hover:bg-purple-50"
            >
              {choice}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      {activity === 'listen-spell' || activity === 'test' ? (
        <ListenPrompt {...props} />
      ) : activity === 'missing-letters' ? (
        <div className="mb-5 text-center">
          <p className="mb-2 font-bold text-slate-500">Fill in the missing letters:</p>
          <p className="font-mono text-4xl font-extrabold tracking-[0.2em] text-grape">
            {puzzle.masked}
          </p>
          <p className="mt-3 font-bold text-slate-500">{maskWordInSentence(sentence, word)}</p>
        </div>
      ) : activity === 'scramble' ? (
        <div className="mb-5 text-center">
          <p className="mb-2 font-bold text-slate-500">Unscramble these letters:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {[...scrambled].map((c, i) => (
              <span
                key={`${c}-${i}`}
                className="rounded-xl bg-purple-100 px-3 py-2 font-mono text-2xl font-extrabold uppercase text-grape"
              >
                {c}
              </span>
            ))}
          </div>
          <p className="mt-3 font-bold text-slate-500">{maskWordInSentence(sentence, word)}</p>
        </div>
      ) : (
        // study
        <div className="mb-5 text-center">
          <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
            Look at it, say it, then type it
          </p>
          <p className="font-mono text-5xl font-extrabold text-grape">{word}</p>
          <p className="mt-3 font-bold text-slate-500">{sentence}</p>
          <button
            onClick={() => speak(word)}
            className="mt-2 rounded-full bg-purple-100 px-4 py-1.5 text-sm font-extrabold text-grape"
          >
            🔊 Hear it again
          </button>
        </div>
      )}

      <TypedAnswer {...props} />
    </div>
  )
}

function ListenPrompt({
  word,
  sentence,
  hints,
  onHint,
  onReveal,
  activity,
  speechReady,
  flashWord,
}: PromptProps) {
  return (
    <div className="mb-5 text-center">
      {speechReady ? (
        <p className="mb-3 text-6xl">🎧</p>
      ) : (
        <div className="mb-3">
          <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
            {flashWord ? 'Look at it, then spell it from memory' : 'Now spell it'}
          </p>
          <p className="font-mono text-4xl font-extrabold text-grape">
            {flashWord ? word : '• • •'}
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {speechReady ? (
          <>
            <button
              onClick={() => dictate(word, sentence)}
              className="rounded-full bg-grape px-5 py-2 text-sm font-extrabold text-white shadow"
            >
              🔊 Say it again
            </button>
            <button
              onClick={() => speak(sentence)}
              className="rounded-full bg-purple-100 px-5 py-2 text-sm font-extrabold text-grape"
            >
              📖 In a sentence
            </button>
          </>
        ) : (
          activity !== 'test' && (
            <button
              onClick={onReveal}
              className="rounded-full bg-grape px-5 py-2 text-sm font-extrabold text-white shadow"
            >
              👀 Show it again
            </button>
          )
        )}
        {activity !== 'test' && (
          <button
            onClick={onHint}
            className="rounded-full bg-amber-100 px-5 py-2 text-sm font-extrabold text-amber-700"
          >
            💡 Hint
          </button>
        )}
      </div>

      {!speechReady && (
        <p className="mt-3 text-xs font-bold text-slate-400">
          This device has no speech voice installed, so we show the word instead of reading it.
        </p>
      )}

      {!speechReady && (
        <p className="mt-3 font-bold text-slate-500">{maskWordInSentence(sentence, word)}</p>
      )}

      {hints > 0 && activity !== 'test' && (
        <div className="mt-3 rounded-2xl bg-amber-50 p-3">
          <p className="text-sm font-bold text-amber-700">
            {hints === 1
              ? `${word.length} letters, starts with "${word[0]}"`
              : `${word.slice(0, Math.ceil(word.length / 2))}${'_'.repeat(Math.floor(word.length / 2))}`}
          </p>
          <p className="mt-1 text-xs font-bold text-amber-600">
            Hints are fine — this one just will not count toward your level.
          </p>
        </div>
      )}
    </div>
  )
}

function TypedAnswer({ answer, setAnswer, inputRef, onSubmit }: PromptProps) {
  return (
    <div>
      <input
        ref={inputRef}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder="Type the word…"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="Your spelling"
        className="w-full rounded-2xl border-2 border-purple-200 px-4 py-4 text-center font-mono text-2xl font-bold text-grape focus:border-grape focus:outline-none"
      />
      <Button className="mt-3 w-full" onClick={onSubmit} disabled={!answer.trim()}>
        Check it ✓
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

function Feedback({
  result,
  onNext,
  isLast,
}: {
  result: ItemResult
  onNext: () => void
  isLast: boolean
}) {
  const diff = diffAnswer(result.given, result.word.w)

  // Enter advances, so a learner on a roll never has to reach for the mouse.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') onNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNext])

  return (
    <div className="text-center">
      <p className={`mb-2 text-2xl font-extrabold ${result.correct ? 'text-emerald-600' : 'text-rose-500'}`}>
        {result.correct ? 'Purr-fect! 🎉' : 'Not quite 🐾'}
      </p>

      {!result.correct && (
        <>
          <p className="mb-1 text-sm font-bold text-slate-400">You wrote</p>
          <p className="mb-3 font-mono text-2xl font-bold">
            {diff.map((d, i) => (
              <span
                key={i}
                className={
                  d.status === 'correct'
                    ? 'text-slate-400'
                    : d.status === 'missing'
                      ? 'text-emerald-600 underline decoration-dotted'
                      : 'text-rose-500 line-through'
                }
              >
                {d.char}
              </span>
            ))}
          </p>
        </>
      )}

      <p className="mb-1 text-sm font-bold text-slate-400">
        {result.correct ? 'That is the one' : 'The correct spelling is'}
      </p>
      <p className="font-mono text-4xl font-extrabold text-grape">{result.word.w}</p>
      <p className="mx-auto mt-3 max-w-md font-bold text-slate-500">{result.word.s}</p>

      <button
        onClick={() => speak(result.word.w)}
        className="mt-3 rounded-full bg-purple-100 px-4 py-1.5 text-sm font-extrabold text-grape"
      >
        🔊 Hear it
      </button>

      <Button className="mt-5 w-full" onClick={onNext}>
        {isLast ? 'See my results →' : 'Next word →'}
      </Button>
      <p className="mt-2 text-xs font-bold text-slate-400">or press Enter</p>
    </div>
  )
}
