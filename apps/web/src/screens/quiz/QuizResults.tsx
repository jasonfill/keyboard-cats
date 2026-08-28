import Mascot from '../../components/Mascot'
import Confetti from '../../components/Confetti'
import { Button, Card, Pill, StarRow } from '../../components/ui'
import type { QuizSummary } from '../../hooks/useQuizSession'
import { modeDef } from '../../lib/quiz/session'

interface Props {
  summary: QuizSummary
  onAgain: () => void
  onDeck: () => void
  onHome: () => void
}

export default function QuizResults({ summary, onAgain, onDeck, onHome }: Props) {
  const def = modeDef(summary.mode)
  // Not "everything you ever got wrong" — the cards still unresolved when the
  // round ended. One missed and then fixed is a success story, not a to-do.
  const missed = summary.unresolved
  const near = summary.results.filter((r) => r.grade === 'close')
  const beatPrediction = summary.accuracy >= summary.predictedAccuracy

  return (
    <div className="mx-auto w-full max-w-2xl py-4">
      {summary.stars >= 3 && <Confetti />}

      <Card className="mb-4 text-center">
        <Mascot
          mood={summary.accuracy >= 80 ? 'cheer' : summary.accuracy >= 50 ? 'idle' : 'resting'}
          size={110}
          className="mx-auto animate-pounce"
        />
        <h1 className="mt-2 text-4xl font-extrabold text-ink">
          {summary.itemsCorrect} / {summary.itemsTotal}
        </h1>
        <p className="mb-3 text-lg font-bold text-muted">
          {def.emoji} {def.name} · {summary.deckTitle}
        </p>

        <div className="mb-4 flex justify-center">
          <StarRow stars={summary.stars} />
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Pill
            className="bg-wash text-ink"
            title="Scored on your first go at each card, so going back over one never costs you."
          >
            {summary.accuracy}% first time
          </Pill>
          <Pill className="bg-pineSoft/30 text-pine">{summary.score} points</Pill>
          {near.length > 0 && (
            <Pill
              className="bg-sun/30 text-ink"
              title="Counted as correct — you had it, the spelling just slipped."
            >
              {near.length} near {near.length === 1 ? 'miss' : 'misses'}
            </Pill>
          )}
          {summary.retiredAfterMiss > 0 && (
            <Pill
              className="bg-teal-100 text-teal-700"
              title="Missed at first, then got right before the end of the round."
            >
              💪 {summary.retiredAfterMiss} turned around
            </Pill>
          )}
          {summary.newlyMastered.length > 0 && (
            <Pill className="bg-pine/10 text-pine">
              💎 {summary.newlyMastered.length} newly mastered
            </Pill>
          )}
        </div>

        {/* Honest framing: the score is measured against what was predicted for
            this exact set of cards, not a flat pass mark. */}
        <p className="mt-4 font-bold text-muted">
          {beatPrediction
            ? `We expected about ${summary.predictedAccuracy}% on these cards — you beat it. 🎉`
            : `We expected about ${summary.predictedAccuracy}% on these. These were hard cards; keep going.`}
        </p>
      </Card>

      {summary.newAchievements.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 text-xl font-extrabold text-ink">New trophies 🏆</h2>
          <div className="flex flex-wrap gap-2">
            {summary.newAchievements.map((a) => (
              <Pill key={a.id} className="bg-sun/30 text-ink">
                {a.emoji} {a.name}
              </Pill>
            ))}
          </div>
        </Card>
      )}

      {missed.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-1 text-xl font-extrabold text-ink">
            Worth another look ({missed.length})
          </h2>
          <p className="mb-3 font-bold text-muted">
            These are queued up for next time, so they will come round again.
          </p>
          <div className="space-y-2">
            {missed.map((r, i) => (
              <div key={`${r.planned.card.id}-${i}`} className="rounded-2xl bg-rose-50 px-4 py-3">
                <p className="font-extrabold text-ink">{r.question.prompt}</p>
                <p className="font-bold text-emerald-700">✓ {r.question.answer}</p>
                {r.given && (
                  <p className="text-sm font-bold text-rose-500">
                    You said: {r.given}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={onAgain}>🔁 Go again</Button>
        <Button variant="secondary" onClick={onDeck}>
          Back to the deck
        </Button>
        <Button variant="ghost" onClick={onHome}>
          All decks
        </Button>
      </div>
    </div>
  )
}
