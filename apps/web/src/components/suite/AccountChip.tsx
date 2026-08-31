import { useAuth } from '../../auth/AuthProvider'
import { useProgress } from '../../lib/progress/ProgressProvider'
import { useLearners } from '../../lib/learners'

/**
 * The persistent identity affordance: who is signed in, whether progress is
 * syncing, and a one-tap route into the account screen.
 */
export default function AccountChip({ onOpen }: { onOpen: () => void }) {
  const { status, profile, configured, user } = useAuth()
  const { mode, sync } = useProgress()
  const { learners } = useLearners()
  // Owned, not merely visible: `learners` includes guarded children, so a tutor
  // would otherwise wear a badge counting somebody else's paid-for students.
  const covering = learners.filter((l) => l.covered && l.ownerId === user?.id).length

  const label =
    status === 'signed-in' ? (profile?.displayName ?? 'Account') : configured ? 'Sign in' : 'Guest'
  const emoji = status === 'signed-in' ? (profile?.avatarEmoji ?? '🙂') : '👋'

  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 rounded-full border-2 border-edge bg-white/80 py-1.5 pl-2 pr-3 text-sm font-extrabold text-ink shadow-sm transition-colors hover:bg-white"
    >
      <span className="text-lg leading-none">{emoji}</span>
      <span className="max-w-[9rem] truncate">{label}</span>
      {/* Not "you are Pro" — there is no such thing. The badge says how many
          children this person is covering, which is the only thing that was
          ever bought. A tutor sees no badge and loses nothing: their covered
          learners are somebody else's. */}
      {covering > 0 && (
        <span
          // A bare number beside a name reads as an unread count, and `title`
          // is a tooltip nobody on a touchscreen will ever see.
          role="img"
          aria-label={`Covering ${covering} ${covering === 1 ? 'child' : 'children'}`}
          title={`Covering ${covering} ${covering === 1 ? 'child' : 'children'}`}
          className="rounded-full bg-sun px-2 py-0.5 text-[10px] uppercase tracking-wide text-white"
        >
          ✓{covering}
        </span>
      )}
      {mode === 'cloud' && sync === 'idle' && (
        <span title="Progress is syncing to your account" className="text-xs">
          ☁️
        </span>
      )}
      {sync === 'merging' && <span className="text-xs">🔄</span>}
    </button>
  )
}
