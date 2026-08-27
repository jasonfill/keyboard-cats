import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { clearSignupIntent, readSignupIntent } from '../../auth/signupIntent'
import CatMascot from '../../components/CatMascot'
import ScreenHeader from '../../components/suite/ScreenHeader'
import { Button, Card } from '../../components/ui'
import { ApiError } from '../../lib/api/client'
import { useLearners } from '../../lib/learners/LearnerProvider'
import {
  ageOf,
  canUseSelfSignIn,
  listGuardians,
  mintInvite,
  redeemInvite,
  removeChildLogin,
  revokeGuardian,
  setChildLogin,
  setGuardianContentAccess,
  SELF_SIGNIN_MIN_AGE,
  type Guardian,
  type Learner,
} from '../../lib/learners/api'
import type { Navigate } from '../../routes'

const AVATARS = ['🐱', '🐯', '🦊', '🐰', '🐨', '🐼', '🦁', '🐸', '🐧', '🦄']

function messageOf(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return 'Something went wrong'
}

export default function FamilyScreen({ navigate }: { navigate: Navigate }) {
  const { user, profile } = useAuth()
  const { learners, active, select, create, refresh, status } = useLearners()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Read once: it is a hand-off from the sign-up screen, not live state.
  const [intent] = useState(() => readSignupIntent())

  if (status === 'unavailable') {
    return (
      <div className="mx-auto w-full max-w-2xl">
        <ScreenHeader title="Family" onBack={() => navigate({ name: 'home' })} />
        <Card>
          <p className="font-bold text-slate-500">
            Sign in to add learners and share progress with another grown-up.
          </p>
        </Card>
      </div>
    )
  }

  // First run. A grown-up who has just signed up owns nobody, and the rest of
  // the app is the *child's* experience — so without this they land in a
  // student dashboard with no idea they were supposed to add someone.
  if (status === 'ready' && learners.length === 0) {
    // What they told the sign-up screen. A 13+ learner who already said "I am
    // the one learning" and gave their birth year should not be asked again.
    const selfLearner = intent?.role === 'learner'

    const finish = async (draft: {
      displayName: string
      avatarEmoji?: string
      birthYear?: number | null
    }) => {
      setError(null)
      try {
        await create(draft)
        clearSignupIntent()
        navigate({ name: 'home' })
      } catch (err) {
        setError(messageOf(err))
      }
    }

    return (
      <div className="mx-auto w-full max-w-lg py-6">
        <div className="mb-5 flex flex-col items-center">
          <CatMascot mood="excited" size={110} className="animate-floaty" />
          <h1 className="mt-1 text-center text-3xl font-extrabold text-grape">
            {selfLearner ? 'One last thing' : 'Who is learning?'}
          </h1>
          <p className="mt-1 text-center font-bold text-slate-500">
            {selfLearner
              ? 'Set up your learner profile — that is where your progress lives.'
              : 'This account is yours, the grown-up. Add the people who will actually be practising, and their progress stays with them.'}
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
            {error}
          </p>
        )}

        {selfLearner ? (
          <Card>
            <h3 className="mb-1 text-lg font-extrabold text-grape">
              {profile?.displayName?.trim() || 'You'}
            </h3>
            <p className="mb-4 text-sm font-bold text-slate-500">
              We already have your name and age from sign-up. Tap once and you are in.
            </p>
            <Button
              className="w-full"
              onClick={() =>
                finish({
                  displayName: profile?.displayName?.trim() || 'Me',
                  avatarEmoji: profile?.avatarEmoji ?? '🐱',
                  birthYear: intent?.birthYear ?? null,
                })
              }
            >
              🐱 Start learning
            </Button>
          </Card>
        ) : (
          <>
            <AddLearner startOpen title="Add your first learner" onAdd={finish} />

            <Card className="mt-4">
              <h3 className="mb-1 text-lg font-extrabold text-grape">Actually, it is me</h3>
              <p className="mb-3 text-sm font-bold text-slate-500">
                Practising yourself is fine — you just need a learner too, so there is
                somewhere for the progress to live.
              </p>
              <Button
                variant="ghost"
                onClick={() =>
                  finish({
                    displayName: profile?.displayName?.trim() || 'Me',
                    avatarEmoji: profile?.avatarEmoji ?? '🐱',
                  })
                }
              >
                🐱 I am the one learning
              </Button>
            </Card>
          </>
        )}

        <JoinWithCode
          onJoined={async () => {
            setError(null)
            await refresh()
          }}
          onError={setError}
        />

        <button
          onClick={() => navigate({ name: 'home' })}
          className="mt-5 w-full text-sm font-bold text-slate-400 underline hover:text-grape"
        >
          Skip for now
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <ScreenHeader
        title="Family"
        subtitle="Everyone learning here, and the grown-ups who can see them."
        onBack={() => navigate({ name: 'home' })}
      />

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p>
      )}

      <div className="flex flex-col gap-3">
        {learners.map((learner) => (
          <LearnerRow
            key={learner.id}
            learner={learner}
            isActive={learner.id === active?.id}
            isOwner={learner.ownerId === user?.id}
            expanded={expanded === learner.id}
            onToggle={() => setExpanded((v) => (v === learner.id ? null : learner.id))}
            onSelect={() => select(learner.id)}
            onError={setError}
            onChanged={refresh}
          />
        ))}
      </div>

      <AddLearner
        onAdd={async (draft) => {
          setError(null)
          try {
            await create(draft)
          } catch (err) {
            setError(messageOf(err))
          }
        }}
      />

      <JoinWithCode
        onJoined={async () => {
          setError(null)
          await refresh()
        }}
        onError={setError}
      />
    </div>
  )
}

