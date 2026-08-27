// Learners, guardians, and pairing — over the API.
//
// The rules these calls run into (owner-only invites, the 13+ gate, read-only
// guardians) are enforced in the database and surfaced by the API. Nothing here
// re-implements them; this file is transport.

import type {
  GuardianRole,
  GuardiansResponse,
  InvitePurpose,
  InviteResponse,
  LearnerResponse,
  LearnersResponse,
  NewLearner,
  RedeemResponse,
} from '@whizzo/shared'
import { api } from '../api/client'

export type {
  AuthKind,
  Guardian,
  GuardianRole,
  InvitePurpose,
  Learner,
  NewLearner,
} from '@whizzo/shared'
export { ageOf, canUseSelfSignIn, SELF_SIGNIN_MIN_AGE } from '@whizzo/shared'

/** Every learner this session can see: owned, guarded, or itself. */
export async function listLearners(signal?: AbortSignal) {
  const { learners } = await api.get<LearnersResponse>('/learners', signal)
  return learners
}

export async function createLearner(learner: NewLearner) {
  const { learner: created } = await api.post<LearnerResponse>('/learners', learner)
  return created
}

/**
 * Cosmetics only. Ownership, sign-in mode and birth year are owner-only and are
 * rejected by the database for anyone else, so they are not exposed here.
 */
export async function updateLearner(
  id: string,
  patch: { displayName?: string; avatarEmoji?: string; gradeHint?: number | null },
) {
  const { learner } = await api.patch<LearnerResponse>(`/learners/${id}`, patch)
  return learner
}

export async function deleteLearner(id: string): Promise<void> {
  await api.del<void>(`/learners/${id}`)
}

/**
 * Mint a pairing code. Owner-only, and short-lived: handing another adult
 * access to a child's record should not be doable with a code found in a chat
 * history six months later.
 */
export async function mintInvite(
  learnerId: string,
  opts: { role?: GuardianRole; purpose?: InvitePurpose; ttlHours?: number } = {},
) {
  const { invite } = await api.post<InviteResponse>(`/learners/${learnerId}/invites`, {
    role: opts.role ?? 'parent',
    purpose: opts.purpose ?? 'guardian',
    ttlHours: opts.ttlHours ?? 24,
  })
  return invite
}

/** Redeem a pairing code. Returns the learner it linked. */
export async function redeemInvite(code: string): Promise<string> {
  const { learnerId } = await api.post<RedeemResponse>('/invites/redeem', {
    code: code.trim().toUpperCase(),
  })
  return learnerId
}

export async function listGuardians(learnerId: string) {
  const { guardians } = await api.get<GuardiansResponse>(`/learners/${learnerId}/guardians`)
  return guardians
}

/** Either side may cut the link: the owner revokes, a guardian leaves. */
export async function revokeGuardian(learnerId: string, guardianId: string): Promise<void> {
  await api.del<void>(`/learners/${learnerId}/guardians/${guardianId}`)
}

export async function setGuardianContentAccess(
  learnerId: string,
  guardianId: string,
  canManageContent: boolean,
): Promise<void> {
  await api.patch<void>(`/learners/${learnerId}/guardians/${guardianId}`, { canManageContent })
}

/** Turn on (or reset) a child's own code + PIN sign-in. Owner-only. */
export async function setChildLogin(learnerId: string, pin: string) {
  return api.post<{ loginCode: string; learnerId: string }>(
    `/learners/${learnerId}/child-login`,
    { pin },
  )
}

export async function removeChildLogin(learnerId: string): Promise<void> {
  await api.del<void>(`/learners/${learnerId}/child-login`)
}
