import { useLearners } from '../../lib/learners/LearnerProvider'

/**
 * The bridge from Family to Progress.
 *
 * Family is per-child oversight across everyone; Progress is the deep history
 * of one child. This is the control that says which one, so the parent screen
 * can be single-child without hiding the others.
 *
 * Deliberately theme-free, like everything else on a grown-up surface. The
 * avatar tile is tinted from a fixed neutral, not the child's accent: a
 * progress report must never carry a child's theme.
 */
export default function ChildSwitcher() {
  const { learners, active, select, status } = useLearners()

  // A choice of one is not a choice. With a single learner this is just a label.
  if (status !== 'ready' || !active || learners.length <= 1) return null

  return (
    <div className="mb-5 flex flex-wrap gap-1 rounded-[18px] bg-tray p-1.5" role="tablist">
      {learners.map((l) => {
        const on = l.id === active.id
        return (
          <button
            key={l.id}
            role="tab"
            aria-selected={on}
            onClick={() => select(l.id)}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
              on ? 'bg-chalk shadow-[0_1px_3px_rgba(28,26,22,0.12)]' : 'hover:bg-chalk/50'
            }`}
          >
            <span
              className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-base ${
                on ? 'bg-wash' : 'bg-chalk'
              }`}
            >
              {l.avatarEmoji}
            </span>
            <span>
              <span
                className={`block max-w-[10rem] truncate text-[15px] font-extrabold ${
                  on ? 'text-ink' : 'text-muted'
                }`}
              >
                {l.displayName}
              </span>
              <span className="block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-faint">
                {l.gradeHint ? `Grade ${l.gradeHint}` : 'No grade set'}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
