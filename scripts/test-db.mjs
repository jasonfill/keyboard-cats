// Run the Row Level Security suite against the local Supabase stack.
//
// The tests are psql scripts — they use \set, \gset and \echo to switch
// identity mid-file — so they need psql itself, not a driver. The Supabase CLI
// does not ship one, hence the search below.

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function findPsql() {
  try {
    return execFileSync('which', ['psql'], { encoding: 'utf8' }).trim()
  } catch {
    /* not on PATH; try the usual Homebrew spots */
  }
  const candidates = [
    '/usr/local/opt/postgresql@15/bin/psql',
    '/opt/homebrew/opt/postgresql@15/bin/psql',
    '/usr/local/opt/libpq/bin/psql',
    '/opt/homebrew/opt/libpq/bin/psql',
  ]
  return candidates.find((c) => existsSync(c)) ?? null
}

const psql = findPsql()
if (!psql) {
  console.error(
    '\npsql not found. The RLS tests are psql scripts, so they need the client:\n' +
      '  brew install libpq && brew link --force libpq\n',
  )
  process.exit(1)
}

let dbUrl
try {
  const raw = execFileSync('supabase', ['status', '-o', 'env'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  dbUrl = /^\s*DB_URL\s*=\s*"?([^"\n]+)"?/m.exec(raw)?.[1]
} catch {
  console.error('\nThe local stack is not running. Start it with:\n  npm run db:start\n')
  process.exit(1)
}

if (!dbUrl) {
  console.error('\nCould not find DB_URL in `supabase status -o env`.\n')
  process.exit(1)
}

const testFile = join(root, 'supabase/tests/0003_learners_test.sql')
console.log(`running ${testFile}\n`)

try {
  const out = execFileSync(psql, [dbUrl, '-v', 'ON_ERROR_STOP=1', '-q', '-f', testFile], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const passes = (out.match(/pass:/g) ?? []).length
  console.log(out.replace(/^psql:[^ ]*: /gm, ''))
  console.log(`\n${passes} security assertion(s) passed`)
} catch (err) {
  const detail = err instanceof Error && 'stderr' in err ? String(err.stderr) : String(err)
  console.error(detail)
  console.error('\nRLS tests FAILED')
  process.exit(1)
}
