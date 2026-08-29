// Tiny Web Audio synth so we ship zero audio files. All sounds are generated.
let ctx: AudioContext | null = null
let enabled = true

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  return ctx
}

export function setSoundEnabled(on: boolean): void {
  enabled = on
}

// Browsers require a user gesture before audio can start.
export function unlockAudio(): void {
  const c = getCtx()
  if (c && c.state === 'suspended') void c.resume()
}

function blip(freq: number, durationMs: number, type: OscillatorType, gain = 0.08): void {
  if (!enabled) return
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') void c.resume()
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  g.gain.setValueAtTime(0, c.currentTime)
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.005)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000)
  osc.connect(g)
  g.connect(c.destination)
  osc.start()
  osc.stop(c.currentTime + durationMs / 1000)
}

export const sfx = {
  correct() {
    blip(660, 70, 'sine', 0.05)
  },
  combo(step: number) {
    // Rising pitch as the streak grows — feels rewarding.
    const freq = 520 + Math.min(step, 20) * 25
    blip(freq, 80, 'triangle', 0.06)
  },
  wrong() {
    blip(160, 120, 'sawtooth', 0.05)
  },
  chime() {
    // Two-tone wobble, the milestone sound.
    blip(700, 140, 'sine', 0.09)
    setTimeout(() => blip(520, 180, 'sine', 0.08), 120)
  },
  win() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((n, i) => setTimeout(() => blip(n, 160, 'triangle', 0.07), i * 110))
  },
  star() {
    blip(880, 120, 'sine', 0.07)
    setTimeout(() => blip(1175, 140, 'sine', 0.06), 90)
  },
  countdown() {
    blip(440, 120, 'square', 0.05)
  },
  go() {
    blip(880, 200, 'square', 0.07)
  },
}
