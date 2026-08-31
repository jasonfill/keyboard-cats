// The way in.
//
// Three doors, and which one you get is the whole design. A grown-up gets
// email and password; a child gets a code and a PIN and is never asked for an
// email; and anyone who says they are under 13 gets neither — permanently, in
// this browser, because an age screen you can clear by reloading is not an age
// screen.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  configured: true,
  error: null as string | null,
  signIn: vi.fn(async () => {}),
  signUp: vi.fn(async () => ({ needsEmailConfirm: false })),
  signInWithGoogle: vi.fn(async () => {}),
  signInWithCode: vi.fn(async () => {}),
  sendPasswordReset: vi.fn(async () => {}),
  clearError: vi.fn(),
}))

vi.mock('./AuthProvider', () => ({
  useAuth: () => auth,
  AuthProvider: ({ children }: { children: unknown }) => children,
}))

vi.mock('../lib/theme/ThemeProvider', async () =>
  (await import('../test/mockProviders')).themeMock(),
)

const hasLocalProgress = vi.hoisted(() => vi.fn(() => false))
vi.mock('../lib/progress/localRepo', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../lib/progress/localRepo')
  return { ...actual, hasLocalProgress }
})

import AuthScreen from './AuthScreen'

const onDone = vi.fn()
const onGuest = vi.fn()

/** Get past "who is setting this up?" as a parent. */
function asParent() {
  fireEvent.click(screen.getByText('👋 I am a parent'))
}

beforeEach(() => {
  onDone.mockClear()
  onGuest.mockClear()
  hasLocalProgress.mockReturnValue(false)
  auth.configured = true
  auth.error = null
  auth.signIn.mockClear().mockResolvedValue(undefined)
  auth.signUp.mockClear().mockResolvedValue({ needsEmailConfirm: false })
  auth.signInWithGoogle.mockClear().mockResolvedValue(undefined)
  auth.signInWithCode.mockClear().mockResolvedValue(undefined)
  auth.sendPasswordReset.mockClear().mockResolvedValue(undefined)
  auth.clearError.mockClear()
})

describe('a build with no database behind it', () => {
  it('says progress stays in this browser, and lets them play anyway', () => {
    auth.configured = false
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    expect(screen.getByText('Accounts are off')).toBeTruthy()
    fireEvent.click(screen.getByText('Keep playing'))
    expect(onGuest).toHaveBeenCalled()
  })
})

describe('who is setting this up', () => {
  it('is the first thing asked, before any email box exists', () => {
    // The answer decides whether we may collect an email address at all.
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    expect(screen.getByText('Who is setting this up?')).toBeTruthy()
    expect(screen.queryByPlaceholderText('you@example.com')).toBeNull()
  })

  it('remembers a parent’s answer for the first-run screen', () => {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    asParent()
    expect(JSON.parse(localStorage.getItem('cat-academy:signup-intent')!)).toEqual({
      role: 'guardian',
    })
  })

  it('remembers a tutor’s answer, which changes what they see next', () => {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    fireEvent.click(screen.getByText('🎓 I am a tutor or teacher'))
    expect(JSON.parse(localStorage.getItem('cat-academy:signup-intent')!)).toEqual({
      role: 'tutor',
    })
    expect(screen.getByText(/Your students stay on their own families/)).toBeTruthy()
  })

  it('offers the sign-in tab to somebody who already has an account', () => {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    fireEvent.click(screen.getByText('I already have an account'))
    expect(screen.getByText('Welcome back.')).toBeTruthy()
  })
})

describe('the age screen', () => {
  it('asks for a birth year rather than "are you 13?"', () => {
    // Asking the yes/no question tells you which answer opens the door.
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    fireEvent.click(screen.getByText('🎒 I am the one learning'))
    expect(screen.getByText('What year were you born?')).toBeTruthy()
  })

  it('rejects something that is not a year', () => {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    fireEvent.click(screen.getByText('🎒 I am the one learning'))
    fireEvent.change(screen.getByPlaceholderText('2011'), { target: { value: '1066' } })
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText('That does not look like a year.')).toBeTruthy()
  })

  it('keeps non-digits out of the year box', () => {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    fireEvent.click(screen.getByText('🎒 I am the one learning'))
    const input = screen.getByPlaceholderText('2011') as HTMLInputElement
    fireEvent.change(input, { target: { value: '20x1a' } })
    expect(input.value).toBe('201')
  })

  it('lets a teenager through, and remembers the year so nobody types it twice', () => {
    const year = new Date().getFullYear() - 15
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    fireEvent.click(screen.getByText('🎒 I am the one learning'))
    fireEvent.change(screen.getByPlaceholderText('2011'), { target: { value: String(year) } })
    fireEvent.click(screen.getByText('Next'))
    expect(screen.getByText(/Progress follows you to any device/)).toBeTruthy()
    expect(JSON.parse(localStorage.getItem('cat-academy:signup-intent')!)).toEqual({
      role: 'learner',
      birthYear: year,
    })
  })

  it('can be backed out of', () => {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    fireEvent.click(screen.getByText('🎒 I am the one learning'))
    fireEvent.click(screen.getByText('← Back'))
    expect(screen.getByText('Who is setting this up?')).toBeTruthy()
  })
})

