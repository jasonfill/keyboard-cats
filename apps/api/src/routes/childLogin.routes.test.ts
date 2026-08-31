// Child sign-in.
//
// This is the mode that exists so an under-13 never needs an email address of
// their own: a grown-up turns it on, picks a PIN, and the child signs in with a
// code. That makes it the most sensitive route in the service — it mints
// credentials — so what is asserted here is mostly who is refused.
//
// The database and the Supabase admin client are both stubbed. Row Level
// Security is not exercised, and the ownership check below is deliberately in
// the handler rather than left to RLS precisely because the provisioning work
// runs through the admin API, which has no policies to answer to.

import { SignJWT } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { client, query } = vi.hoisted(() => {
  const query = vi.fn()
  return { query, client: { query } }
})

vi.mock('../db.js', () => ({
  withUser: vi.fn(async (_id: string, fn: (db: unknown) => Promise<unknown>) => fn(client)),
  withAdmin: vi.fn(async (fn: (db: unknown) => Promise<unknown>) => fn(client)),
  pool: { connect: vi.fn(), query: vi.fn(), on: vi.fn() },
}))

const adminApi = vi.hoisted(() => ({
  createUser: vi.fn(async () => ({ data: { user: { id: 'auth-1' } }, error: null })),
  updateUserById: vi.fn(async () => ({ data: { user: { id: 'auth-1' } }, error: null })),
  deleteUser: vi.fn(async () => ({ error: null })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: adminApi, signInWithPassword: vi.fn() } }),
}))

vi.mock('../env.js', () => ({
  env: {
    DATABASE_URL: 'postgres://test',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_JWT_SECRET: 'a-test-secret-long-enough-for-hs256-signing',
    SUPABASE_SERVICE_ROLE_KEY: 'service-key',
    SUPABASE_ANON_KEY: 'anon-key',
    CHILD_LOGIN_SECRET: 'a-child-login-secret-long-enough-to-derive-with',
    CHILD_EMAIL_DOMAIN: 'learners.test',
    PG_POOL_MAX: 4,
    NODE_ENV: 'test',
    PORT: 8099,
  },
  isProduction: false,
}))

const LEARNER = '11111111-2222-4333-8444-555555555555'
const OWNER = 'aaaaaaaa-0000-0000-0000-000000000001'
const STRANGER = 'bbbbbbbb-0000-0000-0000-000000000002'
const SECRET = new TextEncoder().encode('a-test-secret-long-enough-for-hs256-signing')

async function auth(sub = OWNER) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer('https://test.supabase.co/auth/v1')
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(SECRET)
  return { authorization: `Bearer ${token}` }
}

function learnerRow(over: Record<string, unknown> = {}) {
  return {
    id: LEARNER,
    display_name: 'Ada',
    owner_id: OWNER,
    auth_kind: 'none',
    auth_user_id: null,
    ...over,
  }
}

async function buildApp() {
  const Fastify = (await import('fastify')).default
  const { childLoginAdminRoutes } = await import('./childLogin.js')
  const { HttpError, fromDatabaseError } = await import('../errors.js')

  const app = Fastify()
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.status).send({ error: { code: error.code, message: error.message } })
      return
    }
    const mapped = fromDatabaseError(error)
    if (mapped) {
      reply.code(mapped.status).send({ error: { code: mapped.code, message: mapped.message } })
      return
    }
    const withStatus = error as unknown as { statusCode?: number }
    reply
      .code(withStatus.statusCode && withStatus.statusCode < 500 ? withStatus.statusCode : 500)
      .send({ error: { code: 'error', message: (error as Error).message } })
  })
  await app.register(childLoginAdminRoutes, { prefix: '/api' })
  await app.ready()
  return app
}

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [learnerRow()], rowCount: 1 })
  for (const fn of Object.values(adminApi)) fn.mockClear()
})

describe('who may set up a child sign-in', () => {
  it('refuses an unauthenticated caller', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      payload: { pin: '1234' },
    })
    expect(res.statusCode).toBe(401)
    expect(adminApi.createUser).not.toHaveBeenCalled()
  })

  it('refuses somebody who is not the owner', async () => {
    // A guardian can see a learner. Minting them a password is a different
    // thing, and only the owner may do it.
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(STRANGER),
      payload: { pin: '1234' },
    })
    expect(res.statusCode).toBe(403)
    expect(adminApi.createUser).not.toHaveBeenCalled()
  })

  it('answers 404 for a learner that is not there', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '1234' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('refuses a learner who already has their own account', async () => {
    // Taking over a teenager's real account with a parent-set PIN would be a
    // takeover, not a convenience.
    query.mockResolvedValue({ rows: [learnerRow({ auth_kind: 'self' })], rowCount: 1 })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '1234' },
    })
    expect(res.statusCode).toBe(400)
    expect(adminApi.createUser).not.toHaveBeenCalled()
  })
})

