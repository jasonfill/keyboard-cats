import { useAuth } from '../../auth/AuthProvider'
import { useProgress } from '../../lib/progress/ProgressProvider'
import { isPro } from '../../lib/plans'

/**
 * The persistent identity affordance: who is signed in, whether progress is
 * syncing, and a one-tap route into the account screen.
 */
export default function AccountChip({ onOpen }: { onOpen: () => void }) {
  const { status, profile, configured } = useAuth()
  const { mode, sync } = useProgress()

  const label =
    status === 'signed-in' ? (profile?.displayName ?? 'Account') : configured ? 'Sign in' : 'Guest'
  const emoji = status === 'signed-in' ? (profile?.avatarEmoji ?? '🐱') : '👋'

  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 rounded-full border-2 border-edge bg-white/80 py-1.5 pl-2 pr-3 text-sm font-extrabold text-ink shadow-sm transition-colors hover:bg-white"
    >
      <span className="text-lg leading-none">{emoji}</span>
      <span className="max-w-[9rem] truncate">{label}</span>
      {isPro(profile?.plan) && (
        <span className="rounded-full bg-sun px-2 py-0.5 text-[10px] uppercase tracking-wide text-white">
          Pro
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
