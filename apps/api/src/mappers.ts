// Row shapes in, wire shapes out. snake_case never leaves the API.

import type { AuthKind, Guardian, GuardianRole, Learner } from '@whizzo/shared'

/* eslint-disable @typescript-eslint/no-explicit-any */

function epoch(value: any): number {
  if (!value) return 0
  return value instanceof Date ? value.getTime() : Date.parse(String(value)) || 0
}

export function toLearner(row: any): Learner {
  return {
    id: row.id,
    ownerId: row.owner_id,
    displayName: row.display_name,
    avatarEmoji: row.avatar_emoji ?? '🐱',
    gradeHint: row.grade_hint ?? null,
    birthYear: row.birth_year ?? null,
    authKind: (row.auth_kind ?? 'none') as AuthKind,
    authUserId: row.auth_user_id ?? null,
    createdAt: epoch(row.created_at),
    theme: row.theme ?? null,
    covered: Boolean(row.covered),
  }
}

export function toGuardian(row: any): Guardian {
  return {
    guardianId: row.guardian_id,
    learnerId: row.learner_id,
    role: (row.role ?? 'parent') as GuardianRole,
    canManageContent: Boolean(row.can_manage_content),
    createdAt: epoch(row.created_at),
    displayName: row.display_name ?? null,
  }
}