describe('the PIN', () => {
  it('must be four to eight digits', async () => {
    const app = await buildApp()
    for (const pin of ['123', '123456789', 'abcd', '', '12 34']) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/learners/${LEARNER}/child-login`,
        headers: await auth(),
        payload: { pin },
      })
      expect(res.statusCode, pin).toBe(400)
    }
    expect(adminApi.createUser).not.toHaveBeenCalled()
  })

  it('accepts a four-digit PIN', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '1234' },
    })
    expect(res.statusCode).toBeLessThan(400)
  })

  it('never sends the PIN back, only the code', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '4321' },
    })
    expect(res.body).not.toContain('4321')
  })

  it('derives a password rather than storing the PIN', async () => {
    // Whatever reaches Supabase must not be the four digits a child types.
    const app = await buildApp()
    await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '4321' },
    })
    const call = adminApi.createUser.mock.calls[0] ?? adminApi.updateUserById.mock.calls[0]
    if (call) expect(JSON.stringify(call)).not.toContain('"4321"')
  })
})

describe('provisioning', () => {
  it('creates an account for a learner who has none', async () => {
    const app = await buildApp()
    await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '1234' },
    })
    expect(adminApi.createUser).toHaveBeenCalled()
  })

  it('only changes the PIN when the account already exists', async () => {
    query.mockResolvedValue({
      rows: [learnerRow({ auth_user_id: 'auth-1', auth_kind: 'provisioned' })],
      rowCount: 1,
    })
    const app = await buildApp()
    await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '5678' },
    })
    expect(adminApi.updateUserById).toHaveBeenCalled()
    expect(adminApi.createUser).not.toHaveBeenCalled()
  })

  it('gives the child a code to sign in with', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '1234' },
    })
    const body = res.json()
    expect(JSON.stringify(body)).toMatch(/[A-Z0-9]{6,}/)
  })

  it('rejects a malformed learner id before doing anything', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/learners/not-a-uuid/child-login',
      headers: await auth(),
      payload: { pin: '1234' },
    })
    expect(res.statusCode).toBe(400)
    expect(query).not.toHaveBeenCalled()
  })
})

describe('turning a child sign-in off again', () => {
  // The teardown has to leave the learner in a coherent state: the auth user
  // gone, the stored credential gone, and auth_kind back to 'none'. A learner
  // left claiming a provisioned login they no longer have is a learner nobody
  // can sign in as and nobody can re-provision either.
  function provisioned(over: Record<string, unknown> = {}) {
    query.mockResolvedValue({
      rows: [learnerRow({ auth_kind: 'provisioned', auth_user_id: 'auth-1', ...over })],
      rowCount: 1,
    })
  }

  it('removes the auth account, the credential and the mode', async () => {
    provisioned()
    const app = await buildApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
    })
    expect(res.statusCode).toBe(204)
    expect(adminApi.deleteUser).toHaveBeenCalledWith('auth-1')
    const ran = query.mock.calls.map(([s]) => String(s))
    expect(ran.some((s) => /delete from public\.learner_credentials/i.test(s))).toBe(true)
    expect(ran.some((s) => /auth_kind = 'none'/i.test(s))).toBe(true)
  })

  it('refuses somebody who is not the owner', async () => {
    provisioned()
    const app = await buildApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(STRANGER),
    })
    expect(res.statusCode).toBe(403)
    expect(adminApi.deleteUser).not.toHaveBeenCalled()
  })

  it('answers 404 for a learner that is not there', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 })
    const app = await buildApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
    })
    expect(res.statusCode).toBe(404)
  })

  it('refuses a learner who never had one', async () => {
    provisioned({ auth_kind: 'none' })
    const app = await buildApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuses an unauthenticated caller', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/learners/${LEARNER}/child-login`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('rejects a malformed learner id', async () => {
    const app = await buildApp()
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/learners/not-a-uuid/child-login',
      headers: await auth(),
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('when the auth server will not play along', () => {
  // These are 502s rather than 500s on purpose: nothing here is wrong with the
  // request, and the grown-up retrying it is the right next move.
  it('reports a failure to create the account', async () => {
    adminApi.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'rate limited' },
    } as never)
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '1234' },
    })
    expect(res.statusCode).toBe(502)
    expect(res.json().error.message).toContain('rate limited')
  })

  it('reports a failure to change an existing PIN', async () => {
    query.mockResolvedValue({
      rows: [learnerRow({ auth_kind: 'provisioned', auth_user_id: 'auth-1' })],
      rowCount: 1,
    })
    adminApi.updateUserById.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'nope' },
    } as never)
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '1234' },
    })
    expect(res.statusCode).toBe(502)
  })

  it('leaves nothing half-done: no code is stored when the account could not be made', async () => {
    adminApi.createUser.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'no' },
    } as never)
    const app = await buildApp()
    await app.inject({
      method: 'POST',
      url: `/api/learners/${LEARNER}/child-login`,
      headers: await auth(),
      payload: { pin: '1234' },
    })
    const ran = query.mock.calls.map(([s]) => String(s))
    expect(ran.some((s) => /attach_provisioned_login/.test(s))).toBe(false)
  })
})
