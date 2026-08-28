import { useAuth } from '../../auth/AuthProvider'
import Mascot, { MASCOT_MUTED } from '../../components/Mascot'
import AccountChip from '../../components/suite/AccountChip'
import LearnerChip from '../../components/suite/LearnerChip'
import { Button, Card, Pill } from '../../components/ui'
import { TOTAL_LESSONS } from '../../data/lessons'
import { useAssignments } from '../../hooks/useAssignments'
import type { GameApi } from '../../hooks/useGameState'
import { routeForAssignment } from '../../lib/assignments/routing'
import { useLearners } from '../../lib/learners/LearnerProvider'
import { useProgress } from '../../lib/progress/ProgressProvider'
import { dueWords, levelSnapshot, totalCurriculumWords } from '../../lib/spelling/stats'
import { breakdown } from '../../lib/spelling/stats'
import { ALL_WORDS } from '../../data/spelling'
import { STARTER_DECKS } from '../../data/quiz/starterDecks'
import { allDecks, deckStats } from '../../lib/quiz/decks'
import { todayString } from '../../lib/progress/types'
import type { Navigate } from '../../routes'

export default function SuiteHome({ game, navigate }: { game: GameApi; navigate: Navigate }) {
  const { status, profile, configured } = useAuth()
  const { snapshot, skill, sync } = useProgress()

  const spelling = skill('spelling')
  const level = levelSnapshot(snapshot, spelling.levelIndex)
  const overall = breakdown(snapshot, ALL_WORDS)
  const due = dueWords(snapshot).length

  const typingLessons = Object.values(game.state.lessons).filter((l) => l.plays > 0).length

  const today = todayString()
  const quizTotals = allDecks(snapshot, STARTER_DECKS).reduce(
    (acc, deck) => {
      const s = deckStats(snapshot, deck, today)
      return { cards: acc.cards + s.total, mastered: acc.mastered + s.mastered, due: acc.due + s.due }
    },
    { cards: 0, mastered: 0, due: 0 },
  )
  const greeting = profile?.displayName || game.state.playerName
  const { open: openTasks } = useAssignments()
  const { learners } = useLearners()
  const overdueTasks = openTasks.filter((t) => t.dueOn !== null && t.dueOn < today).length

  return (
    <div className="mx-auto w-full max-w-4xl py-4">
      <div className="mb-4 flex items-center justify-end gap-2">
        <LearnerChip onManage={() => navigate({ name: 'family' })} />
        <AccountChip onOpen={() => navigate({ name: status === 'signed-in' ? 'account' : 'auth' })} />
      </div>

      <div className="mb-6 flex flex-col items-center">
        <div className="flex items-end gap-2">
          <Mascot mood="cheer" size={116} className="animate-floaty" />
          <Mascot mood="idle" color={MASCOT_MUTED} size={82} className="animate-floaty" />
        </div>
        <h1 className="mt-2 text-center text-5xl font-extrabold text-ink drop-shadow-sm md:text-6xl">
          Cat Academy
        </h1>
        <p className="text-center text-lg font-bold text-muted">
          {greeting ? `Welcome back, ${greeting}! 🐾` : 'Type, spell, and quiz yourself — with cats. 🐾'}
        </p>
        {sync === 'merging' && (
          <Pill className="mt-2 bg-sun/30 text-ink">
            🔄 Moving your saved progress into your account…
          </Pill>
        )}
      </div>

      {/* Work someone has set comes before the free choice of subjects: if a
          child has homework, that is the thing to show them first. */}
      {openTasks.length > 0 && (
        <Card className="mb-6 ring-2 ring-edge">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-extrabold text-ink">
              ✅ Your tasks ({openTasks.length})
            </h2>
            {overdueTasks > 0 && (
              <Pill className="bg-rose-100 text-rose-700">{overdueTasks} overdue</Pill>
            )}
          </div>
          <ul className="mb-3 space-y-2">
            {openTasks.slice(0, 3).map((task) => {
              const route = routeForAssignment(task)
              return (
                <li
                  key={task.id}
                  className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/85 px-4 py-3 ring-1 ring-hair"
                >
                  <span className="font-extrabold text-ink">{task.title}</span>
                  {task.dueOn && task.dueOn < today && (
                    <Pill className="bg-rose-100 text-xs text-rose-700">overdue</Pill>
                  )}
                  {route && (
                    <Button className="ml-auto" onClick={() => navigate(route)}>
                      ▶️ Start
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
          <Button variant="ghost" onClick={() => navigate({ name: 'tasks' })}>
            See all tasks →
          </Button>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <SubjectCard
          emoji="🐈‍⬛"
          title="Spelling Cats"
          tagline="Adaptive spelling, second grade and up."
          stats={[
            { label: 'Level', value: `Grade ${level.grade}` },
            { label: 'Words mastered', value: `${overall.mastered}/${totalCurriculumWords()}` },
            ...(due > 0 ? [{ label: 'Due for review', value: String(due) }] : []),
          ]}
          cta={spelling.placed ? 'Keep practising' : 'Find my level'}
          onClick={() => navigate({ name: 'spelling' })}
        />
        <SubjectCard
          emoji="⌨️"
          title="Keyboard Cats"
          tagline="Touch typing, one world at a time."
          stats={[
            { label: 'Lessons done', value: `${typingLessons}/${TOTAL_LESSONS}` },
            { label: 'Stars', value: String(game.state.totalStars) },
            { label: 'Cats collected', value: String(game.state.collectedCats.length) },
          ]}
          cta="Keep typing"
          onClick={() => navigate({ name: 'typing' })}
        />
        <SubjectCard
          emoji="🃏"
          title="Quiz Cats"
          tagline="Flashcards for anything at all."
          stats={[
            { label: 'My decks', value: String(snapshot.decks.length) },
            { label: 'Cards mastered', value: `${quizTotals.mastered}/${quizTotals.cards}` },
            ...(quizTotals.due > 0 ? [{ label: 'Due for review', value: String(quizTotals.due) }] : []),
          ]}
          cta={snapshot.decks.length ? 'Keep studying' : 'Make a deck'}
          onClick={() => navigate({ name: 'quiz' })}
        />
      </div>

      {/* The two a grown-up needs from the child's home screen: the work set
          for them, and the people. Your own things — the library, your tutor
          code — live in your account instead. */}
      {learners.length > 0 && (
        <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button variant="secondary" onClick={() => navigate({ name: 'tasks' })}>
            ✅ Tasks{openTasks.length > 0 ? ` (${openTasks.length})` : ''}
          </Button>
          <Button variant="secondary" onClick={() => navigate({ name: 'family' })}>
            👨‍👩‍👧 Family
          </Button>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Button variant="ghost" onClick={() => navigate({ name: 'progress' })}>
          📊 Progress
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'trophies' })}>
          🏆 Trophies
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'custom-lists' })}>
          ✏️ My lists
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'quiz' })}>
          🃏 My decks
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'settings' })}>
          ⚙️ Settings
        </Button>
      </div>


      {status !== 'signed-in' && configured && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-extrabold text-ink">Save your progress ☁️</h2>
              <p className="font-bold text-muted">
                Everything you have done so far is saved on this device. Make a free account and it
                follows you to any other one — nothing is lost.
              </p>
            </div>
            <Button onClick={() => navigate({ name: 'auth' })}>Create a free account</Button>
          </div>
        </Card>
      )}

      <p className="mt-6 text-center text-xs font-bold text-stone">
        Free forever, no ads.{' '}
        <button className="underline hover:text-ink" onClick={() => navigate({ name: 'upgrade' })}>
          Family Pro
        </button>{' '}
        adds custom word lists and printable reports.
      </p>
    </div>
  )
}

interface SubjectCardProps {
  emoji: string
  title: string
  tagline: string
  stats: Array<{ label: string; value: string }>
  cta: string
  onClick: () => void
}

// A neutral card with a hair border. The per-subject gradients this replaces
// were the cat era's paint, and they fought nine of the ten themes; the only
// colour left here is the accent on the CTA.
function SubjectCard({ emoji, title, tagline, stats, cta, onClick }: SubjectCardProps) {
  return (
    <button
      onClick={onClick}
      className="rounded-3xl border border-hair bg-chalk p-1 text-left transition-transform hover:-translate-y-px"
    >
      <div className="flex h-full flex-col rounded-[22px] p-5">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-4xl">{emoji}</span>
          <div>
            <h2 className="text-2xl font-extrabold text-ink">{title}</h2>
            <p className="font-bold text-muted">{tagline}</p>
          </div>
        </div>
        <div className="my-3 flex flex-wrap gap-x-5 gap-y-2">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-lg font-extrabold text-ink">{s.value}</div>
              <div className="text-xs font-bold uppercase tracking-wide text-stone">
                {s.label}
              </div>
            </div>
          ))}
        </div>
        <span className="mt-auto inline-block font-extrabold text-accent">{cta} →</span>
      </div>
    </button>
  )
}
