// The two endpoints that take no bearer token: the child's code-and-PIN
// exchange, and the developer login.
//
// Both hand out a session, so both are attack surface. The properties worth
// pinning are the ones that stop them becoming an oracle: one message for a bad
// code and a bad PIN, because telling them apart would say which codes exist;
// and a dev endpoint that 404s rather than 403s off-loopback, because an
// endpoint admitting it exists is a thing to come back and attack.

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('../db.js', () => ({
  withUser: vi.fn(async (_id: string, fn: (db: unknown) => Promise<unknown>) => fn({ query })),
  withAdmin: vi.fn(async (fn: (db: unknown) => Promise<unknown>) => fn({ query })),
  pool: { connect: vi.fn(), query: vi.fn(), on: vi.fn() },
}))

const adminApi = vi.hoisted(() => ({
  createUser: vi.fn(async () => ({ data: { user: { id: 'auth-1' } }, error: null })),
  updateUserById: vi.fn(async () => ({ data: { user: { id: 'auth-1' } }, error: null })),
  generateLink: vi.fn(async () => ({
    data: { properties: { hashed_token: 'tok' } },
    error: null,
  })),
}))
const supabaseAuth = vi.hoisted(() => ({
  signInWithPassword: vi.fn(async () => ({
    data: { session: { access_token: 'a', refresh_token: 'r' } },
    error: null,
  })),
  verifyOtp: vi.fn(async () => ({
    data: { session: { access_token: 'a', refresh_token: 'r' } },
    error: null,
  })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { ...supabaseAuth, admin: adminApi } }),
}))

const envValues = vi.hoisted(() => ({
  DATABASE_URL: 'postgres://test',
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_JWT_SECRET: 'a-test-secret-long-enough-for-hs256-signing',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  SUPABASE_ANON_KEY: 'anon-key',
  CHILD_LOGIN_SECRET: 'a-child-login-secret-long-enough-to-derive-with',
  CHILD_EMAIL_DOMAIN: 'learners.test',
  DEV_LOGIN_SECRET: 'a-dev-login-secret-long-enough',
  DEV_LOGIN_EMAILS: 'dev@example.test',
  PG_POOL_MAX: 4,
  NODE_ENV: 'test',
  PORT: 8099,
}))
vi.mock('../env.js', () => ({ env: envValues, isProduction: false }))

async function buildApp(which: 'child' | 'dev') {
  const Fastify = (await import('fastify')).default
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
    const s = error as unknown as { statusCode?: number }
    reply
      .code(s.statusCode && s.statusCode < 500 ? s.statusCode : 500)
      .send({ error: { code: 'error', message: (error as Error).message } })
  })
  if (which === 'child') {
    const { childLoginPublicRoutes } = await import('./childLogin.js')
    await app.register(childLoginPublicRoutes, { prefix: '/api' })
  } else {
    const { devLoginRoutes } = await import('./devLogin.js')
    await app.register(devLoginRoutes, { prefix: '/api' })
  }
  await app.ready()
  return app
}

beforeEach(() => {
  query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 })
  for (const fn of Object.values(adminApi)) fn.mockClear()
  for (const fn of Object.values(supabaseAuth)) fn.mockClear()
})

