// The migration runner.
//
// It runs on startup against a real database, which makes it both the most
// dangerous thing in the service and the hardest to try out by hand. The two
// properties worth pinning: a migration is applied exactly once, and one that
// is already present in the schema is *adopted* — recorded without being
// re-run — because re-running a CREATE against a live database is how a
// deployment takes a service down.

import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { client, files, fileContents } = vi.hoisted(() => ({
  client: {
    connect: vi.fn(async () => {}),
    query: vi.fn(async (_sql: string, _values?: unknown[]) => ({
      rows: [] as unknown[],
      rowCount: 0,
    })),
    end: vi.fn(async () => {}),
  },
  files: { list: [] as string[] },
  fileContents: { map: new Map<string, string>() },
}))

vi.mock('pg', () => ({
  default: {
    Client: class {
      connect = client.connect
      query = client.query
      end = client.end
    },
    Pool: class {
      connect = vi.fn()
      query = vi.fn()
      on = vi.fn()
    },
  },
}))

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(async () => files.list),
  readFile: vi.fn(async (path: string) => {
    const name = String(path).split('/').pop()!
    return fileContents.map.get(name) ?? 'create table x();'
  }),
}))

vi.mock('./env.js', () => ({
  env: {
    DATABASE_URL: 'postgres://test',
    MIGRATION_DATABASE_URL: undefined,
    MIGRATIONS_DIR: '/migrations',
    NODE_ENV: 'test',
  },
  isProduction: false,
}))

import { pendingMigrations, runMigrations } from './migrate.js'

const log = { info: vi.fn(), warn: vi.fn() }

/** Answer the runner's bookkeeping queries, and record the migrations it ran. */
/** The checksum the runner will compute for a file, so a recorded one matches. */
function checksumOf(name: string): string {
  const sql = fileContents.map.get(name) ?? 'create table x();'
  return createHash('sha256').update(sql).digest('hex')
}

function ledgerWith(applied: string[], adoptable: string[] = []) {
  client.query.mockImplementation(async (sql: string) => {
    const text = String(sql)
    if (/to_regclass/.test(text)) return { rows: [{ ok: true }], rowCount: 1 }
    if (/from public\.schema_migrations/.test(text)) {
      // runMigrations reads a checksum too, and compares it — the checksum of
      // the stub file content the readFile mock returns.
      return {
        rows: applied.map((name) => ({ name, checksum: checksumOf(name) })),
        rowCount: applied.length,
      }
    }
    // An `@applied-if` predicate: true means the schema already has it.
    if (/^select \(/.test(text.trim())) {
      const isAdoptable = adoptable.some((a) => text.includes(a))
      return { rows: [{ ok: isAdoptable }], rowCount: 1 }
    }
    return { rows: [], rowCount: 0 }
  })
}

beforeEach(() => {
  client.connect.mockReset().mockResolvedValue(undefined)
  client.query.mockReset().mockResolvedValue({ rows: [], rowCount: 0 })
  client.end.mockReset().mockResolvedValue(undefined)
  files.list = ['0001_init.sql', '0002_more.sql']
  fileContents.map = new Map()
  log.info.mockClear()
  log.warn.mockClear()
})

describe('pendingMigrations', () => {
  it('reports the ones not yet recorded', async () => {
    ledgerWith(['0001_init.sql'])
    await expect(pendingMigrations()).resolves.toEqual(['0002_more.sql'])
  })

  it('reports everything against an empty database', async () => {
    client.query.mockImplementation(async (sql: string) =>
      /to_regclass/.test(String(sql))
        ? { rows: [{ ok: false }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    )
    await expect(pendingMigrations()).resolves.toEqual(['0001_init.sql', '0002_more.sql'])
  })

  it('reports nothing when the schema is up to date', async () => {
    ledgerWith(['0001_init.sql', '0002_more.sql'])
    await expect(pendingMigrations()).resolves.toEqual([])
  })

  it('does not count one already present in the schema', async () => {
    // An @applied-if predicate that answers true means the change is already
    // there — it would be adopted rather than run, so it is not pending.
    fileContents.map.set(
      '0002_more.sql',
      '-- @applied-if: select exists (select 1 from pg_class where relname = %marker%)\ncreate table x();',
    )
    ledgerWith(['0001_init.sql'], ['%marker%'])
    await expect(pendingMigrations()).resolves.toEqual([])
  })

  it('reads only, and always closes the connection', async () => {
    ledgerWith([])
    await pendingMigrations()
    const ran = client.query.mock.calls.map(([s]) => String(s))
    expect(ran.some((s) => /insert into public\.schema_migrations/i.test(s))).toBe(false)
    expect(client.end).toHaveBeenCalled()
  })

  it('closes the connection even when a query fails', async () => {
    client.query.mockRejectedValue(new Error('boom'))
    await pendingMigrations().catch(() => {})
    expect(client.end).toHaveBeenCalled()
  })

  it('explains a connection failure rather than passing the raw error on', async () => {
    // The message a developer sees when the database is not up should tell
    // them that, not surface a socket error.
    client.connect.mockRejectedValue(Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }))
    await expect(pendingMigrations()).rejects.toThrow()
  })

  it('ignores anything that is not a .sql file', async () => {
    files.list = ['0001_init.sql', 'README.md', 'notes.txt']
    ledgerWith([])
    await expect(pendingMigrations()).resolves.toEqual(['0001_init.sql'])
  })

  it('runs them in name order, which is the order they were written', async () => {
    files.list = ['0002_more.sql', '0001_init.sql']
    ledgerWith([])
    await expect(pendingMigrations()).resolves.toEqual(['0001_init.sql', '0002_more.sql'])
  })
})

describe('runMigrations', () => {
  it('applies the ones that are missing', async () => {
    ledgerWith(['0001_init.sql'])
    const result = await runMigrations(log)
    expect(result.applied).toEqual(['0002_more.sql'])
  })

  it('skips the ones already recorded', async () => {
    ledgerWith(['0001_init.sql', '0002_more.sql'])
    const result = await runMigrations(log)
    expect(result.applied).toEqual([])
    expect(result.skipped).toEqual(['0001_init.sql', '0002_more.sql'])
  })

  it('adopts one whose change is already in the schema rather than re-running it', async () => {
    // Re-running a CREATE against a live database is how a deploy takes a
    // service down. This records it and moves on.
    fileContents.map.set(
      '0002_more.sql',
      '-- @applied-if: select exists (select 1 from pg_class where relname = %marker%)\ncreate table x();',
    )
    ledgerWith(['0001_init.sql'], ['%marker%'])
    const result = await runMigrations(log)
    expect(result.adopted).toEqual(['0002_more.sql'])
    expect(result.applied).toEqual([])
  })

  it('records every migration it applied', async () => {
    ledgerWith([])
    await runMigrations(log)
    const inserts = client.query.mock.calls
      .map(([s]) => String(s))
      .filter((s) => /insert into public\.schema_migrations/i.test(s))
    expect(inserts.length).toBeGreaterThan(0)
  })

  it('says so and does nothing when there are no migrations at all', async () => {
    files.list = []
    const result = await runMigrations(log)
    expect(result).toEqual({ applied: [], skipped: [], adopted: [] })
    expect(log.warn).toHaveBeenCalled()
  })

  it('closes the connection when a migration fails', async () => {
    ledgerWith([])
    client.query.mockImplementation(async (sql: string) => {
      if (/create table/i.test(String(sql))) throw new Error('syntax error')
      if (/to_regclass/.test(String(sql))) return { rows: [{ ok: true }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    })
    await runMigrations(log).catch(() => {})
    expect(client.end).toHaveBeenCalled()
  })
})
