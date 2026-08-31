// The ingestion surface.
//
// One property runs through all of it: **nothing spends money without saying
// what it will cost first.** The estimate is a separate call from the run on
// purpose — that extra round trip is the difference between a parent choosing
// to spend twenty credits and discovering that they did.

import { SignJWT } from 'jose'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))
const withUser = vi.hoisted(() =>
  vi.fn(async (_id: string, fn: (db: unknown) => Promise<unknown>) => fn({ query })),
)

vi.mock('../db.js', () => ({
  withUser: (...a: Parameters<typeof withUser>) => withUser(...a),
  withAdmin: (...a: Parameters<typeof withUser>) => withUser(...a),
  pool: { connect: vi.fn(), query: vi.fn(), on: vi.fn() },
}))

const { envMock } = vi.hoisted(() => ({
  envMock: {
    DATABASE_URL: 'postgres://test',
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_JWT_SECRET: 'a-test-secret-long-enough-for-hs256-signing',
    ANTHROPIC_API_KEY: 'sk-test',
    PG_POOL_MAX: 4,
    NODE_ENV: 'test',
    PORT: 8099,
  } as Record<string, unknown>,
}))
vi.mock('../env.js', () => ({ env: envMock, isProduction: false }))

const CALLER = 'aaaaaaaa-0000-0000-0000-000000000001'
const SOURCE = '33333333-4444-4555-8666-777777777777'
const SECRET = new TextEncoder().encode('a-test-secret-long-enough-for-hs256-signing')

async function auth() {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(CALLER)
    .setIssuer('https://test.supabase.co/auth/v1')
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(SECRET)
  return { authorization: `Bearer ${token}` }
}

async function buildApp() {
  const Fastify = (await import('fastify')).default
  const { contentRoutes } = await import('./content.js')
  const { HttpError, fromDatabaseError, fromValidationError } = await import('../errors.js')
  const app = Fastify()
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.status).send({ error: { code: error.code, message: error.message } })
      return
    }
    const invalid = fromValidationError(error)
    if (invalid) {
      reply.code(invalid.status).send({ error: { code: invalid.code, message: invalid.message } })
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
  await app.register(contentRoutes, { prefix: '/api' })
  await app.ready()
  return app
}

const JOB_ROW = {
  id: '44444444-5555-4666-8777-888888888888',
  source_id: SOURCE,
  status: 'queued',
  stage_detail: {},
  claimed_at: null,
  heartbeat_at: null,
  attempts: 0,
  error: null,
  result: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

beforeEach(() => {
  envMock.ANTHROPIC_API_KEY = 'sk-test'
  query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 })
  withUser.mockClear()
})

