import { useEffect } from 'react'
import CatMascot from '../../components/CatMascot'
import Confetti from '../../components/Confetti'
import { Button, Card, Pill, StarRow } from '../../components/ui'
import type { SessionSummary } from '../../hooks/useSpellingSession'
import { sfx } from '../../lib/sound'
import { activity as activityDef } from '../../lib/spelling/activities'
import { speak } from '../../lib/spelling/speech'
import type { Navigate } from '../../routes'

interface Props {
  summary: SessionSummary
  navigate: Navigate
  onAgain: () => void
}

function encouragement(accuracy: number, predicted: number): string {
  if (accuracy === 100) return 'Every single word. That is a clean sweep! 🏆'
  if (accuracy >= predicted + 15) return 'You did far better than expected on these! 🚀'
  if (accuracy >= 90) return 'So close to perfect — brilliant work! ✨'
  if (accuracy >= predicted) return 'You beat what we predicted for these words. Nicely done! ✨'
  if (accuracy >= 60) return 'Solid round. The tricky ones will come back for another go. 💪'
  if (accuracy >= 40) return 'Good effort! These words are now on your review list. 🎯'
  return 'These were hard ones. We will bring them back easier next time. 🐾'
}

export default function SpellingResults({ summary, navigate, onAgain }: Props) {
  const def = activityDef(summary.activity)
  const missed = summary.results.filter((r) => !r.correct)
  const abilityDelta = summary.abilityAfter - summary.abilityBefore
  const levelledUp = summary.level.direction === 'promote'

  useEffect(() => {
    if (levelledUp || summary.accuracy === 100) sfx.win()
    else sfx.star()
  }, [levelledUp, summary.accuracy])

  return (
    <div className="mx-auto w-full max-w-2xl py-4">
      {(levelledUp || summary.accuracy >= 90) && <Confetti count={40} />}

      <Card className="mb-4 text-center">
        <CatMascot
          mood={summary.accuracy >= 80 ? 'wow' : summary.accuracy >= 50 ? 'happy' : 'sad'}
          size={120}
          className="mx-auto"
        />
        <h1 className="mt-2 text-3xl font-extrabold text-grape">
          {summary.itemsCorrect} of {summary.itemsTotal} correct
        </h1>
        <p className="font-bold text-slate-500">
          {encouragement(summary.accuracy, summary.predictedAccuracy)}
        </p>

        <div className="my-4 flex justify-center">
          <StarRow stars={summary.stars} size={34} />
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          <Pill className="bg-purple-100 text-grape">{def.emoji} {def.name}</Pill>
          <Pill className="bg-slate-100 text-slate-500">🎯 {summary.accuracy}% accuracy</Pill>
          <Pill
            className="bg-slate-100 text-slate-500"
            title="What the app predicted you would score on this exact set of words"
          >
            🔮 {summary.predictedAccuracy}% predicted
          </Pill>
          <Pill className="bg-amber-100 text-amber-700">⭐ {summary.score} points</Pill>
          <Pill className="bg-slate-100 text-slate-500">
            ⏱️ {Math.round(summary.durationMs / 1000)}s
          </Pill>
        </div>
      </Card>

      {/* What the round did to the learner's level */}
      {def.isTest && (
        <Card className="mb-4">
          <h2 className="mb-2 text-xl font-extrabold text-grape">Your level 📈</h2>
          {levelledUp ? (
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-lg font-extrabold text-emerald-700">
                Moving up to grade {summary.gradeAfter}! 🎉
              </p>
              <p className="font-bold text-emerald-600">{summary.level.reason}</p>
            </div>
          ) : summary.level.direction === 'demote' ? (
            <div className="rounded-2xl bg-amber-50 p-4">
              <p className="text-lg font-extrabold text-amber-700">
                Stepping back to grade {summary.gradeAfter}
              </p>
              <p className="font-bold text-amber-600">{summary.level.reason}</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="font-bold text-slate-600">
                Still working through grade {summary.gradeAfter}.{' '}
                {abilityDelta >= 0.01
                  ? `Your spelling level went up ${abilityDelta.toFixed(2)} this round.`
                  : abilityDelta <= -0.01
                    ? `Your spelling level dipped ${Math.abs(abilityDelta).toFixed(2)} — the next round will be a touch easier.`
                    : 'Your spelling level held steady.'}
              </p>
            </div>
          )}
          <p className="mt-2 text-xs font-bold text-slate-400">
            Only words you spelled from scratch, with no hints, change your level.
          </p>
        </Card>
      )}

      {/* Word-by-word */}
      <Card className="mb-4">
        <h2 className="mb-3 text-xl font-extrabold text-grape">Word by word</h2>
        <ul className="divide-y divide-slate-100">
          {summary.results.map((r, i) => (
            <li key={`${r.word.w}-${i}`} className="flex items-center gap-3 py-2">
              <span className="text-lg">{r.correct ? '✅' : '❌'}</span>
              <div className="min-w-0 flex-1">
                <span className="font-mono text-base font-bold text-grape">{r.word.w}</span>
                {!r.correct && r.given && (
                  <span className="ml-2 font-mono text-sm font-bold text-rose-400 line-through">
                    {r.given}
                  </span>
                )}
                <span className="ml-2 text-xs font-bold text-slate-400">
                  grade {r.word.grade}
                  {r.hintsUsed > 0 && ' · used a hint'}
                </span>
              </div>
              <button
                onClick={() => speak(r.word.w)}
                className="shrink-0 rounded-full bg-purple-50 px-2 py-1 text-xs font-extrabold text-grape"
                aria-label={`Hear ${r.word.w}`}
              >
                🔊
              </button>
            </li>
          ))}
        </ul>
        {missed.length > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
            🔁 {missed.length === 1 ? 'That word goes' : `Those ${missed.length} words go`} straight
            back into your practice pile — you will see{' '}
            {missed.length === 1 ? 'it' : 'them'} again in your next round.
          </p>
        )}
      </Card>

      {summary.newAchievements.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-3 text-xl font-extrabold text-grape">New badges! 🏅</h2>
          <div className="flex flex-wrap gap-3">
            {summary.newAchievements.map((a) => (
              <div key={a.id} className="rounded-2xl bg-amber-50 px-4 py-3 text-center">
                <div className="text-3xl">{a.emoji}</div>
                <div className="font-extrabold text-amber-700">{a.name}</div>
                <div className="text-xs font-bold text-amber-600">{a.description}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button onClick={onAgain}>🔁 Another round</Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'spelling' })}>
          🏠 Spelling home
        </Button>
      </div>
    </div>
  )
}
