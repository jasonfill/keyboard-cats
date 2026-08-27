// Postgres access.
//
// The API is the only thing that talks to the database, but it deliberately
// does *not* run as a role that bypasses Row Level Security. Every request-
// scoped query runs inside a transaction that first drops to the `authenticated`
// role and presents the caller's user id the way Supabase's `auth.uid()` reads
// it. The policies written in migration 0003 therefore still enforce, and a bug
// in a route handler cannot hand one family another family's rows.
//
// `withAdmin` is the deliberate exception, for the few things no user context
// can do: minting child credentials, billing webhooks.

import pg from 'pg'
import { env, isProduction } from './env.js'

export type Queryable = Pick<pg.PoolClient, 'query'>

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  // Supabase terminates TLS with a certificate chain Node does not ship a root
  // for; the connection is still encrypted.
  ssl: isProduction ? { rejectUnauthorized: false } : undefined,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

pool.on('error', (err) => {
  console.error('[db] idle client error', err)
})

/**
 * Run `fn` as the given user, with RLS in force.
 *
 * The claims are set before the role switch so the more privileged connecting
 * role does the setting; both are transaction-local and unwind on commit or
 * rollback, so a pooled connection never leaks one caller's identity into the
 * next request.
 */
export async function withUser<T>(
  userId: string,
  fn: (client: Queryable) => Promise<T>,
): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId])
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ])
    await client.query('set local role authenticated')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    try {
      await client.query('rollback')
    } catch {
      /* the connection is already broken; the pool will discard it */
    }
    throw err
  } finally {
    client.release()
  }
}

/** Run `fn` with RLS bypassed. Reach for this only when there is no caller. */
export async function withAdmin<T>(fn: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    try {
      await client.query('rollback')
    } catch {
      /* discard */
    }
    throw err
  } finally {
    client.release()
  }
}

/**
 * Turn a connection failure into something that says what to do about it.
 *
 * `db.<ref>.supabase.co` is Supabase's legacy direct-connection host. It is
 * IPv6-only unless the project buys the IPv4 add-on, so on a network without
 * IPv6 it fails as ENOTFOUND — which reads like a typo rather than what it is.
 */
export function explainConnectionError(err: unknown): Error {
  const detail = err as { code?: string; hostname?: string; message?: string }

  if (detail?.code === 'ENOTFOUND' && /^db\..+\.supabase\.co$/.test(detail.hostname ?? '')) {
    return new Error(
      `Cannot resolve ${detail.hostname}.\n\n` +
        `That is Supabase's legacy direct-connection host, which is IPv6-only unless the ` +
        `project has the IPv4 add-on — so it fails from most networks.\n\n` +
        `Use the pooler instead (dashboard -> Connect):\n` +
        `  DATABASE_URL            transaction pooler, port 6543\n` +
        `  MIGRATION_DATABASE_URL  session pooler, port 5432\n\n` +
        `If you already changed apps/api/.env and still see this, the value is probably ` +
        `still exported in your shell — that takes precedence over the file.`,
    )
  }

  return err instanceof Error ? err : new Error(String(err))
}

export async function closePool(): Promise<void> {
  await pool.end()
}
