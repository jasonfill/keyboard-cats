// Database access, SQL plumbing, and the environment the service refuses to
// start without.
//
// `withUser` is the single most important function in the API: it is the only
// reason Row Level Security still applies. The API connects as a role that
// could read everything, and stays honest solely because every request-scoped
// query first drops to `authenticated` and presents the caller's claims. If
// that sequence ever changed — the role set before the claims, a missing
// rollback, a leaked connection — the policies would quietly stop enforcing
// and nothing else in the codebase would notice.

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Hoisted with the vi.mock call, so the fake pool can close over them.
const { client, connect } = vi.hoisted(() => {
  const client = {
    query: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      rows: [] as unknown[],
      rowCount: 0,
    })),
    release: vi.fn(),
  }
  return { client, connect: vi.fn(async () => client) }
})

vi.mock('pg', () => ({
  default: {
    Pool: class {
      connect = connect
      query = vi.fn()
      on = vi.fn()
    },
  },
}))

vi.mock('./env.js', () => ({
  env: { DATABASE_URL: 'postgres://test', PG_POOL_MAX: 4, NODE_ENV: 'test' },
  isProduction: false,
}))

import { withAdmin, withUser } from './db.js'
import { insertMany } from './sql.js'

const CALLER = 'aaaaaaaa-0000-0000-0000-000000000001'

/** Every statement issued on the pooled client, in order. */
function statements(): string[] {
  return client.query.mock.calls.map(([sql]) => String(sql))
}

beforeEach(() => {
  client.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 })
  client.release.mockReset()
  connect.mockClear()
})

describe('withUser — what keeps RLS in force', () => {
  it('runs the caller’s work inside a transaction', async () => {
    await withUser(CALLER, async () => 'done')
    const sql = statements()
    expect(sql[0]).toMatch(/^begin/i)
    expect(sql.at(-1)).toMatch(/^commit/i)
  })

  it('sets the claims before dropping the role', async () => {
    // Order is the whole point: the more privileged connecting role has to do
    // the setting, because `authenticated` may not.
    await withUser(CALLER, async () => null)
    const sql = statements()
    const claims = sql.findIndex((s) => /set_config/.test(s))
    const role = sql.findIndex((s) => /set local role authenticated/i.test(s))
    expect(claims).toBeGreaterThan(-1)
    expect(role).toBeGreaterThan(-1)
    expect(claims).toBeLessThan(role)
  })

  it('presents the caller’s id the way auth.uid() reads it', async () => {
    await withUser(CALLER, async () => null)
    const values = client.query.mock.calls.flatMap(([, v]) => (v ?? []) as unknown[])
    expect(values).toContain(CALLER)
    // The claims blob is a JSON string, so read it rather than the array.
    const claims = values.find((v) => typeof v === 'string' && v.startsWith('{')) as string
    expect(JSON.parse(claims)).toMatchObject({ sub: CALLER, role: 'authenticated' })
  })

  it('scopes the settings to the transaction, so a pooled connection cannot leak an identity', async () => {
    // `true` on set_config is the transaction-local flag. Without it the next
    // request on the same pooled connection would inherit this caller.
    await withUser(CALLER, async () => null)
    const configCalls = statements().filter((s) => /set_config/.test(s))
    expect(configCalls.length).toBeGreaterThan(0)
    // The third argument to set_config is the transaction-local flag.
    for (const sql of configCalls) expect(sql).toMatch(/,\s*true\s*\)/)
    // And the role switch is `set local`, which unwinds with the transaction.
    expect(statements().some((s) => /set local role/i.test(s))).toBe(true)
  })

  it('returns whatever the work returned', async () => {
    await expect(withUser(CALLER, async () => ({ ok: 1 }))).resolves.toEqual({ ok: 1 })
  })

  it('hands the work a client it can query through', async () => {
    await withUser(CALLER, async (db) => db.query('select 1'))
    expect(statements()).toContain('select 1')
  })

  it('rolls back when the work throws', async () => {
    await expect(
      withUser(CALLER, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(statements().some((s) => /^rollback/i.test(s))).toBe(true)
  })

  it('rethrows the original failure rather than swallowing it', async () => {
    const original = Object.assign(new Error('denied'), { code: '42501' })
    await expect(
      withUser(CALLER, async () => {
        throw original
      }),
    ).rejects.toBe(original)
  })

  it('returns the connection to the pool whatever happened', async () => {
    await withUser(CALLER, async () => null)
    expect(client.release).toHaveBeenCalledTimes(1)

    client.release.mockClear()
    await withUser(CALLER, async () => {
      throw new Error('boom')
    }).catch(() => {})
    expect(client.release).toHaveBeenCalledTimes(1)
  })

  it('still releases when even the rollback fails', async () => {
    // A broken connection must not leak. The pool discards it either way.
    client.query.mockImplementation(async (sql: string) => {
      if (/rollback/i.test(String(sql))) throw new Error('connection gone')
      return { rows: [] as unknown[], rowCount: 0 }
    })
    await withUser(CALLER, async () => {
      throw new Error('boom')
    }).catch(() => {})
    expect(client.release).toHaveBeenCalled()
  })
})

describe('withAdmin', () => {
  it('does not drop to the authenticated role', async () => {
    // The deliberate exception, for the few things no user context can do.
    await withAdmin(async (db) => db.query('select 1'))
    expect(statements().some((s) => /set local role authenticated/i.test(s))).toBe(false)
  })

  it('releases its connection too', async () => {
    await withAdmin(async () => null)
    expect(client.release).toHaveBeenCalled()
  })
})

describe('insertMany', () => {
  // Typed loosely on purpose: what matters is the SQL and the values, not the
  // full pg client surface.
  const db = {
    query: vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [], rowCount: 0 })),
  } as unknown as { query: ReturnType<typeof vi.fn> } & Parameters<typeof insertMany>[0]

  beforeEach(() => db.query.mockClear())

  it('does nothing at all for no rows', async () => {
    await insertMany(db, 'public.attempts', ['a', 'b'], [])
    expect(db.query).not.toHaveBeenCalled()
  })

  it('writes every row in one statement', async () => {
    await insertMany(db, 'public.attempts', ['a', 'b'], [
      [1, 2],
      [3, 4],
    ])
    expect(db.query).toHaveBeenCalledTimes(1)
    const [sql, values] = db.query.mock.calls[0]!
    expect(String(sql)).toContain('public.attempts')
    expect(values).toEqual([1, 2, 3, 4])
  })

  it('parameterises rather than interpolating', async () => {
    await insertMany(db, 'public.attempts', ['a'], [["'; drop table attempts;--"]])
    const [sql, values] = db.query.mock.calls[0]!
    expect(String(sql)).not.toContain('drop table')
    expect(values).toEqual(["'; drop table attempts;--"])
  })

  it('numbers the placeholders across rows', async () => {
    await insertMany(db, 't', ['a', 'b'], [
      [1, 2],
      [3, 4],
    ])
    const sql = String(db.query.mock.calls[0]![0])
    expect(sql).toContain('$1')
    expect(sql).toContain('$4')
  })

  it('chunks a very long round rather than blowing the parameter limit', async () => {
    // Postgres caps a statement at 65535 bound parameters and a long practice
    // session really can produce thousands of attempts.
    const rows = Array.from({ length: 40_000 }, (_, i) => [i, i])
    await insertMany(db, 't', ['a', 'b'], rows)
    expect(db.query.mock.calls.length).toBeGreaterThan(1)
    for (const [, values] of db.query.mock.calls) {
      expect((values as unknown[]).length).toBeLessThanOrEqual(65535)
    }
  })

  it('carries a conflict clause through when one is given', async () => {
    await insertMany(db, 't', ['a'], [[1]], 'on conflict do nothing')
    expect(String(db.query.mock.calls[0]![0])).toContain('on conflict do nothing')
  })
})

