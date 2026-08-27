import { useCallback, useEffect, useRef, useState } from 'react'
import { useTypingEngine, type EngineSnapshot } from '../hooks/useTypingEngine'
import { fingerForChar } from '../data/keyboard'
import { computeScore, type RoundResult } from '../lib/stats'
import { sfx, unlockAudio } from '../lib/sound'
import TypingText from './TypingText'
import Keyboard from './Keyboard'
import Hands from './Hands'
import Hud from './Hud'
import CatMascot, { type Mood } from './CatMascot'
import { Button } from './ui'

interface Props {
  text: string
  title: string
  subtitle?: string
  catColor?: string
  showKeyboard: boolean
  showHands: boolean
  sound: boolean
  onFinish: (result: RoundResult) => void
  onQuit: () => void
}

export default function GamePlay({
  text,
  title,
  subtitle,
  catColor = '#f59e0b',
  showKeyboard,
  showHands,
  sound,
  onFinish,
  onQuit,
}: Props) {
  const [mood, setMood] = useState<Mood>('neutral')
  const moodTimer = useRef<number | null>(null)
  const [floaters, setFloaters] = useState<{ id: number; text: string }[]>([])
  const floatId = useRef(0)

  const flashMood = useCallback((m: Mood, revert: Mood = 'neutral', ms = 500) => {
    setMood(m)
    if (moodTimer.current) window.clearTimeout(moodTimer.current)
    moodTimer.current = window.setTimeout(() => setMood(revert), ms)
  }, [])

  const addFloater = useCallback((t: string) => {
    const id = floatId.current++
    setFloaters((f) => [...f, { id, text: t }])
    window.setTimeout(() => {
      setFloaters((f) => f.filter((x) => x.id !== id))
    }, 1000)
  }, [])

  const { snapshot, handleChar } = useTypingEngine(text, {
    onCorrect: (_char, combo) => {
      if (sound) {
        if (combo > 0 && combo % 10 === 0) sfx.meow()
        else if (combo >= 3) sfx.combo(combo)
        else sfx.correct()
      }
      if (combo > 0 && combo % 10 === 0) {
        flashMood('wow', 'excited', 700)
        addFloater('MEOW! 🐱')
      } else if (combo >= 5) {
        setMood('excited')
        if (combo % 5 === 0) addFloater(`Combo x${combo}! 🔥`)
      } else {
        flashMood('happy', 'neutral', 300)
      }
    },
    onWrong: () => {
      if (sound) sfx.wrong()
      flashMood('sad', 'neutral', 400)
    },
    onFinish: (snap: EngineSnapshot) => {
      if (sound) sfx.win()
      const score = computeScore(snap.correct, snap.accuracy, snap.wpm, snap.maxCombo)
      onFinish({
        wpm: snap.wpm,
        accuracy: snap.accuracy,
        correct: snap.correct,
        incorrect: snap.incorrect,
        totalTyped: snap.correct + snap.incorrect,
        elapsedMs: snap.elapsedMs,
        maxCombo: snap.maxCombo,
        score,
      })
    },
  })

  // Keyboard input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape') {
        onQuit()
        return
      }
      if (e.key === 'Tab') e.preventDefault()
      if (e.key === ' ') e.preventDefault()
      if (e.key.length === 1) {
        unlockAudio()
        handleChar(e.key)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleChar, onQuit])

  const activeFinger = snapshot.nextChar ? fingerForChar(snapshot.nextChar) ?? null : null
  const progress = snapshot.target.length ? snapshot.cursor / snapshot.target.length : 0
  const hasError = snapshot.lastWrong !== null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-grape md:text-3xl">{title}</h2>
          {subtitle && <p className="text-slate-500">{subtitle}</p>}
        </div>
        <Button variant="ghost" onClick={onQuit} aria-label="Quit to menu">
          ✕ Menu
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <CatMascot mood={mood} color={catColor} size={110} className="animate-floaty" />
          {floaters.map((f) => (
            <span
              key={f.id}
              className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap text-lg font-extrabold text-bubble animate-floaty"
            >
              {f.text}
            </span>
          ))}
        </div>
        <div className="flex-1">
          <Hud
            wpm={snapshot.wpm}
            accuracy={snapshot.accuracy}
            combo={snapshot.combo}
            progress={progress}
          />
        </div>
      </div>

      <TypingText target={snapshot.target} cursor={snapshot.cursor} hasError={hasError} />

      {showKeyboard && (
        <Keyboard nextChar={snapshot.nextChar} lastWrong={snapshot.lastWrong} />
      )}
      {showHands && <Hands activeFinger={activeFinger} />}

      <p className="text-center text-sm text-slate-400">
        Type the highlighted letter. Keep your fingers on the home row! Press Esc to quit.
      </p>
    </div>
  )
}
