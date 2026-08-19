import { useAuth } from '../../auth/AuthProvider'
import CatMascot from '../../components/CatMascot'
import AccountChip from '../../components/suite/AccountChip'
import { Button, Card, Pill } from '../../components/ui'
import { TOTAL_LESSONS } from '../../data/lessons'
import type { GameApi } from '../../hooks/useGameState'
import { useProgress } from '../../lib/progress/ProgressProvider'
import { dueWords, levelSnapshot, totalCurriculumWords } from '../../lib/spelling/stats'
import { breakdown } from '../../lib/spelling/stats'
import { ALL_WORDS } from '../../data/spelling'
import type { Navigate } from '../../routes'

export default function SuiteHome({ game, navigate }: { game: GameApi; navigate: Navigate }) {
  const { status, profile, configured } = useAuth()
  const { snapshot, skill, sync } = useProgress()

  const spelling = skill('spelling')
  const level = levelSnapshot(snapshot, spelling.levelIndex)
  const overall = breakdown(snapshot, ALL_WORDS)
  const due = dueWords(snapshot).length

  const typingLessons = Object.values(game.state.lessons).filter((l) => l.plays > 0).length
  const greeting = profile?.displayName || game.state.playerName

  return (
    <div className="mx-auto w-full max-w-4xl py-4">
      <div className="mb-4 flex items-center justify-end">
        <AccountChip onOpen={() => navigate({ name: status === 'signed-in' ? 'account' : 'auth' })} />
      </div>

      <div className="mb-6 flex flex-col items-center">
        <div className="flex items-end gap-2">
          <CatMascot mood="excited" size={116} className="animate-floaty" />
          <CatMascot mood="happy" color="#94a3b8" size={82} className="animate-floaty" />
        </div>
        <h1 className="mt-2 text-center text-5xl font-extrabold text-grape drop-shadow-sm md:text-6xl">
          Cat Academy
        </h1>
        <p className="text-center text-lg font-bold text-slate-500">
          {greeting ? `Welcome back, ${greeting}! 🐾` : 'Learn to type and spell — with cats. 🐾'}
        </p>
        {sync === 'merging' && (
          <Pill className="mt-2 bg-amber-100 text-amber-700">
            🔄 Moving your saved progress into your account…
          </Pill>
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <SubjectCard
          emoji="🐈‍⬛"
          title="Spelling Cats"
          tagline="Adaptive spelling, second grade and up."
          gradient="from-violet-300 to-fuchsia-400"
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
          gradient="from-sky-300 to-cyan-400"
          stats={[
            { label: 'Lessons done', value: `${typingLessons}/${TOTAL_LESSONS}` },
            { label: 'Stars', value: String(game.state.totalStars) },
            { label: 'Cats collected', value: String(game.state.collectedCats.length) },
          ]}
          cta="Keep typing"
          onClick={() => navigate({ name: 'typing' })}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Button variant="ghost" onClick={() => navigate({ name: 'progress' })}>
          📊 Progress
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'trophies' })}>
          🏆 Trophies
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'custom-lists' })}>
          ✏️ My lists
        </Button>
        <Button variant="ghost" onClick={() => navigate({ name: 'settings' })}>
          ⚙️ Settings
        </Button>
      </div>

      {status !== 'signed-in' && configured && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-extrabold text-grape">Save your progress ☁️</h2>
              <p className="font-bold text-slate-500">
                Everything you have done so far is saved on this device. Make a free account and it
                follows you to any other one — nothing is lost.
              </p>
            </div>
            <Button onClick={() => navigate({ name: 'auth' })}>Create a free account</Button>
          </div>
        </Card>
      )}

      <p className="mt-6 text-center text-xs font-bold text-slate-400">
        Free forever, no ads.{' '}
        <button className="underline hover:text-grape" onClick={() => navigate({ name: 'upgrade' })}>
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
  gradient: string
  stats: Array<{ label: string; value: string }>
  cta: string
  onClick: () => void
}

function SubjectCard({ emoji, title, tagline, gradient, stats, cta, onClick }: SubjectCardProps) {
  return (
    <button
      onClick={onClick}
      className={`rounded-3xl bg-gradient-to-br ${gradient} p-1 text-left shadow-lg transition-transform hover:-translate-y-1 hover:shadow-xl`}
    >
      <div className="flex h-full flex-col rounded-[22px] bg-white/92 p-5">
        <div className="mb-2 flex items-center gap-3">
          <span className="text-4xl">{emoji}</span>
          <div>
            <h2 className="text-2xl font-extrabold text-grape">{title}</h2>
            <p className="font-bold text-slate-500">{tagline}</p>
          </div>
        </div>
        <div className="my-3 flex flex-wrap gap-x-5 gap-y-2">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="text-lg font-extrabold text-grape">{s.value}</div>
              <div className="text-xs font-bold uppercase tracking-wide text-slate-400">
                {s.label}
              </div>
            </div>
          ))}
        </div>
        <span className="mt-auto inline-block font-extrabold text-grape">{cta} →</span>
      </div>
    </button>
  )
}
