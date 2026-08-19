// Text to speech for dictation. Uses the browser's built-in speech synthesis so
// there are no audio files to ship and no API to pay for.
//
// Not every browser has a usable voice (older Android, some Linux builds), so
// `isSpeechAvailable()` lets the UI fall back to briefly flashing the word
// instead of dictating it. The activity stays playable either way.

let cachedVoice: SpeechSynthesisVoice | null = null
let voicesLoaded = false

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

/**
 * A browser can expose speechSynthesis and still have no voice installed —
 * headless Chrome and some Linux desktops do exactly that, and calling speak()
 * there silently does nothing. Both halves have to be true before the app
 * trusts dictation.
 */
export function isSpeechAvailable(): boolean {
  const s = synth()
  if (!s || typeof window.SpeechSynthesisUtterance !== 'function') return false
  return s.getVoices().length > 0
}

/**
 * Voices arrive asynchronously in most browsers. Calls back once they are
 * loaded, or after a short grace period with whatever the answer is by then.
 * Returns a cleanup function.
 */
export function whenVoicesReady(callback: (available: boolean) => void): () => void {
  const s = synth()
  if (!s || typeof window.SpeechSynthesisUtterance !== 'function') {
    callback(false)
    return () => {}
  }
  if (s.getVoices().length > 0) {
    callback(true)
    return () => {}
  }

  let settled = false
  const finish = (available: boolean) => {
    if (settled) return
    settled = true
    callback(available)
  }
  const onChange = () => finish(s.getVoices().length > 0)
  s.addEventListener('voiceschanged', onChange)
  const timer = setTimeout(() => finish(s.getVoices().length > 0), 1500)

  return () => {
    clearTimeout(timer)
    s.removeEventListener('voiceschanged', onChange)
  }
}

/** Prefer a natural English voice; fall back to whatever English exists. */
function pickVoice(): SpeechSynthesisVoice | null {
  const s = synth()
  if (!s) return null
  const voices = s.getVoices()
  if (voices.length === 0) return null

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'))
  const pool = english.length ? english : voices
  const preferred = ['Samantha', 'Google US English', 'Microsoft Aria', 'Karen', 'Daniel']
  for (const name of preferred) {
    const match = pool.find((v) => v.name.includes(name))
    if (match) return match
  }
  return pool.find((v) => v.localService) ?? pool[0]
}

/** Voices load asynchronously in most browsers; warm them up on first use. */
export function primeVoices(): void {
  const s = synth()
  if (!s || voicesLoaded) return
  cachedVoice = pickVoice()
  if (cachedVoice) voicesLoaded = true
  s.onvoiceschanged = () => {
    cachedVoice = pickVoice()
    voicesLoaded = !!cachedVoice
  }
}

export interface SpeakOptions {
  rate?: number
  pitch?: number
  onEnd?: () => void
}

export function speak(text: string, opts: SpeakOptions = {}): void {
  const s = synth()
  if (!s) {
    opts.onEnd?.()
    return
  }
  s.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.voice = cachedVoice ?? pickVoice()
  utterance.lang = utterance.voice?.lang ?? 'en-US'
  // Slower than conversational — this is dictation for a child.
  utterance.rate = opts.rate ?? 0.85
  utterance.pitch = opts.pitch ?? 1
  utterance.onend = () => opts.onEnd?.()
  utterance.onerror = () => opts.onEnd?.()
  s.speak(utterance)
}

/**
 * The standard spelling-bee cadence: the word, a pause, the word in a
 * sentence, a pause, then the word again.
 */
export function dictate(word: string, sentence: string, onEnd?: () => void): void {
  speak(word, {
    onEnd: () => speak(sentence, { onEnd: () => speak(word, { rate: 0.75, onEnd }) }),
  })
}

export function stopSpeaking(): void {
  synth()?.cancel()
}