describe('whether the feature is even switched on', () => {
  it('says so plainly when there is no key', async () => {
    // A contributor running the API without one should get a clear answer, not
    // a 500 from three layers down.
    envMock.ANTHROPIC_API_KEY = undefined
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/content/status', headers: await auth() })
    expect(res.json()).toEqual({ enabled: false, balance: null })
  })

  it('refuses a build rather than half-starting one', async () => {
    envMock.ANTHROPIC_API_KEY = undefined
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/content/sources/${SOURCE}/build`,
      headers: await auth(),
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('not_enabled')
  })

  it('reports the balance when it is on', async () => {
    query.mockResolvedValue({ rows: [{ kind: 'grant', bucket: 'included', credits: 30 }] })
    const app = await buildApp()
    const res = await app.inject({ method: 'GET', url: '/api/content/status', headers: await auth() })
    expect(res.json()).toMatchObject({ enabled: true, balance: { included: 30, total: 30 } })
  })
})

describe('pasting a link', () => {
  it('refuses anything that is not https, before touching the network', async () => {
    const app = await buildApp()
    for (const url of ['http://example.com/a.pdf', 'file:///etc/passwd', 'not a url']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/content/sources/link',
        headers: await auth(),
        payload: { url },
      })
      expect(res.statusCode, url).toBe(400)
    }
    expect(query).not.toHaveBeenCalled()
  })

  it('turns a Google Doc into its export link rather than storing the edit URL', async () => {
    query.mockResolvedValue({ rows: [{ ...JOB_ROW, id: SOURCE }] })
    const app = await buildApp()
    await app.inject({
      method: 'POST',
      url: '/api/content/sources/link',
      headers: await auth(),
      payload: { url: 'https://docs.google.com/document/d/abc123/edit' },
    })
    const stored = query.mock.calls[0]![1] as unknown[]
    expect(String(stored[1])).toContain('/export?format=pdf')
  })
})

describe('what it will cost, before it costs it', () => {
  it('quotes the estimate and the balance together', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: SOURCE, pages: 24 }] })
      .mockResolvedValueOnce({ rows: [{ kind: 'grant', bucket: 'included', credits: 30 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/content/sources/${SOURCE}/estimate`,
      headers: await auth(),
    })
    expect(res.json()).toMatchObject({
      estimate: { pages: 24, credits: 24 },
      balance: { total: 30 },
      allowed: true,
    })
  })

  it('says why not, and by how much, when it cannot be afforded', async () => {
    // Covered, so the page cap is not what stops this — the balance is.
    query
      .mockResolvedValueOnce({ rows: [{ id: SOURCE, pages: 60 }] })
      .mockResolvedValueOnce({ rows: [{ kind: 'grant', bucket: 'included', credits: 5 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/content/sources/${SOURCE}/estimate`,
      headers: await auth(),
    })
    expect(res.json().allowed).toBe(false)
    expect(res.json().reason).toMatch(/60 credits/)
  })

  it('caps an uncovered account by pages before it ever counts credits', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: SOURCE, pages: 60 }] })
      .mockResolvedValueOnce({ rows: [{ kind: 'grant', bucket: 'included', credits: 9999 }] })
      .mockResolvedValueOnce({ rows: [] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/content/sources/${SOURCE}/estimate`,
      headers: await auth(),
    })
    expect(res.json().allowed).toBe(false)
    expect(res.json().reason).toMatch(/Split it/)
  })

  it('halves it for work that can wait', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: SOURCE, pages: 40 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/content/sources/${SOURCE}/estimate?noRush=true`,
      headers: await auth(),
    })
    expect(res.json().estimate.credits).toBe(20)
  })

  it('404s a document that is not the caller\'s — RLS is the filter', async () => {
    query.mockResolvedValue({ rows: [] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/content/sources/${SOURCE}/estimate`,
      headers: await auth(),
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('starting a run', () => {
  it('refuses with 402 rather than queueing something unaffordable', async () => {
    // Refused here rather than inside the job, so the person finds out now and
    // the refusal carries the number the next screen needs.
    query
      .mockResolvedValueOnce({ rows: [{ id: SOURCE, pages: 60 }] })
      .mockResolvedValueOnce({ rows: [{ kind: 'grant', bucket: 'included', credits: 5 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/content/sources/${SOURCE}/build`,
      headers: await auth(),
      payload: {},
    })
    expect(res.statusCode).toBe(402)
    expect(res.json().estimate.credits).toBe(60)
  })

  it('queues one it can afford, and remembers the choices', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ id: SOURCE, pages: 10 }] })
      .mockResolvedValueOnce({ rows: [{ kind: 'grant', bucket: 'included', credits: 90 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [JOB_ROW] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/content/sources/${SOURCE}/build`,
      headers: await auth(),
      payload: { topicIds: ['t1', 't2'], noRush: true },
    })
    expect(res.statusCode).toBe(200)
    const detail = JSON.parse(query.mock.calls[3]![1][1] as string)
    expect(detail).toMatchObject({ topicIds: ['t1', 't2'], noRush: true })
  })
})

describe('watching a run', () => {
  it('says the stage in words', async () => {
    query.mockResolvedValue({ rows: [{ ...JOB_ROW, status: 'building', stage_detail: { topics: 3 } }] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/content/jobs/${JOB_ROW.id}`,
      headers: await auth(),
    })
    expect(res.json().job.stage).toBe('Writing cards for 3 topics')
  })

  it('never hands the client our bookkeeping', async () => {
    query.mockResolvedValue({ rows: [{ ...JOB_ROW, attempts: 2 }] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/content/jobs/${JOB_ROW.id}`,
      headers: await auth(),
    })
    expect(res.json().job).not.toHaveProperty('attempts')
  })

  it('404s a run that is not the caller\'s', async () => {
    query.mockResolvedValue({ rows: [] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'GET',
      url: `/api/content/jobs/${JOB_ROW.id}`,
      headers: await auth(),
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('accepting a draft', () => {
  it('is one action on the whole set', async () => {
    const now = new Date().toISOString()
    query.mockResolvedValue({ rows: [{ id: SOURCE, accepted_at: now }] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/library/decks/${SOURCE}/accept`,
      headers: await auth(),
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().acceptedAt).toBe(Date.parse(now))
  })

  it('treats a second tap as success, not as a failure', async () => {
    // A slow connection should not make somebody think acceptance did not take.
    const now = new Date().toISOString()
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: SOURCE, accepted_at: now }] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/library/decks/${SOURCE}/accept`,
      headers: await auth(),
      payload: {},
    })
    expect(res.statusCode).toBe(200)
  })

  it('404s a set that does not exist', async () => {
    query.mockResolvedValue({ rows: [] })
    const app = await buildApp()
    const res = await app.inject({
      method: 'POST',
      url: `/api/library/decks/${SOURCE}/accept`,
      headers: await auth(),
      payload: {},
    })
    expect(res.statusCode).toBe(404)
  })
})
