import CatMascot from '../../components/CatMascot'
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
  const missed = summary.results.filter((r) => !r.correct)
  const near = summary.results.filter((r) => r.grade === 'close')
  const beatPrediction = summary.accuracy >= summary.predictedAccuracy

  return (
    <div className="mx-auto w-full max-w-2xl py-4">
      {summary.stars >= 3 && <Confetti />}

      <Card className="mb-4 text-center">
        <CatMascot
          mood={summary.accuracy >= 80 ? 'excited' : summary.accuracy >= 50 ? 'happy' : 'sleepy'}
          size={110}
          className="mx-auto animate-pounce"
        />
        <h1 className="mt-2 text-4xl font-extrabold text-grape">
          {summary.itemsCorrect} / {summary.itemsTotal}
        </h1>
        <p className="mb-3 text-lg font-bold text-slate-500">
          {def.emoji} {def.name} · {summary.deckTitle}
        </p>

        <div className="mb-4 flex justify-center">
          <StarRow stars={summary.stars} />
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Pill className="bg-purple-100 text-grape">{summary.accuracy}% correct</Pill>
          <Pill className="bg-sky-100 text-sky-700">{summary.score} points</Pill>
          {near.length > 0 && (
            <Pill
              className="bg-amber-100 text-amber-700"
              title="Counted as correct — you had it, the spelling just slipped."
            >
              {near.length} near {near.length === 1 ? 'miss' : 'misses'}
            </Pill>
          )}
          {summary.newlyMastered.length > 0 && (
            <Pill className="bg-emerald-100 text-emerald-700">
              💎 {summary.newlyMastered.length} newly mastered
            </Pill>
          )}
        </div>

        {/* Honest framing: the score is measured against what was predicted for
            this exact set of cards, not a flat pass mark. */}
        <p className="mt-4 font-bold text-slate-500">
          {beatPrediction
            ? `We expected about ${summary.predictedAccuracy}% on these cards — you beat it. 🎉`
            : `We expected about ${summary.predictedAccuracy}% on these. These were hard cards; keep going.`}
        </p>
      </Card>

      {summary.newAchievements.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 text-xl font-extrabold text-grape">New trophies 🏆</h2>
          <div className="flex flex-wrap gap-2">
            {summary.newAchievements.map((a) => (
              <Pill key={a.id} className="bg-amber-100 text-amber-700">
                {a.emoji} {a.name}
              </Pill>
            ))}
          </div>
        </Card>
      )}

      {missed.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-3 text-xl font-extrabold text-grape">
            Worth another look ({missed.length})
          </h2>
          <div className="space-y-2">
            {missed.map((r, i) => (
              <div key={`${r.planned.card.id}-${i}`} className="rounded-2xl bg-rose-50 px-4 py-3">
                <p className="font-extrabold text-grape">{r.question.prompt}</p>
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
