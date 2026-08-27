// Types shared by the web app and the API.
//
// The API is the only thing that talks to Postgres, so these are the wire
// shapes — already camelCased, already parsed into numbers and dates. The
// snake_case row shapes never leave the API.

/** The age at which a learner may attach their own external account. */
export const SELF_SIGNIN_MIN_AGE = 13

export type AuthKind = 'none' | 'provisioned' | 'self'
export type GuardianRole = 'parent' | 'teacher'
export type InvitePurpose = 'guardian' | 'self_login'

export interface Learner {
  id: string
  ownerId: string
  displayName: string
  avatarEmoji: string
  gradeHint: number | null
  birthYear: number | null
  authKind: AuthKind
  authUserId: string | null
  createdAt: number
}

export interface Guardian {
  guardianId: string
  learnerId: string
  role: GuardianRole
  canManageContent: boolean
  createdAt: number
  /** Filled in when the API can see the guardian's profile. */
  displayName?: string | null
}

export interface NewLearner {
  displayName: string
  avatarEmoji?: string
  gradeHint?: number | null
  birthYear?: number | null
}

/** Age in whole years, or null when no birth year has been recorded. */
export function ageOf(learner: Pick<Learner, 'birthYear'>, now: Date = new Date()): number | null {
  if (!learner.birthYear) return null
  return now.getFullYear() - learner.birthYear
}

/**
 * Whether this learner may attach their own Google/email account. Mirrors the
 * `learners_guard` trigger in migration 0003: an unknown age is a no, because
 * the point of the gate is that we do not hand a child's record to an
 * unverified identity.
 *
 * Duplicated deliberately — the database is the enforcement point, this is so
 * the UI can grey out a button without a round trip.
 */
export function canUseSelfSignIn(learner: Pick<Learner, 'birthYear'>): boolean {
  const age = ageOf(learner)
  return age !== null && age >= SELF_SIGNIN_MIN_AGE
}
