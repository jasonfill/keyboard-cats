import { useState, type FormEvent } from 'react'
import CatMascot from '../components/CatMascot'
import { Button, Card } from '../components/ui'
import { hasLocalProgress } from '../lib/progress/localRepo'
import { useAuth } from './AuthProvider'
import {
  ageFromBirthYear,
  MIN_SIGNUP_AGE,
  rememberRefusal,
  saveSignupIntent,
  wasRefused,
  type SignupRole,
} from './signupIntent'

type Tab = 'signin' | 'signup'

interface Props {
  onDone: () => void
  onGuest: () => void
}

export default function AuthScreen({ onDone, onGuest }: Props) {
  const {
    configured,
    signIn,
    signUp,
    signInWithGoogle,
    signInWithCode,
    sendPasswordReset,
    error,
    clearError,
  } = useAuth()

  const [tab, setTab] = useState<Tab>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // A child signing in on their own tablet takes a different door: a code and a
  // PIN their grown-up set up, and no email address anywhere.
  const [kidMode, setKidMode] = useState(false)
  // Signup asks who is at the keyboard before it asks for anything else: the
  // answer decides whether we are allowed to collect an email at all.
  const [role, setRole] = useState<SignupRole | null>(null)
  const [birthYear, setBirthYear] = useState<number | null>(null)
  const [yearInput, setYearInput] = useState('')
  const [tooYoung, setTooYoung] = useState(false)
  const refused = wasRefused()
  const [loginCode, setLoginCode] = useState('')
  const [pin, setPin] = useState('')

  const guestProgress = hasLocalProgress()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    clearError()
    setNotice(null)
    setBusy(true)
    try {
      if (tab === 'signup') {
        const { needsEmailConfirm } = await signUp(email, password, displayName)
        if (needsEmailConfirm) {
          setNotice('Almost there! Check your email for a confirmation link.')
        } else {
          onDone()
        }
      } else {
        await signIn(email, password)
        onDone()
      }
    } catch {
      // The provider already turned this into a friendly message.
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setBusy(true)
    try {
      await signInWithGoogle()
      // The browser navigates away to Google from here.
    } catch {
      setBusy(false)
    }
  }

  const kidSignIn = async (e: FormEvent) => {
    e.preventDefault()
    if (busy) return
    clearError()
    setBusy(true)
    try {
      await signInWithCode(loginCode, pin)
      onDone()
    } catch {
      // The provider already turned this into a friendly message.
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!email.trim()) {
      setNotice('Type your email above first, then tap this again.')
      return
    }
    setBusy(true)
    try {
      await sendPasswordReset(email)
      setNotice('Password reset link sent. Check your inbox.')
    } catch {
      /* surfaced via error */
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <div className="mx-auto w-full max-w-md py-10">
        <Card>
          <h1 className="mb-2 text-3xl font-extrabold text-grape">Accounts are off</h1>
          <p className="mb-4 font-bold text-slate-500">
            This build has no database connected, so everything saves right here in your browser.
            Progress still works — it just will not follow you to another device.
          </p>
          <p className="mb-5 text-sm font-bold text-slate-400">
            Setting one up takes about ten minutes: see <code>supabase/README.md</code>.
          </p>
          <Button className="w-full" onClick={onGuest}>
            Keep playing
          </Button>
        </Card>
      </div>
    )
  }

  if (kidMode) {
    return (
      <div className="mx-auto w-full max-w-md py-6">
        <div className="mb-4 flex flex-col items-center">
          <CatMascot mood="excited" size={110} className="animate-floaty" />
          <h1 className="mt-1 text-4xl font-extrabold text-grape">Hi there!</h1>
          <p className="text-center font-bold text-slate-500">
            Type the code and secret number your grown-up gave you.
          </p>
        </div>

        <Card>
          <form onSubmit={kidSignIn} className="flex flex-col gap-4">
            <label className="text-sm font-extrabold text-slate-500">
              Your code
              <input
                value={loginCode}
                onChange={(e) => setLoginCode(e.target.value.toUpperCase().slice(0, 12))}
                autoComplete="off"
                autoCapitalize="characters"
                placeholder="ABCD2345"
                className="mt-1 w-full rounded-2xl border-2 border-purple-200 px-4 py-3 text-center font-mono text-2xl font-extrabold tracking-[0.25em] text-grape outline-none focus:border-grape"
              />
            </label>
            <label className="text-sm font-extrabold text-slate-500">
              Secret number
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                inputMode="numeric"
                type="password"
                autoComplete="off"
                placeholder="••••"
                className="mt-1 w-full rounded-2xl border-2 border-purple-200 px-4 py-3 text-center text-2xl font-extrabold tracking-[0.4em] text-grape outline-none focus:border-grape"
              />
            </label>

            {error && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p>
            )}

            <Button type="submit" disabled={busy || loginCode.length < 6 || pin.length < 4}>
              {busy ? 'One moment…' : '🐾 Let me in!'}
            </Button>
          </form>

          <button
            onClick={() => {
              setKidMode(false)
              clearError()
            }}
            className="mt-4 w-full text-sm font-bold text-slate-400 underline hover:text-grape"
          >
            I am a grown-up
          </button>
        </Card>
      </div>
    )
  }

  // Someone this browser already told us was under 13. Sticky on purpose: an
  // age screen you can clear by reloading is not an age screen.
  if (tab === 'signup' && (refused || tooYoung)) {
    return (
      <div className="mx-auto w-full max-w-md py-6">
        <div className="mb-4 flex flex-col items-center">
          <CatMascot mood="happy" size={104} className="animate-floaty" />
          <h1 className="mt-1 text-center text-3xl font-extrabold text-grape">
            Let's get a grown-up
          </h1>
          <p className="mt-1 text-center font-bold text-slate-500">
            You need a grown-up to make the account. Then they give you a code, and the
            code is all you need — no email, nothing to remember.
          </p>
        </div>

        <Card>
          <p className="mb-4 text-sm font-bold text-slate-500">
            Already have a code from your grown-up?
          </p>
          <Button
            className="w-full"
            onClick={() => {
              setKidMode(true)
              clearError()
            }}
          >
            🐾 Sign in with a code
          </Button>
          <button
            onClick={onGuest}
            className="mt-4 w-full text-sm font-bold text-slate-400 underline hover:text-grape"
          >
            Keep playing without an account
          </button>
        </Card>
      </div>
    )
  }

  // The neutral age screen. Asked as a birth year rather than "are you 13?"
  // precisely because the latter tells you which answer unlocks the door.
  if (tab === 'signup' && role === 'learner' && birthYear === null) {
    return (
      <div className="mx-auto w-full max-w-md py-6">
        <div className="mb-4 flex flex-col items-center">
          <CatMascot mood="happy" size={104} className="animate-floaty" />
          <h1 className="mt-1 text-3xl font-extrabold text-grape">What year were you born?</h1>
        </div>

        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const year = Number(yearInput)
              const thisYear = new Date().getFullYear()
              if (!year || year < 1900 || year > thisYear) {
                setNotice('That does not look like a year.')
                return
              }
              setNotice(null)
              if (ageFromBirthYear(year) < MIN_SIGNUP_AGE) {
                rememberRefusal()
                setTooYoung(true)
                return
              }
              setBirthYear(year)
              saveSignupIntent({ role: 'learner', birthYear: year })
            }}
            className="flex flex-col gap-4"
          >
            <input
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
              inputMode="numeric"
              autoFocus
              placeholder="2011"
              className="w-full rounded-2xl border-2 border-purple-200 px-4 py-3 text-center text-2xl font-extrabold tracking-widest text-grape outline-none focus:border-grape"
            />
            {notice && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
                {notice}
              </p>
            )}
            <Button type="submit" disabled={yearInput.length !== 4}>
              Next
            </Button>
          </form>

          <button
            onClick={() => {
              setRole(null)
              setYearInput('')
              setNotice(null)
            }}
            className="mt-4 w-full text-sm font-bold text-slate-400 underline hover:text-grape"
          >
            ← Back
          </button>
        </Card>
      </div>
    )
  }

  // Who is at the keyboard? Asked before anything else, because the answer
  // decides whether we may collect an email address at all.
  if (tab === 'signup' && role === null) {
    return (
      <div className="mx-auto w-full max-w-md py-6">
        <div className="mb-4 flex flex-col items-center">
          <CatMascot mood="happy" size={104} className="animate-floaty" />
          <h1 className="mt-1 text-4xl font-extrabold text-grape">Cat Academy</h1>
          <p className="text-center font-bold text-slate-500">Who is setting this up?</p>
        </div>

        <Card>
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={() => {
                setRole('guardian')
                saveSignupIntent({ role: 'guardian' })
              }}
            >
              👋 I am a parent or teacher
            </Button>
            <p className="-mt-1 px-1 text-xs font-bold text-slate-400">
              You make one account and add each child to it. Recommended.
            </p>

            <Button variant="ghost" className="w-full" onClick={() => setRole('learner')}>
              🎒 I am the one learning
            </Button>
          </div>

          <button
            onClick={() => {
              setTab('signin')
              clearError()
            }}
            className="mt-5 w-full text-sm font-bold text-slate-400 underline hover:text-grape"
          >
            I already have an account
          </button>
          <button
            onClick={() => {
              setKidMode(true)
              clearError()
            }}
            className="mt-2 w-full text-sm font-bold text-slate-400 underline hover:text-grape"
          >
            🐾 Kids: sign in with a code
          </button>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-md py-6">
      <div className="mb-4 flex flex-col items-center">
        <CatMascot mood="happy" size={100} className="animate-floaty" />
        <h1 className="mt-1 text-4xl font-extrabold text-grape">Cat Academy</h1>
        <p className="text-center font-bold text-slate-500">
          {tab === 'signup'
            ? role === 'learner'
              ? 'Your own account. Progress follows you to any device.'
              : 'This is the grown-up account. You will add the kids next.'
            : 'Welcome back.'}
        </p>
      </div>

      <Card>
        <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-purple-50 p-1">
          {(['signup', 'signin'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t)
                clearError()
                setNotice(null)
              }}
              className={`rounded-xl py-2 text-sm font-extrabold transition-colors ${
                tab === t ? 'bg-white text-grape shadow' : 'text-slate-400 hover:text-grape'
              }`}
            >
              {t === 'signup' ? 'Create account' : 'Sign in'}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={google}
          disabled={busy}
          className="mb-4 flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-slate-200 bg-white py-3 text-base font-extrabold text-slate-700 transition-colors hover:border-purple-300 hover:bg-purple-50 disabled:opacity-50"
        >
          <GoogleMark />
          Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">or</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          {tab === 'signup' && (
            <Field
              label="Your name"
              value={displayName}
              onChange={setDisplayName}
              placeholder="Alex"
              autoComplete="name"
              maxLength={24}
            />
          )}
          <Field
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
          <Field
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="At least 6 characters"
            autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={6}
          />

          {error && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">{error}</p>
          )}
          {notice && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">
              {notice}
            </p>
          )}

          <Button type="submit" disabled={busy} className="mt-1 w-full">
            {busy ? 'One moment…' : tab === 'signup' ? '🎉 Create my account' : '👋 Sign in'}
          </Button>
        </form>

        <button
          onClick={() => {
            setKidMode(true)
            clearError()
            setNotice(null)
          }}
          className="mt-4 w-full rounded-2xl border-2 border-purple-200 py-2.5 text-sm font-extrabold text-grape transition-colors hover:bg-purple-50"
        >
          🐾 Kids: sign in with a code
        </button>

        {tab === 'signin' && (
          <button
            onClick={reset}
            className="mt-3 w-full text-sm font-bold text-slate-400 underline hover:text-grape"
          >
            Forgot your password?
          </button>
        )}

        {guestProgress && tab === 'signup' && (
          <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700">
            🐾 We found progress saved on this device. It will be added to your new account
            automatically.
          </p>
        )}
      </Card>

      <button
        onClick={onGuest}
        className="mt-5 w-full text-center text-sm font-bold text-slate-400 underline hover:text-grape"
      >
        Keep playing without an account
      </button>

      <p className="mt-3 text-center text-xs font-bold text-slate-400">
        We only store what is needed to track learning progress. No ads, ever.
      </p>
    </div>
  )
}

interface FieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  autoComplete?: string
  required?: boolean
  minLength?: number
  maxLength?: number
}

function Field({ label, value, onChange, type = 'text', ...rest }: FieldProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-500">{label}</span>
      <input
        {...rest}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border-2 border-purple-200 px-4 py-3 text-base font-bold text-grape focus:border-grape focus:outline-none"
      />
    </label>
  )
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
