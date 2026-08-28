import { useState } from 'react'
import CatMascot from '../components/CatMascot'
import ScreenHeader from '../components/suite/ScreenHeader'
import { Button, Card } from '../components/ui'
import { TOTAL_LESSONS } from '../data/lessons'
import type { GameApi } from '../hooks/useGameState'
import type { Navigate } from '../routes'

interface Props {
  game: GameApi
  navigate: Navigate
}

export default function TypingHome({ game, navigate }: Props) {
  const { state, setPlayerName } = game
  const [name, setName] = useState(state.playerName)

  const commitName = () => setPlayerName(name.trim())
  const doneLessons = Object.values(state.lessons).filter((l) => l.plays > 0).length

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-4">
      <div className="w-full">
        <ScreenHeader
          title="Keyboard Cats ⌨️"
          subtitle="Learn to type &amp; collect cats!"
          onBack={() => navigate({ name: 'home' })}
          backLabel="← Academy"
        />
      </div>

      <div className="flex items-end gap-2">
        <CatMascot mood="excited" size={120} className="animate-floaty" />
        <CatMascot mood="happy" color="#94a3b8" size={84} className="animate-floaty" />
      </div>

      <Card className="w-full max-w-md">
        <label className="mb-1 block text-sm font-bold text-muted">
          What should we call you?
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && commitName()}
          placeholder="Type your name..."
          maxLength={16}
          className="mb-4 w-full rounded-xl border-2 border-edge px-4 py-3 text-lg font-bold text-ink focus:border-ink focus:outline-none"
        />

        <div className="grid grid-cols-1 gap-3">
          <Button
            onClick={() => {
              commitName()
              navigate({ name: 'map' })
            }}
          >
            🎓 Start Learning
          </Button>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => navigate({ name: 'rain' })}>
              🌧️ Cat Rain
            </Button>
            <Button variant="secondary" onClick={() => navigate({ name: 'practice' })}>
              ⌨️ Practice
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="ghost" onClick={() => navigate({ name: 'trophies' })}>
              🏆 Trophy Room
            </Button>
            <Button variant="ghost" onClick={() => navigate({ name: 'settings' })}>
              ⚙️ Settings
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex gap-6 text-center">
        <Stat big={`${state.totalStars}`} label="⭐ Stars" />
        <Stat big={`${doneLessons}/${TOTAL_LESSONS}`} label="Lessons" />
        <Stat big={`${state.collectedCats.length}`} label="🐱 Cats" />
      </div>
    </div>
  )
}

function Stat({ big, label }: { big: string; label: string }) {
  return (
    <div>
      <div className="text-2xl font-extrabold text-ink">{big}</div>
      <div className="text-sm font-bold text-stone">{label}</div>
    </div>
  )
}
