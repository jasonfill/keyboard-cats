// Point the web app and the API at the local Supabase stack.
//
// `supabase start` generates fresh URLs and keys. Rather than have you copy four
// values into two files by hand, this reads them from `supabase status -o env`
// and writes the override files:
//
//   apps/api/.env.local              beats apps/api/.env
//   apps/web/.env.development.local  beats apps/web/.env.local, in dev only
//
// Both are gitignored, and neither touches the files holding your hosted-project
// credentials — switching back is deleting these two.

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let raw
try {
  raw = execFileSync('supabase', ['status', '-o', 'env'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
} catch (err) {
  console.error(
    '\nCould not read the local Supabase status.\n\n' +
      'Is the stack running? Start it with:\n' +
      '  npm run db:start\n\n' +
      `(${err instanceof Error ? err.message.split('\n')[0] : err})\n`,
  )
  process.exit(1)
}

// Field names have drifted across CLI versions; accept either spelling.
const values = {}
for (const line of raw.split('\n')) {
  const match = /^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line)
  if (match?.[1]) values[match[1]] = match[2] ?? ''
}

const pick = (...names) => names.map((n) => values[n]).find((v) => v) ?? ''

const apiUrl = pick('API_URL', 'SUPABASE_URL')
const dbUrl = pick('DB_URL', 'SUPABASE_DB_URL')
const anonKey = pick('ANON_KEY', 'SUPABASE_ANON_KEY')
const serviceKey = pick('SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY')
const jwtSecret = pick('JWT_SECRET', 'SUPABASE_JWT_SECRET')

const missing = Object.entries({ apiUrl, dbUrl, anonKey, serviceKey })
  .filter(([, v]) => !v)
  .map(([k]) => k)

if (missing.length) {
  console.error(`\nThe status output did not include: ${missing.join(', ')}\n`)
  console.error('Raw output was:\n' + raw)
  process.exit(1)
}

// The local stack is a single Postgres with no pooler, so both connection
// strings are the same — and it is session-scoped, so the migration runner's
// advisory lock behaves exactly as it does against the session pooler.
const apiEnv = `# Written by scripts/local-env.mjs — points the API at the local Supabase stack.
# Overrides apps/api/.env. Delete this file to go back to the hosted project.

DATABASE_URL=${dbUrl}
MIGRATION_DATABASE_URL=${dbUrl}
SUPABASE_URL=${apiUrl}
SUPABASE_JWT_SECRET=${jwtSecret}
SUPABASE_SERVICE_ROLE_KEY=${serviceKey}

# Fixed locally so provisioned child logins survive a restart of the stack.
CHILD_LOGIN_SECRET=local-development-child-login-secret-not-for-production-use
CHILD_EMAIL_DOMAIN=no-reply.localhost
WEB_ORIGINS=http://localhost:5173
NODE_ENV=development
`

const webEnv = `# Written by scripts/local-env.mjs — points the SPA at the local Supabase stack.
# Vite loads .env.development.local after .env.local, so this wins in dev only;
# production builds still use apps/web/.env.local. Delete this file to go back.

VITE_SUPABASE_URL=${apiUrl}
VITE_SUPABASE_ANON_KEY=${anonKey}
`

writeFileSync(join(root, 'apps/api/.env.local'), apiEnv, { mode: 0o600 })
writeFileSync(join(root, 'apps/web/.env.development.local'), webEnv, { mode: 0o600 })

console.log('wrote apps/api/.env.local')
console.log('wrote apps/web/.env.development.local')
console.log(`\nlocal Supabase: ${apiUrl}`)
console.log('the hosted-project files are untouched; delete these two to switch back')
