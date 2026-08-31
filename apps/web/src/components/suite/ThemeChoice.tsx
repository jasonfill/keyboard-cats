import { useState } from 'react'
import { useTheme } from '../../lib/theme/ThemeProvider'
import { themeById, themesForGrade, type ThemeId } from '../../lib/themes'
import type { Learner } from '../../lib/learners'

/**
 * Set a learner's world, from a grown-up surface.
 *
 * Deliberately renders in ink and edge with no accent anywhere, even while it
 * is choosing an accent. A grown-up surface stays theme-free, and this is the
 * one control most likely to break that rule by accident.
 *
 * Appears in two places on purpose. A parent looking after a child goes to
 * Family, and a parent reading a report goes to Progress; putting it in only
 * one of those means half of them never find it.
 */
export default function ThemeChoice({
  learner,
  onChanged,
}: {
  /** Omit for the guest learner, who has no row to write to. */
  learner?: Learner | null
  onChanged?: () => void
}) {
  const { theme: activeTheme, setTheme, setThemeFor, source } = useTheme()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  // For a named learner the row is the truth; for a guest the provider's own
  // value is all there is.
  const current = learner ? themeById(learner.theme) : activeTheme
  // Advisory ordering only — every one of the ten below stays clickable.
  const ordered = themesForGrade(learner?.gradeHint ?? null)

  const choose = async (id: ThemeId) => {
    setFailed(false)
    if (!learner) {
      setTheme(id)
      return
    }
    setBusy(true)
    try {
      await setThemeFor(learner.id, id)
      onChanged?.()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {ordered.map((t) => {
          const on = t.id === current.id
          return (
            <button
              key={t.id}
              onClick={() => void choose(t.id)}
              disabled={busy}
              aria-pressed={on}
              className={`rounded-full px-3.5 py-1.5 text-[14px] font-extrabold transition-colors disabled:opacity-50 ${
                on ? 'bg-ink text-white' : 'border border-edge bg-chalk text-muted hover:bg-wash'
              }`}
            >
              {t.name}
              {/* The band is a suggestion of who it suits, never a lock. */}
              <span
                className={`ml-1.5 font-mono text-[10px] font-bold tracking-[0.08em] ${
                  on ? 'text-onink' : 'text-faint'
                }`}
              >
                {t.bands}
              </span>
            </button>
          )
        })}
      </div>

      {failed && (
        <p className="mt-2 text-[13px] font-bold text-red-700">
          That did not save. Check your connection and try again.
        </p>
      )}
      {!learner && source === 'guest' && (
        <p className="mt-2 text-[13px] font-bold text-muted">
          Saved on this device only until they have an account.
        </p>
      )}
    </div>
  )
}
