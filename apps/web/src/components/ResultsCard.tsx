import { useEffect } from 'react'
import type { RoundResult } from '../lib/stats'
import { feedbackLine } from '../lib/stats'
import type { Achievement } from '../data/achievements'
import { randomCatFact } from '../lib/cats'
import { sfx } from '../lib/sound'
import { Button, Card, StarRow } from './ui'
import Confetti from './Confetti'
import CatPhoto from './CatPhoto'

interface Props {
  result: RoundResult
  stars: number
  title: string
  newAchievements?: Achievement[]
  collectedCat?: string | null
  soundOn: boolean
  onReplay: () => void
  onNext?: () => void
  onMenu: () => void
}

export default function ResultsCard({
  result,
  stars,
  title,
  newAchievements = [],
  collectedCat,
  soundOn,
  onReplay,
  onNext,
  onMenu,
}: Props) {
  useEffect(() => {
    if (soundOn && stars >= 1) {
      const t = window.setTimeout(() => sfx.star(), 250)
      return () => window.clearTimeout(t)
    }
  }, [soundOn, stars])

  const fact = randomCatFact()

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      {stars >= 2 && <Confetti />}
      <Card className="text-center">
        <h2 className="text-3xl font-extrabold text-grape">{title} complete!</h2>
        <div className="my-4 flex justify-center">
          <StarRow stars={stars} size={52} />
        </div>
        <p className="mb-4 text-lg font-bold text-slate-600">{feedbackLine(result.accuracy)}</p>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Score" value={result.score.toLocaleString()} color="text-grape" />
          <Stat label="WPM" value={String(result.wpm)} color="text-sky-500" />
          <Stat label="Accuracy" value={`${result.accuracy}%`} color="text-emerald-500" />
          <Stat label="Best Combo" value={`x${result.maxCombo}`} color="text-bubble" />
        </div>

        {collectedCat && (
          <div className="mt-5 rounded-2xl bg-amber-50 p-4 ring-2 ring-amber-200">
            <p className="mb-2 font-extrabold text-amber-600">📸 New cat card unlocked!</p>
            <CatPhoto seed={collectedCat} className="mx-auto h-40 w-56" />
          </div>
        )}

        {newAchievements.length > 0 && (
          <div className="mt-5 space-y-2">
            {newAchievements.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-center gap-2 rounded-2xl bg-purple-50 p-3 ring-2 ring-purple-200 animate-pop"
              >
                <span className="text-2xl">{a.emoji}</span>
                <span className="font-extrabold text-grape">Achievement: {a.name}!</span>
              </div>
            ))}
          </div>
        )}

        <p className="mt-5 rounded-xl bg-sky-50 p-3 text-sm font-semibold text-sky-700">
          🐱 Cat fact: {fact}
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {onNext && (
            <Button variant="primary" onClick={onNext}>
              Next Lesson →
            </Button>
          )}
          <Button variant="secondary" onClick={onReplay}>
            Play Again
          </Button>
          <Button variant="ghost" onClick={onMenu}>
            Menu
          </Button>
        </div>
      </Card>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow ring-1 ring-slate-100">
      <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}
