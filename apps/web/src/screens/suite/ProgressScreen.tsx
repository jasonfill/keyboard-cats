import { useMemo } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import MasteryBar from '../../components/suite/MasteryBar'
import ScreenHeader from '../../components/suite/ScreenHeader'
import { Button, Card, Pill } from '../../components/ui'
import { ALL_WORDS, GRADES } from '../../data/spelling'
import type { GameApi } from '../../hooks/useGameState'
import { limitsFor } from '../../lib/plans'
import { STARTER_DECKS } from '../../data/quiz/starterDecks'
import { allDecks, deckStats } from '../../lib/quiz/decks'
import { MODES } from '../../lib/quiz/session'
import { ACTIVITIES } from '../../lib/spelling/activities'
import { useProgress } from '../../lib/progress/ProgressProvider'
import { addDays, todayString } from '../../lib/progress/types'
import { breakdown, gradeBreakdown, troubleWords, turnaroundWords } from '../../lib/spelling/stats'
import type { Navigate } from '../../routes'

export default function ProgressScreen({ game, navigate }: { game: GameApi; navigate: Navigate }) {
  const { profile } = useAuth()
  const { snapshot, skill } = useProgress()
  const limits = limitsFor(profile?.plan ?? 'free')

  const spelling = skill('spelling')
  const typing = skill('typing')
  const quiz = skill('quiz')
  const overall = breakdown(snapshot, ALL_WORDS)
  const trouble = troubleWords(snapshot, 15)
  const turnaround = turnaroundWords(snapshot, 8)

  // The history window is the one place the free plan is limited.
  const horizon = Number.isFinite(limits.historyDays)
    ? addDays(todayString(), -limits.historyDays)
    : '0000-00-00'
  const visibleSessions = snapshot.sessions.filter(
    (s) => new Date(s.endedAt).toISOString().slice(0, 10) >= horizon,
  )
  const hiddenSessions = snapshot.sessions.length - visibleSessions.length

  const last14 = useMemo(() => buildStreakStrip(snapshot.daily), [snapshot.daily])

  const quizTotals = useMemo(() => {
    const today = todayString()
    return allDecks(snapshot, STARTER_DECKS).reduce(
      (acc, deck) => {
        const s = deckStats(snapshot, deck, today)
        return {
          cards: acc.cards + s.total,
          mastered: acc.mastered + s.mastered,
          due: acc.due + s.due,
          started: acc.started + (s.seen > 0 ? 1 : 0),
        }
      },
      { cards: 0, mastered: 0, due: 0, started: 0 },
    )
  }, [snapshot])

  const totalMinutes = Math.round(
    snapshot.daily.reduce((n, d) => n + d.seconds, 0) / 60,
  )
  const typingLessons = Object.values(game.state.lessons).filter((l) => l.plays > 0).length
  const bestWpm = Math.max(0, ...Object.values(game.state.lessons).map((l) => l.bestWpm))

  return (
    <div className="mx-auto w-full max-w-4xl py-4">
      <ScreenHeader
        title="Progress 📊"
        subtitle="Everything here comes from words you actually attempted."
        onBack={() => navigate({ name: 'home' })}
      />

      {/* Headline numbers */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Day streak"
          value={`${Math.max(spelling.streakDays, typing.streakDays, quiz.streakDays)}`}
          emoji="🔥"
        />
        <StatCard label="Words mastered" value={`${overall.mastered}`} emoji="📚" />
        <StatCard label="Practice time" value={`${totalMinutes}m`} emoji="⏱️" />
        <StatCard label="Best WPM" value={`${bestWpm}`} emoji="⌨️" />
      </div>

      {/* Activity strip */}
      <Card className="mb-4">
        <h2 className="mb-3 text-xl font-extrabold text-grape">The last two weeks</h2>
        <div className="flex gap-1.5">
          {last14.map((d) => (
            <div key={d.day} className="flex-1 text-center" title={`${d.day}: ${d.items} items`}>
              <div
                className={`mx-auto h-12 w-full rounded-lg ${intensityClass(d.items)}`}
                aria-label={`${d.items} items on ${d.day}`}
              />
              <span className="mt-1 block text-[10px] font-bold text-slate-400">{d.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Spelling */}
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold text-grape">Spelling 🐈‍⬛</h2>
          <div className="flex flex-wrap gap-2">
            <Pill className="bg-purple-100 text-grape">
              Grade {GRADES[spelling.levelIndex]?.grade ?? 2}
            </Pill>
            <Pill className="bg-slate-100 text-slate-500">
              Ability {spelling.ability.toFixed(2)}
            </Pill>
            <Pill className="bg-slate-100 text-slate-500">
              {spelling.totalCorrect}/{spelling.totalAttempts} graded correct
            </Pill>
          </div>
        </div>

        <MasteryBar
          total={overall.total}
          mastered={overall.mastered}
          practiced={overall.practiced}
          learning={overall.learning}
        />

        <div className="mt-4 space-y-2">
          {GRADES.map((g) => {
            const b = gradeBreakdown(snapshot, g.grade)
            const pct = b.total ? (b.mastered / b.total) * 100 : 0
            return (
              <div key={g.grade} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm font-extrabold text-slate-500">
                  Grade {g.grade}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs font-bold text-slate-400">
                  {b.mastered}/{b.total}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Word-level report */}
      <Card className="mb-4">
        <h2 className="mb-1 text-xl font-extrabold text-grape">Words to work on 🎯</h2>
        <p className="mb-3 text-sm font-bold text-slate-500">
          Ranked by how often they have actually been missed.
        </p>
        {trouble.length === 0 ? (
          <p className="font-bold text-slate-400">
            Nothing here yet — spell a few rounds and the tricky words will show up.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left">
              <thead>
                <tr className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                  <th className="py-1">Word</th>
                  <th className="py-1">Correct</th>
                  <th className="py-1">Missed after knowing it</th>
                  <th className="py-1">Next review</th>
                </tr>
              </thead>
              <tbody>
                {(limits.detailedWordReport ? trouble : trouble.slice(0, 5)).map((m) => (
                  <tr key={m.itemKey} className="border-t border-slate-100">
                    <td className="py-2 font-mono font-bold text-grape">{m.itemKey}</td>
                    <td className="py-2 font-bold text-slate-500">
                      {m.totalCorrect}/{m.totalAttempts}
                    </td>
                    <td className="py-2 font-bold text-slate-500">{m.lapses}</td>
                    <td className="py-2 font-bold text-slate-500">{m.dueOn ?? 'now'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!limits.detailedWordReport && trouble.length > 5 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
            Showing 5 of {trouble.length}.{' '}
            <button className="underline" onClick={() => navigate({ name: 'upgrade' })}>
              Family Pro
            </button>{' '}
            shows the full word-by-word report.
          </p>
        )}
      </Card>

      {turnaround.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-1 text-xl font-extrabold text-grape">Turned around 💪</h2>
          <p className="mb-3 text-sm font-bold text-slate-500">
            Words that used to get missed and are now mastered.
          </p>
          <div className="flex flex-wrap gap-2">
            {turnaround.map((m) => (
              <span
                key={m.itemKey}
                className="rounded-xl bg-emerald-50 px-3 py-1.5 font-mono text-sm font-bold text-emerald-700"
              >
                {m.itemKey}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Typing */}
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold text-grape">Typing ⌨️</h2>
          <div className="flex flex-wrap gap-2">
            <Pill className="bg-sky-100 text-sky-700">{typingLessons} lessons played</Pill>
            <Pill className="bg-slate-100 text-slate-500">{game.state.totalStars} stars</Pill>
            <Pill className="bg-slate-100 text-slate-500">best {bestWpm} WPM</Pill>
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate({ name: 'typing' })}>
          Open Keyboard Cats →
        </Button>
      </Card>

      {/* Quiz decks */}
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold text-grape">Quiz decks 🃏</h2>
          <div className="flex flex-wrap gap-2">
            <Pill className="bg-emerald-100 text-emerald-700">
              {quizTotals.mastered}/{quizTotals.cards} cards mastered
            </Pill>
            <Pill className="bg-slate-100 text-slate-500">{quizTotals.started} decks started</Pill>
            {quizTotals.due > 0 && (
              <Pill className="bg-amber-100 text-amber-700">🔁 {quizTotals.due} due</Pill>
            )}
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate({ name: 'quiz' })}>
          Open Quiz Cats →
        </Button>
      </Card>

      {/* Session log */}
      <Card>
        <h2 className="mb-3 text-xl font-extrabold text-grape">Recent sessions</h2>
        {visibleSessions.length === 0 ? (
          <p className="font-bold text-slate-400">No sessions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visibleSessions.slice(0, 15).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="text-lg">{SUBJECT_EMOJI[s.subject] ?? '⌨️'}</span>
                <span className="font-extrabold text-grape">
                  {activityLabel(s.activity, s.subject)}
                </span>
                <span className="font-bold text-slate-500">
                  {s.itemsCorrect}/{s.itemsTotal} · {Math.round(s.accuracy)}%
                </span>
                {s.isTest && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-700">
                    graded
                  </span>
                )}
                <span className="ml-auto text-xs font-bold text-slate-400">
                  {new Date(s.endedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        {hiddenSessions > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
            {hiddenSessions} older {hiddenSessions === 1 ? 'session is' : 'sessions are'} outside the
            free {limits.historyDays}-day window.{' '}
            <button className="underline" onClick={() => navigate({ name: 'upgrade' })}>
              Family Pro
            </button>{' '}
            keeps the full history.
          </p>
        )}
      </Card>
    </div>
  )
}

/** Session rows store the raw activity id; show the name a person would use. */
const SUBJECT_EMOJI: Record<string, string> = {
  spelling: '🐈‍⬛',
  typing: '⌨️',
  quiz: '🃏',
}

/**
 * Subject matters here: both spelling and quiz have an activity called 'test',
 * and looking the id up without it would label a quiz round "Spelling Test".
 */
function activityLabel(activity: string, subject: string): string {
  if (subject === 'quiz') {
    const quizMode = MODES.find((m) => m.id === activity)
    if (quizMode) return quizMode.name
    if (activity === 'review') return 'Card review'
    return activity
  }
  const known = ACTIVITIES.find((a) => a.id === activity)
  if (known) return known.name
  if (activity === 'lesson') return 'Typing lesson'
  if (activity === 'cat-rain') return 'Cat Rain'
  return activity
}

function StatCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="rounded-2xl bg-white/85 p-4 text-center shadow ring-1 ring-purple-100">
      <div className="text-2xl">{emoji}</div>
      <div className="text-2xl font-extrabold text-grape">{value}</div>
      <div className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  )
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function buildStreakStrip(daily: Array<{ day: string; items: number }>) {
  const byDay = new Map<string, number>()
  for (const row of daily) {
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.items)
  }
  const today = todayString()
  return Array.from({ length: 14 }, (_, i) => {
    const day = addDays(today, i - 13)
    const [y, m, d] = day.split('-').map(Number)
    return {
      day,
      label: DAY_LABELS[new Date(y, m - 1, d).getDay()],
      items: byDay.get(day) ?? 0,
    }
  })
}

function intensityClass(items: number): string {
  if (items === 0) return 'bg-slate-100'
  if (items < 6) return 'bg-emerald-200'
  if (items < 15) return 'bg-emerald-400'
  return 'bg-emerald-600'
}
