import { useState } from 'react'
import type { GameApi } from '../hooks/useGameState'
import { ACHIEVEMENTS } from '../data/achievements'
import { SPELLING_ACHIEVEMENTS } from '../data/spellingAchievements'
import { useProgress } from '../lib/progress/ProgressProvider'
import { Button, Card } from '../components/ui'
import CatPhoto from '../components/CatPhoto'
import type { Route } from '../App'

interface Props {
  game: GameApi
  navigate: (r: Route) => void
}

type Tab = 'scores' | 'badges' | 'cats'

export default function TrophyRoom({ game, navigate }: Props) {
  const [tab, setTab] = useState<Tab>('scores')
  const { state } = game
  const { snapshot } = useProgress()
  const spellingUnlocked = new Set(snapshot.achievements.map((a) => a.achievementId))

  return (
    <div className="mx-auto w-full max-w-3xl py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-grape">Trophy Room 🏆</h1>
        <Button variant="ghost" onClick={() => navigate({ name: 'home' })}>
          ← Home
        </Button>
      </div>

      <div className="mb-4 flex gap-2">
        <TabButton active={tab === 'scores'} onClick={() => setTab('scores')}>
          🥇 High Scores
        </TabButton>
        <TabButton active={tab === 'badges'} onClick={() => setTab('badges')}>
          🎖️ Badges
        </TabButton>
        <TabButton active={tab === 'cats'} onClick={() => setTab('cats')}>
          🐱 Cat Cards
        </TabButton>
      </div>

      {tab === 'scores' && (
        <Card>
          {state.highScores.length === 0 ? (
            <Empty text="No scores yet — play Cat Rain or Practice to set a record!" />
          ) : (
            <ol className="divide-y divide-purple-50">
              {state.highScores.map((h, i) => (
                <li key={i} className="flex items-center gap-3 py-2">
                  <span className="w-8 text-center text-xl font-extrabold text-slate-400">
                    {i + 1}
                  </span>
                  <span className="flex-1 truncate font-bold text-slate-700">
                    {h.name}
                    <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-grape">
                      {h.mode}
                    </span>
                  </span>
                  {h.wpm > 0 && <span className="text-sm text-sky-500">{h.wpm} wpm</span>}
                  <span className="text-sm text-emerald-500">{h.accuracy}%</span>
                  <span className="w-20 text-right text-lg font-extrabold text-grape">
                    {h.score.toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {tab === 'badges' && (
        <div className="space-y-5">
          <BadgeGrid
            title="Typing ⌨️"
            badges={ACHIEVEMENTS}
            unlocked={(id) => state.achievements.includes(id)}
          />
          <BadgeGrid
            title="Spelling 🐈‍⬛"
            badges={SPELLING_ACHIEVEMENTS}
            unlocked={(id) => spellingUnlocked.has(id)}
          />
        </div>
      )}

      {tab === 'cats' && (
        <Card>
          {state.collectedCats.length === 0 ? (
            <Empty text="No cat cards yet — finish lessons to collect adorable cats!" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {state.collectedCats.map((seed) => (
                <div key={seed} className="rounded-2xl bg-white p-2 shadow ring-1 ring-purple-100">
                  <CatPhoto seed={seed} className="h-28 w-full" />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2 font-bold transition-all ${
        active ? 'bg-grape text-white shadow' : 'bg-white text-slate-500 ring-1 ring-purple-100'
      }`}
    >
      {children}
    </button>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center font-bold text-slate-400">{text}</p>
}

function BadgeGrid({
  title,
  badges,
  unlocked,
}: {
  title: string
  badges: Array<{ id: string; name: string; emoji: string; description: string }>
  unlocked: (id: string) => boolean
}) {
  const earned = badges.filter((b) => unlocked(b.id)).length
  return (
    <div>
      <h2 className="mb-2 flex items-baseline gap-2 text-xl font-extrabold text-grape">
        {title}
        <span className="text-sm font-bold text-slate-400">
          {earned}/{badges.length}
        </span>
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {badges.map((a) => {
          const got = unlocked(a.id)
          return (
            <div
              key={a.id}
              className={`flex items-center gap-3 rounded-2xl p-4 ring-1 ${
                got ? 'bg-white ring-purple-200' : 'bg-slate-100 opacity-70 ring-slate-200'
              }`}
            >
              <span className={`text-3xl ${got ? '' : 'grayscale'}`}>{a.emoji}</span>
              <div>
                <div className="font-extrabold text-slate-700">{got ? a.name : '???'}</div>
                <div className="text-sm text-slate-500">{a.description}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
