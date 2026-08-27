// All persistence lives in localStorage so the game needs no backend.
const KEY = 'keyboard-cats:v1'

export interface LessonProgress {
  stars: number // best stars earned (0-3)
  bestWpm: number
  bestAccuracy: number
  bestScore: number
  plays: number
}

export interface HighScore {
  name: string
  score: number
  wpm: number
  accuracy: number
  mode: string
  date: number
}

export interface GameState {
  playerName: string
  lessons: Record<string, LessonProgress>
  highScores: HighScore[]
  achievements: string[] // unlocked achievement ids
  collectedCats: string[] // cat sticker/card seeds collected
  keyErrors: Record<string, number> // char -> lifetime error count (spaced rep)
  keyAttempts: Record<string, number>
  settings: {
    sound: boolean
    showHands: boolean
    showKeyboard: boolean
  }
  totalStars: number
}

const DEFAULT_STATE: GameState = {
  playerName: '',
  lessons: {},
  highScores: [],
  achievements: [],
  collectedCats: [],
  keyErrors: {},
  keyAttempts: {},
  settings: { sound: true, showHands: true, showKeyboard: true },
  totalStars: 0,
}

export function loadState(): GameState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return structuredClone(DEFAULT_STATE)
    const parsed = JSON.parse(raw) as Partial<GameState>
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
    }
  } catch {
    return structuredClone(DEFAULT_STATE)
  }
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // storage full / unavailable — fail silently, game still playable.
  }
}

export function resetState(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