describe('somebody under thirteen', () => {
  function sayUnderThirteen() {
    const year = new Date().getFullYear() - 8
    fireEvent.click(screen.getByText('🎒 I am the one learning'))
    fireEvent.change(screen.getByPlaceholderText('2011'), { target: { value: String(year) } })
    fireEvent.click(screen.getByText('Next'))
  }

  it('is sent to fetch a grown-up, not to an email box', () => {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    sayUnderThirteen()
    expect(screen.getByText("Let's get a grown-up")).toBeTruthy()
    expect(screen.queryByPlaceholderText('you@example.com')).toBeNull()
  })

  it('is still refused after a reload', () => {
    // Sticky on purpose: otherwise "how old are you" becomes "keep trying".
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    sayUnderThirteen()
    expect(localStorage.getItem('cat-academy:signup-refused')).toBeTruthy()

    const again = render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    expect(again.getAllByText("Let's get a grown-up").length).toBeGreaterThan(0)
  })

  it('can still play, and can still use a code a grown-up gave them', () => {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    sayUnderThirteen()
    fireEvent.click(screen.getByText('Sign in with a code'))
    expect(screen.getByText('Hi there!')).toBeTruthy()
  })

  it('can keep playing without an account', () => {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    sayUnderThirteen()
    fireEvent.click(screen.getByText('Keep playing without an account'))
    expect(onGuest).toHaveBeenCalled()
  })
})

describe('the child’s door', () => {
  function openKidMode() {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    fireEvent.click(screen.getByText('Kids: sign in with a code'))
  }

  it('asks for a code and a secret number, and never for an email', () => {
    openKidMode()
    expect(screen.getByText('Your code')).toBeTruthy()
    expect(screen.getByText('Secret number')).toBeTruthy()
    expect(screen.queryByPlaceholderText('you@example.com')).toBeNull()
  })

  it('uppercases the code and keeps letters out of the PIN', () => {
    openKidMode()
    const code = screen.getByPlaceholderText('ABCD2345') as HTMLInputElement
    const pin = screen.getByPlaceholderText('••••') as HTMLInputElement
    fireEvent.change(code, { target: { value: 'abcd2345' } })
    fireEvent.change(pin, { target: { value: '12ab34' } })
    expect(code.value).toBe('ABCD2345')
    expect(pin.value).toBe('1234')
  })

  it('will not submit half a credential', () => {
    openKidMode()
    const button = screen.getByText('Let me in!') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('ABCD2345'), { target: { value: 'ABCD2345' } })
    expect(button.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('••••'), { target: { value: '1234' } })
    expect(button.disabled).toBe(false)
  })

  it('signs them in', async () => {
    openKidMode()
    fireEvent.change(screen.getByPlaceholderText('ABCD2345'), { target: { value: 'ABCD2345' } })
    fireEvent.change(screen.getByPlaceholderText('••••'), { target: { value: '1234' } })
    fireEvent.click(screen.getByText('Let me in!'))
    await waitFor(() => expect(auth.signInWithCode).toHaveBeenCalledWith('ABCD2345', '1234'))
    expect(onDone).toHaveBeenCalled()
  })

  it('stays put when the code was wrong', async () => {
    auth.signInWithCode.mockRejectedValueOnce(new Error('nope'))
    openKidMode()
    fireEvent.change(screen.getByPlaceholderText('ABCD2345'), { target: { value: 'ABCD2345' } })
    fireEvent.change(screen.getByPlaceholderText('••••'), { target: { value: '1234' } })
    fireEvent.click(screen.getByText('Let me in!'))
    await waitFor(() => expect(auth.signInWithCode).toHaveBeenCalled())
    expect(onDone).not.toHaveBeenCalled()
  })

  it('has a way back for a grown-up who tapped it by mistake', () => {
    openKidMode()
    fireEvent.click(screen.getByText('I am a grown-up'))
    expect(screen.getByText('Who is setting this up?')).toBeTruthy()
  })

  it('shows what went wrong', () => {
    auth.error = 'That code or PIN is not right'
    openKidMode()
    expect(screen.getByText('That code or PIN is not right')).toBeTruthy()
  })
})