describe('the child’s code-and-PIN exchange', () => {
  function goodLookup() {
    query.mockImplementation(async (sql: string) => {
      if (/authenticate_learner/.test(String(sql))) {
        return { rows: [{ auth_user_id: 'auth-1' }], rowCount: 1 }
      }
      return { rows: [{ id: 'l1', display_name: 'Ada' }], rowCount: 1 }
    })
  }

  it('hands back a session for a correct code and PIN', async () => {
    goodLookup()
    const app = await buildApp('child')
    const res = await app.inject({
      method: 'POST',
      url: '/api/child-login',
      payload: { loginCode: 'CODE1234', pin: '1234' },
    })
    expect(res.statusCode).toBeLessThan(400)
  })

  it('uppercases the code, so a child’s keyboard does not fail them', async () => {
    goodLookup()
    const app = await buildApp('child')
    await app.inject({
      method: 'POST',
      url: '/api/child-login',
      payload: { loginCode: 'code1234', pin: '1234' },
    })
    const values = query.mock.calls.flatMap(([, v]) => (v ?? []) as unknown[])
    expect(values).toContain('CODE1234')
  })

  it('gives the same answer for a bad code and a bad PIN', async () => {
    // Telling them apart would turn this into an oracle for which codes exist.
    query.mockResolvedValue({ rows: [{ auth_user_id: null }], rowCount: 1 })
    const app = await buildApp('child')
    const wrongCode = await app.inject({
      method: 'POST',
      url: '/api/child-login',
      payload: { loginCode: 'NOSUCHCODE', pin: '1234' },
    })
    const wrongPin = await app.inject({
      method: 'POST',
      url: '/api/child-login',
      payload: { loginCode: 'CODE1234', pin: '9999' },
    })
    expect(wrongCode.statusCode).toBe(401)
    expect(wrongPin.statusCode).toBe(401)
    expect(wrongCode.json()).toEqual(wrongPin.json())
  })

  it('rejects a PIN that is not four to eight digits', async () => {
    const app = await buildApp('child')
    for (const pin of ['12', 'abcd', '1234567890']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/child-login',
        payload: { loginCode: 'CODE1234', pin },
      })
      expect(res.statusCode, pin).toBe(400)
    }
    expect(query).not.toHaveBeenCalled()
  })

  it('rejects a code too short to be one', async () => {
    const app = await buildApp('child')
    const res = await app.inject({
      method: 'POST',
      url: '/api/child-login',
      payload: { loginCode: 'AB', pin: '1234' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('never echoes the PIN back', async () => {
    query.mockResolvedValue({ rows: [{ auth_user_id: null }], rowCount: 1 })
    const app = await buildApp('child')
    const res = await app.inject({
      method: 'POST',
      url: '/api/child-login',
      payload: { loginCode: 'CODE1234', pin: '4321' },
    })
    expect(res.body).not.toContain('4321')
  })
})

describe('the developer login', () => {
  it('pretends not to exist when the request is not from this machine', async () => {
    // 404 rather than 403: an endpoint that admits to existing is a thing to
    // come back and attack.
    const app = await buildApp('dev')
    const res = await app.inject({
      method: 'POST',
      url: '/api/dev/login',
      payload: { secret: envValues.DEV_LOGIN_SECRET, email: 'dev@example.test' },
      remoteAddress: '203.0.113.9',
    })
    expect(res.statusCode).toBe(404)
  })

  it('refuses a wrong secret even from this machine', async () => {
    const app = await buildApp('dev')
    const res = await app.inject({
      method: 'POST',
      url: '/api/dev/login',
      payload: { secret: 'not-the-secret', email: 'dev@example.test' },
      remoteAddress: '127.0.0.1',
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('refuses a request with neither an email nor a user id', async () => {
    const app = await buildApp('dev')
    const res = await app.inject({
      method: 'POST',
      url: '/api/dev/login',
      payload: { secret: envValues.DEV_LOGIN_SECRET },
      remoteAddress: '127.0.0.1',
    })
    expect(res.statusCode).toBe(400)
  })

  it('refuses an account that is not on the allow-list', async () => {
    const app = await buildApp('dev')
    const res = await app.inject({
      method: 'POST',
      url: '/api/dev/login',
      payload: { secret: envValues.DEV_LOGIN_SECRET, email: 'someone@else.test' },
      remoteAddress: '127.0.0.1',
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it('is not registered at all without a configured secret', async () => {
    // The route only exists on a developer's machine, and only when they have
    // deliberately turned it on.
    const previous = envValues.DEV_LOGIN_SECRET
    envValues.DEV_LOGIN_SECRET = '' as never
    const app = await buildApp('dev')
    const res = await app.inject({
      method: 'POST',
      url: '/api/dev/login',
      payload: { secret: 'anything' },
      remoteAddress: '127.0.0.1',
    })
    expect(res.statusCode).toBe(404)
    envValues.DEV_LOGIN_SECRET = previous
  })
})
