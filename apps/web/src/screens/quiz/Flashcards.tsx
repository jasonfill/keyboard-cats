import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Card, Pill } from '../../components/ui'
import type { QuizItemResult, QuizSessionApi } from '../../hooks/useQuizSession'
import { REASON_LABEL } from '../../lib/quiz/session'
import { isSpeechAvailable, speak, stopSpeaking } from '../../lib/spelling/speech'

/**
 * Classic flashcards: read the front, decide whether you knew it, turn it over.
 *
 * Two things keep the self-grade from being worth less than nothing:
 *
 *   * a card marked "still learning" comes back later in the same round, so
 *     the honest answer leads somewhere instead of onto a list at the end;
 *   * the grade is submitted unverified, which earns a fraction of the mastery
 *     a checked answer does and can never reach the mastered band. "I knew
 *     that" is a claim about a card, not a measurement of a person, and the
 *     graded modes exist to do the measuring.
 */
export default function Flashcards({
  session,
  onFinish,
}: {
  session: QuizSessionApi
  onFinish: (results: QuizItemResult[]) => void
}) {
  const [flipped, setFlipped] = useState(false)
  const [comingBack, setComingBack] = useState(false)
  const handoffRef = useRef(0)
  const { cursor, progress, current, currentQuestion, results, beginItem, submit, advance } =
    session

  useEffect(() => {
    setFlipped(false)
    setComingBack(false)
    beginItem()
  }, [cursor, beginItem])

  const grade = useCallback(
    (knewIt: boolean) => {
      // The pause after a miss is short, but it is long enough for a fast
      // learner to hit the key again and grade the next card by accident.
      if (comingBack) return
      // Self-graded, and marked as such all the way down to the attempt row.
      const result = submit('', knewIt ? 'correct' : 'wrong', { verified: false })
      if (!result) return
      stopSpeaking()
      const all = [...results, result]

      // A card they missed is going to come back — say so, briefly, before
      // moving on. Being told "we'll come back to this" is the difference
      // between a queue and a telling-off.
      if (result.requeued) {
        setComingBack(true)
        handoffRef.current = window.setTimeout(() => {
          if (!advance()) onFinish(all)
        }, 750)
        return
      }
      if (!advance()) onFinish(all)
    },
    [advance, comingBack, onFinish, results, submit],
  )

  // Keyboard: space to turn the card over, then left or right to grade it.
  // Deliberately the same shape as every other flashcard app — muscle memory
  // from Quizlet should carry over without anyone having to learn anything.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setFlipped((f) => !f)
        return
      }
      if (!flipped) return
      if (e.key === 'ArrowLeft') grade(false)
      if (e.key === 'ArrowRight') grade(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flipped, grade])

  useEffect(
    () => () => {
      stopSpeaking()
      window.clearTimeout(handoffRef.current)
    },
    [],
  )

  if (!current || !currentQuestion) return null

  const front = currentQuestion.prompt
  const back = currentQuestion.answer
  const reason = REASON_LABEL[current.reason]

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Pill className="bg-purple-100 text-grape">
          {reason.emoji} {reason.label}
        </Pill>
        <span className="font-bold text-slate-400">
          {progress.retired} of {progress.total} put away
        </span>
      </div>

      {progress.pass > 1 && (
        <p className="mb-3 text-center font-extrabold text-grape">
          🔁 Here it is again — try to get it this time.
        </p>
      )}

      {/* The card. Clicking anywhere turns it over. */}
      <button
        onClick={() => setFlipped((f) => !f)}
        className="mb-4 w-full"
        aria-label={flipped ? 'Turn card back' : 'Turn card over'}
      >
        <div
          className={`flex min-h-[16rem] flex-col items-center justify-center rounded-3xl p-8 text-center shadow-xl ring-1 backdrop-blur transition-colors ${
            flipped
              ? 'bg-emerald-50/90 ring-emerald-200'
              : 'bg-white/90 ring-purple-100'
          }`}
        >
          <p className="mb-2 text-xs font-extrabold uppercase tracking-widest text-slate-400">
            {flipped ? 'Answer' : 'Question'}
          </p>
          <p className="text-3xl font-extrabold text-grape md:text-4xl">
            {flipped ? back : front}
          </p>
          {!flipped && current.card.hint && (
            <p className="mt-3 font-bold text-slate-400">💡 {current.card.hint}</p>
          )}
          <p className="mt-6 text-sm font-bold text-slate-400">
            {flipped ? 'Tap to see the question again' : 'Tap the card, or press space, to flip'}
          </p>
        </div>
      </button>

      {isSpeechAvailable() && (
        <div className="mb-4 flex justify-center">
          <Button
            variant="ghost"
            onClick={() => speak(flipped ? back : front)}
            aria-label="Read this side out loud"
          >
            🔊 Read it out
          </Button>
        </div>
      )}

      {comingBack ? (
        <Card className="bg-amber-50 ring-amber-200">
          <p className="text-center font-extrabold text-amber-700">
            🔁 No problem — we&apos;ll come back to this one in a bit.
          </p>
        </Card>
      ) : flipped ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="danger" onClick={() => grade(false)}>
            😾 Still learning
          </Button>
          <Button variant="success" onClick={() => grade(true)}>
            😺 Got it
          </Button>
        </div>
      ) : (
        <Card>
          <p className="text-center font-bold text-slate-400">
            Have a think, then turn the card over to see how you did.
          </p>
        </Card>
      )}
    </div>
  )
}
