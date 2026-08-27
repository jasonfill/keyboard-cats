// Migration CLI.
//
// The startup runner covers deploys; this covers the other half — looking at a
// database and asking what state it is actually in, without booting a server or
// opening a SQL editor.
//
//   npm run migrate:status   what is applied, what is pending, what has drifted
//   npm run migrate          apply everything pending
//
// Deliberately no `down`. The migrations this project has are column renames
// across ten tables and a backfill; a reverse for that is not something anyone
// should be able to run against production by typing one word. Recovery is a
// forward migration or a restore, which is the honest answer for a schema
// carrying real learner data.

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { env } from '../env.js'
import { runMigrations } from '../migrate.js'

const here = dirname(fileURLToPath(import.meta.url))

function migrationsDir(): string {
  const candidates = [
    env.MIGRATIONS_DIR,
    join(here, '..', 'migrations'),
    resolve(here, '../../../../supabase/migrations'),
  ].filter((c): c is string => Boolean(c))
  for (const c of candidates) if (existsSync(c)) return c
  throw new Error('No migrations directory found')
}

const log = {
  info: (msg: string) => console.log(msg),
  warn: (msg: string) => console.warn(`warning: ${msg}`),
}

async function status(): Promise<number> {
  const dir = migrationsDir()
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

  const client = new pg.Client({
    connectionString: env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL,
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  })
  await client.connect()

  try {
    const exists = await client.query(
      `select to_regclass('public.schema_migrations') is not null as present`,
    )
    const ledger = new Map<string, { checksum: string; applied_at: Date }>()
    if (exists.rows[0]?.present) {
      const { rows } = await client.query(
        'select name, checksum, applied_at from public.schema_migrations',
      )
      for (const row of rows) ledger.set(row.name, row)
    }

    let pending = 0
    let drifted = 0

    console.log(`\n  ${dir}\n`)
    for (const name of files) {
      const sql = await readFile(join(dir, name), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const record = ledger.get(name)

      if (!record) {
        pending += 1
        console.log(`  pending  ${name}`)
      } else if (record.checksum !== checksum) {
        drifted += 1
        console.log(`  CHANGED  ${name}  (applied ${record.applied_at.toISOString().slice(0, 10)})`)
      } else {
        console.log(`  applied  ${name}  ${record.applied_at.toISOString().slice(0, 10)}`)
      }
    }

    console.log(
      `\n  ${files.length} migration(s): ${files.length - pending - drifted} applied, ` +
        `${pending} pending, ${drifted} changed since applying\n`,
    )
    // Drift is worth a non-zero exit in CI; pending on its own is not an error.
    return drifted ? 1 : 0
  } finally {
    await client.end()
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'up'

  if (command === 'status') {
    process.exit(await status())
  }

  if (command === 'up') {
    const result = await runMigrations(log)
    console.log(
      result.applied.length
        ? `applied ${result.applied.length}: ${result.applied.join(', ')}`
        : 'nothing to apply; schema is up to date',
    )
    process.exit(0)
  }

  console.error(`Unknown command "${command}". Try: status | up`)
  process.exit(2)
}

void main()
