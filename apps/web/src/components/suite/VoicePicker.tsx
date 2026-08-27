import { useEffect, useState } from 'react'
import { Button } from '../ui'
import {
  currentVoice,
  listVoices,
  savedVoiceURI,
  setVoice,
  speak,
  whenVoicesReady,
} from '../../lib/spelling/speech'

/**
 * Which voice reads the words out. The automatic pick is usually right, but
 * "usually" is not good enough when a child has to listen to it for twenty
 * words in a row — and which voices exist depends entirely on the device, so
 * this has to be chosen by ear rather than guessed at in code.
 */
export default function VoicePicker({ className = '' }: { className?: string }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(listVoices())
  const [selected, setSelected] = useState<string>(savedVoiceURI() ?? '')

  // Voices arrive asynchronously, so the list is usually empty on first render.
  useEffect(() => whenVoicesReady(() => setVoices(listVoices())), [])

  if (voices.length === 0) return null

  const auto = voices[0]
  const choose = (uri: string) => {
    setSelected(uri)
    setVoice(uri || null)
    const voice = currentVoice()
    speak(voice ? `Hi! I am ${voice.name.replace(/\s*\(.*\)$/, '')}. Ready to spell?` : 'Ready to spell?')
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="text-sm font-extrabold text-slate-500">🔊 Reading voice</span>
      <select
        value={selected}
        onChange={(e) => choose(e.target.value)}
        aria-label="Reading voice"
        className="rounded-xl border-2 border-purple-200 bg-white/80 px-3 py-2 text-sm font-bold text-grape"
      >
        <option value="">Best on this device ({auto.name})</option>
        {voices.map((v) => (
          <option key={v.voiceURI} value={v.voiceURI}>
            {v.name} · {v.lang}
          </option>
        ))}
      </select>
      <Button
        variant="ghost"
        className="px-4 py-2 text-sm"
        onClick={() => speak('Spell the word: whiskers. The cat twitched its whiskers.')}
      >
        ▶︎ Hear it
      </Button>
    </div>
  )
}
