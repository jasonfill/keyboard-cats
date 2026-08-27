// Delete accounts and everything they own.
//
// Dry run unless you pass --yes, because this is not recoverable. Removing an
// auth user cascades a long way:
//
//   auth.users
//     -> profiles
//     -> learners they OWN            (owner_id, cascade)
//          -> every progress table    (learner_id, cascade)
//          -> decks and word lists
//     -> guardian_links they hold
//     -> learners they merely SIGN IN AS are kept, with auth_user_id nulled
//
// That last line is worth reading twice. Removing a parent removes their
// children's records too. Removing a provisioned child only takes away that
// child's ability to sign in — the learner and all of their progress stay,
// because the parent owns them.
//
//   node scripts/purge-users.mjs                      # show what would go
//   node scripts/purge-users.mjs --yes                # do it
//   node scripts/purge-users.mjs --keep me@x.com --yes

import pg from 'pg'
import { env } from '../dist/env.js'

const args = process.argv.slice(2)
const confirmed = args.includes('--yes')
const keep = new Set(
  args.flatMap((a, i) => (a === '--keep' ? [args[i + 1]?.toLowerCase()] : [])).filter(Boolean),
)

const connectionString = env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL
const host = /@([^:/?]+)/.exec(connectionString)?.[1] ?? 'unknown host'

const client = new pg.Client({
  connectionString,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
})
await client.connect()

try {
  const { rows: users } = await client.query(`
    select
      u.id,
      u.email,
      u.created_at,
      (select count(*) from public.learners l where l.owner_id = u.id)         as owns,
      (select count(*) from public.learners l where l.auth_user_id = u.id)     as signs_in_as,
      (select count(*) from public.attempts a
         join public.learners l on l.id = a.learner_id
        where l.owner_id = u.id)                                              as attempts,
      (select count(*) from public.guardian_links g where g.guardian_id = u.id) as guards
    from auth.users u
    order by u.created_at asc
  `)

  if (!users.length) {
    console.log(`\n  ${host}: no accounts. Nothing to purge.\n`)
    process.exit(0)
  }

  const doomed = users.filter((u) => !keep.has((u.email ?? '').toLowerCase()))
  const spared = users.filter((u) => keep.has((u.email ?? '').toLowerCase()))

  console.log(`\n  database: ${host}`)
  console.log(`  ${users.length} account(s), ${doomed.length} would be removed\n`)

  for (const u of users) {
    const mark = keep.has((u.email ?? '').toLowerCase()) ? 'KEEP  ' : 'remove'
    console.log(
      `  ${mark}  ${(u.email ?? '(no email)').padEnd(34)} ` +
        `owns ${String(u.owns).padStart(2)} learner(s), ` +
        `${String(u.attempts).padStart(5)} attempt(s), ` +
        `guards ${u.guards}` +
        (Number(u.signs_in_as) ? `, signs in as ${u.signs_in_as}` : ''),
    )
  }

  const totals = doomed.reduce(
    (acc, u) => ({
      learners: acc.learners + Number(u.owns),
      attempts: acc.attempts + Number(u.attempts),
    }),
    { learners: 0, attempts: 0 },
  )

  if (!confirmed) {
    console.log(
      `\n  Dry run. This would remove ${doomed.length} account(s), ` +
        `${totals.learners} learner(s) and ${totals.attempts} attempt(s).\n` +
        `  Re-run with --yes to actually do it. There is no undo.\n`,
    )
    process.exit(0)
  }

  if (!doomed.length) {
    console.log('\n  Everything is on the keep list; nothing to do.\n')
    process.exit(0)
  }

  // One transaction: a half-purged database is worse than either outcome.
  await client.query('begin')
  const result = await client.query('delete from auth.users where id = any($1::uuid[])', [
    doomed.map((u) => u.id),
  ])
  await client.query('commit')

  console.log(`\n  removed ${result.rowCount} account(s), ${totals.learners} learner(s)`)
  if (spared.length) console.log(`  kept ${spared.map((u) => u.email).join(', ')}`)

  const { rows: left } = await client.query(`
    select
      (select count(*) from auth.users)       as users,
      (select count(*) from public.learners)  as learners,
      (select count(*) from public.attempts)  as attempts
  `)
  console.log(
    `  remaining: ${left[0].users} account(s), ${left[0].learners} learner(s), ` +
      `${left[0].attempts} attempt(s)\n`,
  )
} catch (err) {
  try {
    await client.query('rollback')
  } catch {
    /* nothing to roll back */
  }
  console.error('\n  purge failed:', err instanceof Error ? err.message : err, '\n')
  process.exitCode = 1
} finally {
  await client.end()
}