describe('the grown-up’s form', () => {
  function signupForm() {
    render(<AuthScreen onDone={onDone} onGuest={onGuest} />)
    asParent()
  }

  function fill(email = 'a@b.test', password = 'secret1') {
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: email },
    })
    fireEvent.change(screen.getByPlaceholderText('At least 6 characters'), {
      target: { value: password },
    })
  }

  it('creates an account and moves on', async () => {
    signupForm()
    fireEvent.change(screen.getByPlaceholderText('Alex'), { target: { value: 'Sam' } })
    fill()
    fireEvent.click(screen.getByText('🎉 Create my account'))
    await waitFor(() => expect(auth.signUp).toHaveBeenCalledWith('a@b.test', 'secret1', 'Sam'))
    expect(onDone).toHaveBeenCalled()
  })

  it('waits at the screen when the address needs confirming', async () => {
    auth.signUp.mockResolvedValueOnce({ needsEmailConfirm: true })
    signupForm()
    fill()
    fireEvent.click(screen.getByText('🎉 Create my account'))
    expect(await screen.findByText(/Check your email for a confirmation link/)).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('signs an existing account in', async () => {
    signupForm()
    fireEvent.click(screen.getByText('Sign in'))
    fill()
    fireEvent.click(screen.getByText('👋 Sign in'))
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledWith('a@b.test', 'secret1'))
    expect(onDone).toHaveBeenCalled()
  })

  it('stays put when signing in failed', async () => {
    auth.signIn.mockRejectedValueOnce(new Error('wrong password'))
    signupForm()
    fireEvent.click(screen.getByText('Sign in'))
    fill()
    fireEvent.click(screen.getByText('👋 Sign in'))
    await waitFor(() => expect(auth.signIn).toHaveBeenCalled())
    expect(onDone).not.toHaveBeenCalled()
  })

  it('asks for a name on sign-up and not on sign-in', () => {
    signupForm()
    expect(screen.getByPlaceholderText('Alex')).toBeTruthy()
    fireEvent.click(screen.getByText('Sign in'))
    expect(screen.queryByPlaceholderText('Alex')).toBeNull()
  })

  it('sends a reset link, but only once it has an address to send it to', async () => {
    signupForm()
    fireEvent.click(screen.getByText('Sign in'))
    fireEvent.click(screen.getByText('Forgot your password?'))
    expect(screen.getByText(/Type your email above first/)).toBeTruthy()
    expect(auth.sendPasswordReset).not.toHaveBeenCalled()

    fill()
    fireEvent.click(screen.getByText('Forgot your password?'))
    await waitFor(() => expect(auth.sendPasswordReset).toHaveBeenCalledWith('a@b.test'))
    expect(await screen.findByText(/Password reset link sent/)).toBeTruthy()
  })

  it('offers Google, and stays on the screen if it fails', async () => {
    auth.signInWithGoogle.mockRejectedValueOnce(new Error('popup closed'))
    signupForm()
    fireEvent.click(screen.getByText('Continue with Google'))
    await waitFor(() => expect(auth.signInWithGoogle).toHaveBeenCalled())
    expect(screen.getByText('Continue with Google')).toBeTruthy()
  })

  it('promises guest progress will be carried over', () => {
    // Somebody who played first and signed up second must be told their work
    // is not about to be thrown away.
    hasLocalProgress.mockReturnValue(true)
    signupForm()
    expect(screen.getByText(/It will be added to your new account/)).toBeTruthy()
  })

  it('does not promise that when there is nothing saved', () => {
    signupForm()
    expect(screen.queryByText(/It will be added to your new account/)).toBeNull()
  })

  it('shows what the provider said went wrong', () => {
    auth.error = 'That email is already registered'
    signupForm()
    expect(screen.getByText('That email is already registered')).toBeTruthy()
  })

  it('clears a stale error when the tab changes', () => {
    signupForm()
    fireEvent.click(screen.getByText('Sign in'))
    expect(auth.clearError).toHaveBeenCalled()
  })

  it('lets anyone keep playing without an account', () => {
    signupForm()
    fireEvent.click(screen.getByText('Keep playing without an account'))
    expect(onGuest).toHaveBeenCalled()
  })
})
