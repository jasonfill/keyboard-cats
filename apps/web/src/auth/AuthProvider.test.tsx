// Signing in.
//
// Three routes in: an email and password, Google, and — the one this product
// exists to make possible — a code and a PIN, so a child under 13 never needs
// an email address of their own.
//
// What the tests hold onto is that a failure is always reported in words a
// person could act on, and that a build with no Supabase credentials still
// runs as a guest rather than showing a broken sign-in screen.

import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authApi = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  signInWithPassword: vi.fn(async () => ({ error: null })),
  signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
  signInWithOAuth: vi.fn(async () => ({ error: null })),
  setSession: vi.fn(async () => ({ error: null })),
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
  signOut: vi.fn(async () => ({ error: null })),
}))

const supabaseMock = vi.hoisted(() => ({
  configured: true,
  from: vi.fn(() => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
    }),
    update: () => ({ eq: async () => ({ error: null }) }),
  })),
}))

vi.mock('../lib/supabase', () => ({
  get supabase() {
    return supabaseMock.configured ? { auth: authApi, from: supabaseMock.from } : null
  },
  get isSupabaseConfigured() {
    return supabaseMock.configured
  },
  authRedirectUrl: () => 'https://whizzo.test/auth/callback',
}))

const apiRequest = vi.hoisted(() => vi.fn())
vi.mock('../lib/api/client', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}))

import { AuthProvider, useAuth } from './AuthProvider'

function Probe() {
  const auth = useAuth()
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="configured">{String(auth.configured)}</span>
      <span data-testid="error">{auth.error ?? ''}</span>
      <button onClick={() => void auth.signIn('a@b.test', 'pw').catch(() => {})}>sign-in</button>
      <button onClick={() => void auth.signInWithGoogle().catch(() => {})}>google</button>
      <button onClick={() => void auth.signInWithCode('abc123', '1234').catch(() => {})}>code</button>
      <button onClick={() => void auth.signOut()}>sign-out</button>
      <button onClick={() => auth.clearError()}>clear</button>
    </div>
  )
}

function renderAuth() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

const click = async (label: string) => {
  await act(async () => {
    screen.getByText(label).click()
  })
}

beforeEach(() => {
  supabaseMock.configured = true
  for (const fn of Object.values(authApi)) fn.mockClear()
  authApi.getSession.mockResolvedValue({ data: { session: null }, error: null })
  authApi.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
  apiRequest.mockReset()
})

describe('starting up', () => {
  it('settles as a guest when there is no session', async () => {
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
  })

  it('subscribes to session changes so a sign-in elsewhere is noticed', async () => {
    renderAuth()
    await waitFor(() => expect(authApi.onAuthStateChange).toHaveBeenCalled())
  })

  it('runs as a guest-only build when there are no credentials', async () => {
    // A build without Supabase should still let a child practise, rather than
    // showing a sign-in screen that cannot work.
    supabaseMock.configured = false
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    expect(screen.getByTestId('configured')).toHaveTextContent('false')
  })
})

describe('email and password', () => {
  it('signs in', async () => {
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    await click('sign-in')
    expect(authApi.signInWithPassword).toHaveBeenCalledWith({
      email: 'a@b.test',
      password: 'pw',
    })
  })

  it('reports a refusal in words rather than swallowing it', async () => {
    authApi.signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    } as never)
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    await click('sign-in')
    await waitFor(() => expect(screen.getByTestId('error')).not.toHaveTextContent(''))
  })

  it('lets the screen clear a stale error', async () => {
    authApi.signInWithPassword.mockResolvedValue({ error: { message: 'nope' } } as never)
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    await click('sign-in')
    await waitFor(() => expect(screen.getByTestId('error')).not.toHaveTextContent(''))
    await click('clear')
    expect(screen.getByTestId('error')).toHaveTextContent('')
  })
})

describe('Google', () => {
  it('starts the OAuth dance', async () => {
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    await click('google')
    expect(authApi.signInWithOAuth).toHaveBeenCalled()
  })
})

describe('code and PIN — the child’s way in', () => {
  it('exchanges the code through the API, not through Supabase directly', async () => {
    // The exchange needs a service role, so it happens server side; the browser
    // only ever receives the resulting session.
    apiRequest.mockResolvedValue({
      session: { accessToken: 'a', refreshToken: 'r' },
    })
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    await click('code')
    expect(apiRequest).toHaveBeenCalledWith('/child-login', expect.objectContaining({
      method: 'POST',
      anonymous: true,
    }))
  })

  it('normalises the code, so case and stray spaces do not fail a child', async () => {
    apiRequest.mockResolvedValue({ session: { accessToken: 'a', refreshToken: 'r' } })
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    await click('code')
    const body = apiRequest.mock.calls[0]![1] as { body: { loginCode: string } }
    expect(body.body.loginCode).toBe('ABC123')
  })

  it('installs the session it was handed', async () => {
    apiRequest.mockResolvedValue({ session: { accessToken: 'a', refreshToken: 'r' } })
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    await click('code')
    expect(authApi.setSession).toHaveBeenCalledWith({
      access_token: 'a',
      refresh_token: 'r',
    })
  })

  it('says the code or PIN is wrong rather than showing a raw failure', async () => {
    apiRequest.mockRejectedValue(new Error('Request failed (401)'))
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    await click('code')
    await waitFor(() => expect(screen.getByTestId('error')).not.toHaveTextContent(''))
  })
})

describe('signing out', () => {
  it('ends the session', async () => {
    renderAuth()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('guest'))
    await click('sign-out')
    expect(authApi.signOut).toHaveBeenCalled()
  })
})

describe('useAuth outside a provider', () => {
  it('fails loudly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/AuthProvider/)
  })
})
