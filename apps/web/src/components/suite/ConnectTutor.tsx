import { useState } from 'react'
import { Button, Card } from '../../components/ui'
import {
  describeConnectionCode,
  redeemConnectionCode,
  type ConnectionCodePreview,
  type Learner,
} from '../../lib/learners/api'

/**
 * Letting a tutor in.
 *
 * Two steps on purpose. Typing eight characters and hoping is not consent, so
 * the code is looked up first and the family is told whose it is and what
 * accepting would allow — then they choose which of their children it applies
 * to, and confirm.
 *
 * Only learners this person owns can be offered: the database refuses anyone
 * else, and a guardian who was themselves let in cannot pass that access on.
 */
export default function ConnectTutor({
  ownedLearners,
  onConnected,
}: {
  ownedLearners: Learner[]
  onConnected: () => Promise<void>
}) {
  const [code, setCode] = useState('')
  const [preview, setPreview] = useState<ConnectionCodePreview | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(0)

  const look = async () => {
    setBusy(true)
    setError(null)
    setConnected(0)
    try {
      const found = await describeConnectionCode(code.trim())
      setPreview(found)
      if (found.valid && ownedLearners.length === 1) setSelected([ownedLearners[0].id])
    } catch {
      setError('Could not check that code.')
    } finally {
      setBusy(false)
    }
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      const n = await redeemConnectionCode(code.trim(), selected)
      await onConnected()
      setConnected(n)
      setPreview(null)
      setCode('')
      setSelected([])
    } catch {
      setError('Could not connect them. The code may have been withdrawn since.')
    } finally {
      setBusy(false)
    }
  }

  if (ownedLearners.length === 0) return null

  return (
    <Card className="mt-4">
      <h3 className="mb-1 text-lg font-extrabold text-grape">Connect a tutor or teacher</h3>
      <p className="mb-3 text-sm font-bold text-slate-500">
        If a tutor gave you a code, enter it here. You choose who they can see, and you can
        disconnect them at any time.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().slice(0, 12))
            setPreview(null)
            setConnected(0)
          }}
          placeholder="ABCD2345"
          aria-label="Tutor code"
          className="flex-1 rounded-xl border-2 border-purple-200 px-3 py-2 font-mono text-lg font-extrabold tracking-widest text-grape outline-none focus:border-grape"
        />
        <Button disabled={busy || code.trim().length < 6} onClick={look}>
          {busy ? 'Checking…' : 'Check code'}
        </Button>
      </div>

      {error && <p className="mb-2 font-bold text-rose-500">{error}</p>}

      {connected > 0 && (
        <p className="font-bold text-emerald-700">
          ✅ Connected. They can now see {connected === 1 ? 'that learner' : `${connected} learners`}.
        </p>
      )}

      {preview && !preview.valid && (
        <p className="font-bold text-rose-500">{preview.reason}</p>
      )}

      {preview?.valid && (
        <div className="rounded-2xl bg-purple-50 p-4">
          <p className="mb-1 font-extrabold text-grape">
            {preview.ownerName}
            {preview.label ? ` — ${preview.label}` : ''}
          </p>
          <p className="mb-3 text-sm font-bold text-slate-500">
            They will be able to see the progress of whoever you choose
            {preview.canManageContent ? ', and set them work' : ''}. They will not see anyone
            else in your family.
          </p>

          <fieldset className="mb-3">
            <legend className="mb-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">
              Who can they see?
            </legend>
            <div className="flex flex-wrap gap-2">
              {ownedLearners.map((l) => {
                const on = selected.includes(l.id)
                return (
                  <button
                    key={l.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setSelected((prev) =>
                        prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id],
                      )
                    }
                    className={`flex items-center gap-2 rounded-2xl px-4 py-2 font-bold ring-1 transition-colors ${
                      on
                        ? 'bg-grape text-white ring-grape'
                        : 'bg-white/85 text-slate-500 ring-purple-100 hover:bg-purple-50'
                    }`}
                  >
                    <span className="text-lg leading-none">{l.avatarEmoji}</span>
                    {l.displayName}
                    {on && <span aria-hidden>✓</span>}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-2">
            <Button disabled={busy || selected.length === 0} onClick={confirm}>
              {busy ? 'Connecting…' : `Give them access`}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPreview(null)
                setSelected([])
              }}
            >
              Never mind
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