function LearnerRow({
  learner,
  isActive,
  isOwner,
  expanded,
  onToggle,
  onSelect,
  onError,
  onChanged,
}: {
  learner: Learner
  isActive: boolean
  isOwner: boolean
  expanded: boolean
  onToggle: () => void
  onSelect: () => void
  onError: (message: string | null) => void
  onChanged: () => Promise<void>
}) {
  const age = ageOf(learner)

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-3xl leading-none">{learner.avatarEmoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-extrabold text-grape">{learner.displayName}</p>
          <p className="text-sm font-bold text-slate-400">
            {age !== null ? `${age} years old` : 'Age not set'}
            {' · '}
            <SignInLabel learner={learner} />
            {!isOwner && ' · shared with you'}
          </p>
        </div>
        {isActive ? (
          <span className="rounded-full bg-lime px-3 py-1 text-xs font-extrabold uppercase tracking-wide text-white">
            Playing
          </span>
        ) : (
          <Button variant="ghost" onClick={onSelect}>
            Switch to
          </Button>
        )}
        {isOwner && (
          <Button variant="ghost" onClick={onToggle}>
            {expanded ? 'Done' : 'Manage'}
          </Button>
        )}
      </div>

      {expanded && isOwner && (
        <ManagePanel learner={learner} onError={onError} onChanged={onChanged} />
      )}
    </Card>
  )
}

function SignInLabel({ learner }: { learner: Learner }) {
  if (learner.authKind === 'self') return <>signs in with their own account</>
  if (learner.authKind === 'provisioned') return <>signs in with a code</>
  return <>plays on your device</>
}