describe('the environment', () => {
  const base = {
    DATABASE_URL: 'postgres://localhost/test',
    SUPABASE_URL: 'https://test.supabase.co',
    NODE_ENV: 'test',
  }

  async function loadEnv(over: Record<string, string | undefined>) {
    vi.resetModules()
    const previous = process.env
    process.env = { ...base, ...over } as NodeJS.ProcessEnv
    try {
      return await vi.importActual<typeof import('./env.js')>('./env.js')
    } finally {
      process.env = previous
    }
  }

  it('accepts a minimal, valid environment', async () => {
    const mod = await loadEnv({})
    expect(mod.env.DATABASE_URL).toBe('postgres://localhost/test')
  })

  it('treats a blank optional secret as absent', async () => {
    // Both .env files and App Platform hand you `KEY=` rather than omitting
    // the key, and zod's .optional() only accepts undefined — so without this
    // deliberately blanking a secret would stop the service booting.
    const mod = await loadEnv({ SUPABASE_JWT_SECRET: '' })
    expect(mod.env.SUPABASE_JWT_SECRET).toBeUndefined()
  })

  it('keeps a secret that was actually set', async () => {
    const secret = 'a-secret-long-enough-to-sign-with'
    const mod = await loadEnv({ SUPABASE_JWT_SECRET: secret })
    expect(mod.env.SUPABASE_JWT_SECRET).toBe(secret)
  })

  it('knows when it is in production', async () => {
    const mod = await loadEnv({ NODE_ENV: 'production' })
    expect(mod.isProduction).toBe(true)
  })

  it('splits the allowed web origins into a list', async () => {
    const mod = await loadEnv({ WEB_ORIGINS: 'https://a.test, https://b.test' })
    expect(mod.webOrigins).toEqual(['https://a.test', 'https://b.test'])
  })

  it('refuses to start without a database', async () => {
    // Exiting loudly beats booting into a service that cannot serve anything.
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exited')
    }) as never)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(loadEnv({ DATABASE_URL: undefined })).rejects.toThrow()
    expect(exit).toHaveBeenCalledWith(1)
    exit.mockRestore()
  })
})
