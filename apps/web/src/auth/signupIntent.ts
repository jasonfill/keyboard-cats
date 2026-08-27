// Who said they were signing up, and how old they said they were.
//
// Two jobs. First, carry the answer from the sign-up screen to the first-run
// screen, so a teenager who said "I am the learner" does not have to type their
// birth year twice. Second, remember a refusal: an age screen that resets on
// reload is not an age screen, it is a guessing game.

export type SignupRole = 'guardian' | 'learner'

export interface SignupIntent {
  role: SignupRole
  /** Only collected on the learner path. */
  birthYear?: number
}

const INTENT_KEY = 'cat-academy:signup-intent'
const REFUSED_KEY = 'cat-academy:signup-refused'

/** The age at which someone may hold their own account. */
export const MIN_SIGNUP_AGE = 13

export function ageFromBirthYear(birthYear: number, now: Date = new Date()): number {
  return now.getFullYear() - birthYear
}

export function saveSignupIntent(intent: SignupIntent): void {
  try {
    localStorage.setItem(INTENT_KEY, JSON.stringify(intent))
  } catch {
    /* a private window should not block signing up */
  }
}

export function readSignupIntent(): SignupIntent | null {
  try {
    const raw = localStorage.getItem(INTENT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SignupIntent
    if (parsed.role !== 'guardian' && parsed.role !== 'learner') return null
    return parsed
  } catch {
    return null
  }
}

export function clearSignupIntent(): void {
  try {
    localStorage.removeItem(INTENT_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * Record that this browser told us it belonged to an under-13.
 *
 * Deliberately sticky. The point of a neutral age screen is that the answer
 * counts; letting a reload wipe it would turn "how old are you" into "keep
 * trying". It is per-browser and easily cleared by someone determined, which is
 * the accepted limit of an age screen — it establishes what we were told, not
 * what is true.
 */
export function rememberRefusal(): void {
  try {
    localStorage.setItem(REFUSED_KEY, new Date().toISOString())
  } catch {
    /* ignore */
  }
}

export function wasRefused(): boolean {
  try {
    return Boolean(localStorage.getItem(REFUSED_KEY))
  } catch {
    return false
  }
}