function ManagePanel({
  learner,
  onError,
  onChanged,
}: {
  learner: Learner
  onError: (message: string | null) => void
  onChanged: () => Promise<void>
}) {
  const [guardians, setGuardians] = useState<Guardian[]>([])
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [selfCode, setSelfCode] = useState<string | null>(null)
  const [loginCode, setLoginCode] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)

  const loadGuardians = useCallback(async () => {
    try {
      setGuardians(await listGuardians(learner.id))
    } catch (err) {
      onError(messageOf(err))
    }
  }, [learner.id, onError])

  useEffect(() => {
    void loadGuardians()
  }, [loadGuardians])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    onError(null)
    try {
      await fn()
    } catch (err) {
      onError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const eligibleForSelf = canUseSelfSignIn(learner)

  return (
    <div className="mt-5 flex flex-col gap-5 border-t-2 border-purple-100 pt-5">
      <section>
        <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-400">
          Grown-ups who can see {learner.displayName}
        </h3>
        {guardians.length === 0 ? (
          <p className="text-sm font-bold text-slate-400">Just you so far.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {guardians.map((g) => (
              <li
                key={g.guardianId}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-purple-50 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-grape">
                  {g.displayName ?? 'Another grown-up'}
                </span>
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <input
                    type="checkbox"
                    checked={g.canManageContent}
                    disabled={busy}
                    onChange={(e) =>
                      run(async () => {
                        await setGuardianContentAccess(learner.id, g.guardianId, e.target.checked)
                        await loadGuardians()
                      })
                    }
                  />
                  Can add decks
                </label>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await revokeGuardian(learner.id, g.guardianId)
                      await loadGuardians()
                    })
                  }
                  className="text-xs font-extrabold text-red-500 underline disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <Button
          variant="ghost"
          className="mt-3"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const invite = await mintInvite(learner.id)
              setInviteCode(invite.code)
            })
          }
        >
          ➕ Invite another grown-up
        </Button>
        {inviteCode && (
          <CodeBanner
            code={inviteCode}
            hint="Share this with the other grown-up. It works once, and expires in 24 hours."
          />
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-400">
          How {learner.displayName} signs in
        </h3>

        {learner.authKind === 'self' ? (
          <p className="text-sm font-bold text-slate-500">
            {learner.displayName} uses their own account. To change that, they can sign out and you
            can set up a code instead.
          </p>
        ) : (
          <>
            <p className="mb-3 text-sm font-bold text-slate-500">
              {learner.authKind === 'provisioned'
                ? 'They have their own code. Setting a new PIN replaces it.'
                : 'Give them a code and a PIN so they can play on their own tablet. We never ask a child for an email address.'}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                inputMode="numeric"
                placeholder="4-digit PIN"
                className="w-32 rounded-xl border-2 border-purple-200 px-3 py-2 text-sm font-extrabold text-grape outline-none focus:border-grape"
              />
              <Button
                disabled={busy || pin.length < 4}
                onClick={() =>
                  run(async () => {
                    const result = await setChildLogin(learner.id, pin)
                    setLoginCode(result.loginCode)
                    setPin('')
                    await onChanged()
                  })
                }
              >
                {learner.authKind === 'provisioned' ? 'Reset their PIN' : 'Set up their sign-in'}
              </Button>
              {learner.authKind === 'provisioned' && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await removeChildLogin(learner.id)
                      setLoginCode(null)
                      await onChanged()
                    })
                  }
                  className="text-xs font-extrabold text-red-500 underline disabled:opacity-50"
                >
                  Turn it off
                </button>
              )}
            </div>
            {loginCode && (
              <CodeBanner
                code={loginCode}
                hint={`${learner.displayName} signs in with this code and the PIN you just chose. Write it down — we cannot show it again.`}
              />
            )}
          </>
        )}
      </section>

      {learner.authKind !== 'self' && (
        <section>
          <h3 className="mb-2 text-sm font-extrabold uppercase tracking-wide text-slate-400">
            Their own Google account
          </h3>
          {eligibleForSelf ? (
            <>
              <p className="mb-3 text-sm font-bold text-slate-500">
                {learner.displayName} is old enough to link their own account. Give them this code
                while they are signed in with it.
              </p>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const invite = await mintInvite(learner.id, { purpose: 'self_login' })
                    setSelfCode(invite.code)
                  })
                }
              >
                Create a linking code
              </Button>
              {selfCode && (
                <CodeBanner code={selfCode} hint="Expires in 24 hours and works once." />
              )}
            </>
          ) : (
            <p className="text-sm font-bold text-slate-400">
              Available from age {SELF_SIGNIN_MIN_AGE}.{' '}
              {learner.birthYear
                ? 'Until then, a code and PIN keeps their account free of personal details.'
                : 'Add their birth year first.'}
            </p>
          )}
        </section>
      )}
    </div>
  )
}

