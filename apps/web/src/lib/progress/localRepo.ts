// Guest storage. Keeps the app fully playable with no account, and doubles as
// the offline cache that gets merged into a learner's cloud profile when they
// eventually sign up.

import { applyChange, SESSION_HISTORY_LIMIT, type ProgressChange, type ProgressRepo } from './repo'
import { emptySnapshot, type Attempt, type ProgressSnapshot } from './types'

const KEY = 'cat-academy:progress:v1'
const ATTEMPTS_KEY = 'cat-academy:attempts:v1'
/** Attempts are the raw record; cap them so localStorage never fills up. */
const ATTEMPT_LIMIT = 2000

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked (private browsing). Progress stays in memory for
    // this session rather than crashing the app.
  }
}

export function loadLocalSnapshot(): ProgressSnapshot {
  const stored = read<Partial<ProgressSnapshot>>(KEY, {})
  return { ...emptySnapshot(), ...stored }
}

export function loadLocalAttempts(): Attempt[] {
  return read<Attempt[]>(ATTEMPTS_KEY, [])
}

export function hasLocalProgress(): boolean {
  const snap = loadLocalSnapshot()
  return Object.keys(snap.skills).length > 0 || Object.keys(snap.mastery).length > 0
}

export class LocalProgressRepo implements ProgressRepo {
  readonly kind = 'local' as const

  private snapshot: ProgressSnapshot = loadLocalSnapshot()

  async load(): Promise<ProgressSnapshot> {
    this.snapshot = loadLocalSnapshot()
    return this.snapshot
  }

  async persist(change: ProgressChange): Promise<void> {
    this.snapshot = applyChange(this.snapshot, change)
    write(KEY, {
      ...this.snapshot,
      sessions: this.snapshot.sessions.slice(0, SESSION_HISTORY_LIMIT),
    })

    if (change.attempts?.length) {
      // Stamped with the round they belong to, so the history screen can show
      // a guest the same breakdown it shows a signed-in learner. The API does
      // the same thing with its session_id column.
      const sessionId = change.session?.id ?? null
      const stamped = change.attempts.map((a) => ({ ...a, sessionId }))
      const all = [...loadLocalAttempts(), ...stamped].slice(-ATTEMPT_LIMIT)
      write(ATTEMPTS_KEY, all)
    }
  }

  async attemptsForSession(sessionId: string): Promise<Attempt[]> {
    return loadLocalAttempts().filter((a) => a.sessionId === sessionId)
  }

  async reset(): Promise<void> {
    this.snapshot = emptySnapshot()
    try {
      localStorage.removeItem(KEY)
      localStorage.removeItem(ATTEMPTS_KEY)
    } catch {
      /* ignore */
    }
  }
}

/** Called after a successful guest -> account merge so nothing merges twice. */
export function clearLocalProgress(): void {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem(ATTEMPTS_KEY)
  } catch {
    /* ignore */
  }
}
