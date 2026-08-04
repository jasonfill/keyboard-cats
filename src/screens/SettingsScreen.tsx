import { useState } from 'react'
import type { GameApi } from '../hooks/useGameState'
import { Button, Card } from '../components/ui'
import { setSoundEnabled, sfx } from '../lib/sound'
import type { Route } from '../App'

interface Props {
  game: GameApi
  navigate: (r: Route) => void
}

export default function SettingsScreen({ game, navigate }: Props) {
  const { state, setSetting, reset } = game
  const [confirmReset, setConfirmReset] = useState(false)

  return (
    <div className="mx-auto max-w-lg py-8">
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-grape">Settings ⚙️</h1>
          <Button variant="ghost" onClick={() => navigate({ name: 'home' })}>
            ← Home
          </Button>
        </div>

        <Toggle
          label="🔊 Sound effects"
          checked={state.settings.sound}
          onChange={(v) => {
            setSetting('sound', v)
            setSoundEnabled(v)
            if (v) sfx.meow()
          }}
        />
        <Toggle
          label="⌨️ Show on-screen keyboard"
          checked={state.settings.showKeyboard}
          onChange={(v) => setSetting('showKeyboard', v)}
        />
        <Toggle
          label="🖐️ Show hand guide"
          checked={state.settings.showHands}
          onChange={(v) => setSetting('showHands', v)}
        />

        <div className="mt-6 border-t border-purple-100 pt-4">
          {!confirmReset ? (
            <Button variant="danger" className="w-full" onClick={() => setConfirmReset(true)}>
              🗑️ Reset all progress
            </Button>
          ) : (
            <div className="space-y-2 text-center">
              <p className="font-bold text-red-500">
                Are you sure? This erases stars, cats &amp; scores!
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() => {
                    reset()
                    setConfirmReset(false)
                  }}
                >
                  Yes, reset
                </Button>
                <Button variant="ghost" className="flex-1" onClick={() => setConfirmReset(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Keyboard Cats · progress is saved on this device.
        </p>
      </Card>
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="mb-3 flex cursor-pointer items-center justify-between rounded-xl bg-white p-3 ring-1 ring-purple-100">
      <span className="font-bold text-slate-600">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition-colors ${
          checked ? 'bg-emerald-400' : 'bg-slate-300'
        }`}
        aria-pressed={checked}
      >
        <span
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </label>
  )
}
