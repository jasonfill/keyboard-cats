// Browser APIs the app touches that jsdom does not implement.
//
// Kept to genuine gaps only: anything stubbed here is behaviour a test can no
// longer see, so the list is deliberately short.

import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// Speech synthesis drives dictation. jsdom has none.
Object.defineProperty(window, 'speechSynthesis', {
  writable: true,
  value: {
    speak: vi.fn(),
    cancel: vi.fn(),
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  },
})
;(window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
  constructor(public text?: string) {}
}

// The sound engine builds an AudioContext lazily; tests never want audio.
;(window as unknown as { AudioContext: unknown }).AudioContext = class {
  createOscillator() {
    return { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { value: 0 }, type: '' }
  }
  createGain() {
    return { connect: vi.fn(), gain: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() } }
  }
  get destination() {
    return {}
  }
  get currentTime() {
    return 0
  }
  resume() {
    return Promise.resolve()
  }
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})
