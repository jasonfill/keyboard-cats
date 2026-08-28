import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import MasteryBar from '../../components/suite/MasteryBar'
import ScreenHeader from '../../components/suite/ScreenHeader'
import SessionDetail from '../../components/suite/SessionDetail'
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

  const [openSession, setOpenSession] = useState<string | null>(null)

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
        <h2 className="mb-3 text-xl font-extrabold text-ink">The last two weeks</h2>
        <div className="flex gap-1.5">
          {last14.map((d) => (
            <div key={d.day} className="flex-1 text-center" title={`${d.day}: ${d.items} items`}>
              <div
                className={`mx-auto h-12 w-full rounded-lg ${intensityClass(d.items)}`}
                aria-label={`${d.items} items on ${d.day}`}
              />
              <span className="mt-1 block text-[10px] font-bold text-stone">{d.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Spelling */}
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold text-ink">Spelling 🐈‍⬛</h2>
          <div className="flex flex-wrap gap-2">
            <Pill className="bg-wash text-ink">
              Grade {GRADES[spelling.levelIndex]?.grade ?? 2}
            </Pill>
            <Pill className="bg-wash text-muted">
              Ability {spelling.ability.toFixed(2)}
            </Pill>
            <Pill className="bg-wash text-muted">
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
                <span className="w-24 shrink-0 text-sm font-extrabold text-muted">
                  Grade {g.grade}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-tray">
                  <div className="h-full bg-pine" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs font-bold text-stone">
                  {b.mastered}/{b.total}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Word-level report */}
      <Card className="mb-4">
        <h2 className="mb-1 text-xl font-extrabold text-ink">Words to work on 🎯</h2>
        <p className="mb-3 text-sm font-bold text-muted">
          Ranked by how often they have actually been missed.
        </p>
        {trouble.length === 0 ? (
          <p className="font-bold text-stone">
            Nothing here yet — spell a few rounds and the tricky words will show up.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-left">
              <thead>
                <tr className="text-xs font-extrabold uppercase tracking-wide text-stone">
                  <th className="py-1">Word</th>
                  <th className="py-1">Correct</th>
                  <th className="py-1">Missed after knowing it</th>
                  <th className="py-1">Next review</th>
                </tr>
              </thead>
              <tbody>
                {(limits.detailedWordReport ? trouble : trouble.slice(0, 5)).map((m) => (
                  <tr key={m.itemKey} className="border-t border-hair">
                    <td className="py-2 font-mono font-bold text-ink">{m.itemKey}</td>
                    <td className="py-2 font-bold text-muted">
                      {m.totalCorrect}/{m.totalAttempts}
                    </td>
                    <td className="py-2 font-bold text-muted">{m.lapses}</td>
                    <td className="py-2 font-bold text-muted">{m.dueOn ?? 'now'}</td>
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
          <h2 className="mb-1 text-xl font-extrabold text-ink">Turned around 💪</h2>
          <p className="mb-3 text-sm font-bold text-muted">
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
          <h2 className="text-xl font-extrabold text-ink">Typing ⌨️</h2>
          <div className="flex flex-wrap gap-2">
            <Pill className="bg-pineSoft/30 text-pine">{typingLessons} lessons played</Pill>
            <Pill className="bg-wash text-muted">{game.state.totalStars} stars</Pill>
            <Pill className="bg-wash text-muted">best {bestWpm} WPM</Pill>
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate({ name: 'typing' })}>
          Open Keyboard Cats →
        </Button>
      </Card>

      {/* Quiz decks */}
      <Card className="mb-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold text-ink">Quiz decks 🃏</h2>
          <div className="flex flex-wrap gap-2">
            <Pill className="bg-pine/10 text-pine">
              {quizTotals.mastered}/{quizTotals.cards} cards mastered
            </Pill>
            <Pill className="bg-wash text-muted">{quizTotals.started} decks started</Pill>
            {quizTotals.due > 0 && (
              <Pill className="bg-sun/30 text-ink">🔁 {quizTotals.due} due</Pill>
            )}
          </div>
        </div>
        <Button variant="ghost" onClick={() => navigate({ name: 'quiz' })}>
          Open Quiz Cats →
        </Button>
      </Card>

      {/* Session log */}
      <Card>
        <h2 className="mb-1 text-xl font-extrabold text-ink">Recent sessions</h2>
        <p className="mb-3 font-bold text-muted">
          Open any round to see every answer, what was typed, and how long each one took.
        </p>
        {visibleSessions.length === 0 ? (
          <p className="font-bold text-stone">No sessions recorded yet.</p>
        ) : (
          <ul className="divide-y divide-hair">
            {visibleSessions.slice(0, 15).map((s) => {
              const open = openSession === s.id
              return (
                <li key={s.id} className="py-1">
                  <button
                    onClick={() => setOpenSession(open ? null : s.id)}
                    aria-expanded={open}
                    className="flex w-full flex-wrap items-center gap-2 rounded-xl px-1 py-2 text-left hover:bg-quiet"
                  >
                    <span className="text-xs font-bold text-stone">{open ? '▾' : '▸'}</span>
                    <span className="text-lg">{SUBJECT_EMOJI[s.subject] ?? '⌨️'}</span>
                    <span className="font-extrabold text-ink">
                      {activityLabel(s.activity, s.subject)}
                    </span>
                    <span className="font-bold text-muted">
                      {s.itemsCorrect}/{s.itemsTotal} · {Math.round(s.accuracy)}%
                    </span>
                    {s.isTest && (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-700">
                        graded
                      </span>
                    )}
                    {/* Only worth saying when some of the round was not checked;
                        a fully verified round needs no caveat. */}
                    {typeof s.verifiedItemsTotal === 'number' &&
                      s.evidence === 'attempts' &&
                      s.verifiedItemsTotal < s.itemsTotal && (
                        <span
                          className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-extrabold text-amber-700"
                          title={`${s.verifiedItemsTotal} of ${s.itemsTotal} answers were checked by the app; the rest were self-graded.`}
                        >
                          {s.verifiedItemsTotal}/{s.itemsTotal} checked
                        </span>
                      )}
                    <span className="ml-auto text-xs font-bold text-stone">
                      {new Date(s.endedAt).toLocaleDateString()}
                    </span>
                  </button>
                  {open && <SessionDetail session={s} />}
                </li>
              )
            })}
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
    <div className="rounded-2xl bg-white/85 p-4 text-center shadow ring-1 ring-hair">
      <div className="text-2xl">{emoji}</div>
      <div className="text-2xl font-extrabold text-ink">{value}</div>
      <div className="text-xs font-bold uppercase tracking-wide text-stone">{label}</div>
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
  if (items === 0) return 'bg-wash'
  if (items < 6) return 'bg-emerald-200'
  if (items < 15) return 'bg-emerald-400'
  return 'bg-emerald-600'
}
