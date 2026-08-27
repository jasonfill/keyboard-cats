// The wire contract.
//
// One definition of every request and response shape, imported by the API that
// produces them and the web app that consumes them. If a route and its caller
// disagree, that is now a type error at build time rather than a surprise in
// production.

import type { Guardian, InvitePurpose, Learner } from './learners.js'
import type { CustomWordList, ProgressSnapshot, QuizDeck } from './progress.js'

export interface ApiErrorBody {
  code: string
  message: string
}

export interface ErrorResponse {
  error: ApiErrorBody
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  uptime?: number
  detail?: string
}

export interface LearnersResponse {
  learners: Learner[]
}

export interface LearnerResponse {
  learner: Learner
}

export interface GuardiansResponse {
  guardians: Guardian[]
}

export interface GuardianResponse {
  guardian: Guardian
}

export interface InviteResponse {
  invite: {
    code: string
    /** ISO timestamp, or null if the row could not be read back. */
    expiresAt: string | null
    purpose: InvitePurpose
  }
}

export interface RedeemResponse {
  learnerId: string
}

export interface SnapshotResponse {
  snapshot: ProgressSnapshot
}

export interface WordListsResponse {
  customLists: CustomWordList[]
}

export interface DecksResponse {
  decks: QuizDeck[]
}

/**
 * What the API hands back after exchanging a child's code and PIN for a
 * session. The tokens go straight into the Supabase client in the browser,
 * which then behaves exactly as it does after any other sign-in.
 */
export interface ChildSessionResponse {
  learnerId: string
  displayName: string
  session: {
    accessToken: string
    refreshToken: string
    expiresIn: number
  }
}
