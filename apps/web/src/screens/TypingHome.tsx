import { useState } from 'react'
import Mascot, { MASCOT_MUTED } from '../components/Mascot'
import ScreenHeader from '../components/suite/ScreenHeader'
import { Button, Card } from '../components/ui'
import { TOTAL_LESSONS } from '../data/lessons'
import type { GameApi } from '../hooks/useGameState'
import type { Navigate } from '../routes'
import { useTheme } from '../lib/theme/ThemeProvider'

interface Props {
  game: GameApi
  navigate: Navigate
}

export default function TypingHome({ game, navigate }: Props) {
  const { theme } = useTheme()
  const { state, setPlayerName } = game
  const [name, setName] = useState(state.playerName)

  const commitName = () => setPlayerName(name.trim())
  const doneLessons = Object.values(state.lessons).filter((l) => l.plays > 0).length

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 py-4">
      <div className="w-full">
        <ScreenHeader
          title="Typing ⌨️"
          subtitle={`Learn to type and collect ${theme.unit}.`}
          onBack={() => navigate({ name: 'home' })}
          backLabel="← Home"
        />
      </div>

      <div className="flex items-end gap-2">
        <Mascot mood="cheer" size={120} className="animate-floaty" />
        <Mascot mood="idle" color={MASCOT_MUTED} size={84} className="animate-floaty" />
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
              🌧️ Word Rain
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
        <Stat big={`${state.collectedCats.length}`} label={theme.unit} />
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
