// CSV export. Everything a parent or teacher would want to keep, taken straight
// from the stored records rather than recomputed for the report.

import type { ProgressSnapshot } from './types'

function escapeCell(value: unknown): string {
  const s = String(value ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function toCsv(rows: Array<Array<unknown>>): string {
  return rows.map((r) => r.map(escapeCell).join(',')).join('\n')
}

export function buildProgressCsv(snapshot: ProgressSnapshot): string {
  const rows: Array<Array<unknown>> = [
    [
      'subject',
      'item',
      'list',
      'difficulty',
      'mastery',
      'attempts',
      'correct',
      'lapses',
      'streak',
      'due_on',
      'last_seen',
    ],
  ]
  for (const m of Object.values(snapshot.mastery)) {
    rows.push([
      m.subject,
      m.itemKey,
      m.listId ?? '',
      m.difficulty,
      m.mastery,
      m.totalAttempts,
      m.totalCorrect,
      m.lapses,
      m.correctStreak,
      m.dueOn ?? '',
      new Date(m.lastSeenAt).toISOString(),
    ])
  }
  return toCsv(rows)
}

export function exportProgressCsv(snapshot: ProgressSnapshot): void {
  const blob = new Blob([buildProgressCsv(snapshot)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `cat-academy-progress-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
