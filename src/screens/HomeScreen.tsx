import { useState } from 'react'
import type { GameApi } from '../hooks/useGameState'
import CatMascot from '../components/CatMascot'
import { Button, Card } from '../components/ui'
import { TOTAL_LESSONS } from '../data/lessons'
import type { Route } from '../App'

interface Props {
  game: GameApi
  navigate: (r: Route) => void
}

export default function HomeScreen({ game, navigate }: Props) {
  const { state, setPlayerName } = game
  const [name, setName] = useState(state.playerName)

  const commitName = () => setPlayerName(name.trim())
  const doneLessons = Object.values(state.lessons).filter((l) => l.plays > 0).length

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-6">
      <div className="flex flex-col items-center">
        <div className="flex items-end gap-2">
          <CatMascot mood="excited" size={130} className="animate-floaty" />
          <CatMascot mood="happy" color="#94a3b8" size={90} className="animate-floaty" />
        </div>
        <h1 className="mt-2 text-center text-5xl font-extrabold text-grape drop-shadow-sm md:text-6xl">
          Keyboard Cats
        </h1>
        <p className="text-center text-lg font-bold text-slate-500">
          Learn to type &amp; collect cats! 🐾
        </p>
      </div>

      <Card className="w-full max-w-md">
        <label className="mb-1 block text-sm font-bold text-slate-500">
          What should we call you?
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => e.key === 'Enter' && commitName()}
          placeholder="Type your name..."
          maxLength={16}
          className="mb-4 w-full rounded-xl border-2 border-purple-200 px-4 py-3 text-lg font-bold text-grape focus:border-grape focus:outline-none"
        />

        <div className="grid grid-cols-1 gap-3">
          <Button onClick={() => { commitName(); navigate({ name: 'map' }) }}>
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
      <div className="text-2xl font-extrabold text-grape">{big}</div>
      <div className="text-sm font-bold text-slate-400">{label}</div>
    </div>
  )
}