function CodeBanner({ code, hint }: { code: string; hint: string }) {
  return (
    <div className="mt-3 rounded-2xl border-2 border-dashed border-purple-300 bg-purple-50 p-4 text-center">
      <p className="select-all font-mono text-2xl font-extrabold tracking-[0.3em] text-grape">
        {code}
      </p>
      <p className="mt-2 text-xs font-bold text-slate-500">{hint}</p>
    </div>
  )
}

function AddLearner({
  onAdd,
  startOpen = false,
  title = 'Add a learner',
}: {
  onAdd: (draft: { displayName: string; avatarEmoji: string; birthYear: number | null }) => Promise<void>
  startOpen?: boolean
  title?: string
}) {
  const [open, setOpen] = useState(startOpen)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState(AVATARS[0]!)
  const [birthYear, setBirthYear] = useState('')
  const [busy, setBusy] = useState(false)

  const thisYear = new Date().getFullYear()

  if (!open) {
    return (
      <Button className="mt-4 w-full" variant="ghost" onClick={() => setOpen(true)}>
        ➕ Add a learner
      </Button>
    )
  }

  return (
    <Card className="mt-4">
      <h3 className="mb-3 text-lg font-extrabold text-grape">{title}</h3>
      <div className="flex flex-col gap-3">
        <label className="text-sm font-extrabold text-slate-500">
          Their name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="Ada"
            className="mt-1 w-full rounded-xl border-2 border-purple-200 px-3 py-2 font-extrabold text-grape outline-none focus:border-grape"
          />
        </label>

        <div>
          <p className="text-sm font-extrabold text-slate-500">Pick a cat</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                className={`rounded-xl border-2 px-2 py-1 text-xl transition-colors ${
                  avatar === a ? 'border-grape bg-purple-50' : 'border-transparent hover:bg-purple-50'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <label className="text-sm font-extrabold text-slate-500">
          Birth year
          <input
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, '').slice(0, 4))}
            inputMode="numeric"
            placeholder={String(thisYear - 8)}
            className="mt-1 w-full rounded-xl border-2 border-purple-200 px-3 py-2 font-extrabold text-grape outline-none focus:border-grape"
          />
          <span className="mt-1 block text-xs font-bold text-slate-400">
            Used only to decide whether they are old enough ({SELF_SIGNIN_MIN_AGE}+) to link their
            own Google account.
          </span>
        </label>

        <div className="flex gap-2">
          <Button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true)
              const year = Number(birthYear)
              await onAdd({
                displayName: name.trim(),
                avatarEmoji: avatar,
                birthYear: year >= 1900 && year <= thisYear ? year : null,
              })
              setBusy(false)
              setName('')
              setBirthYear('')
              setOpen(false)
            }}
          >
            {busy ? 'Adding…' : 'Add them'}
          </Button>
          {!startOpen && (
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function JoinWithCode({
  onJoined,
  onError,
}: {
  onJoined: () => Promise<void>
  onError: (message: string | null) => void
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  return (
    <Card className="mt-4">
      <h3 className="mb-1 text-lg font-extrabold text-grape">Have a code?</h3>
      <p className="mb-3 text-sm font-bold text-slate-500">
        If another grown-up shared a learner with you, enter their code here.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase().slice(0, 12))
            setDone(false)
          }}
          placeholder="ABCD2345"
          className="flex-1 rounded-xl border-2 border-purple-200 px-3 py-2 font-mono text-lg font-extrabold tracking-widest text-grape outline-none focus:border-grape"
        />
        <Button
          disabled={busy || code.trim().length < 6}
          onClick={async () => {
            setBusy(true)
            onError(null)
            try {
              await redeemInvite(code)
              await onJoined()
              setCode('')
              setDone(true)
            } catch (err) {
              onError(messageOf(err))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Checking…' : 'Join'}
        </Button>
      </div>
      {done && (
        <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
          🐾 Added! You can see their progress now.
        </p>
      )}
    </Card>
  )
}
