// Provisioned sign-in: how a child gets onto their own tablet without ever
// handing us an email address.
//
// The shape of the credential matters. A four-digit PIN is not a password, so
// the PIN is never the Supabase password: the API stretches it with an HMAC
// under a server-held secret, and *that* is the password. Someone who learns a
// child's PIN still cannot sign in without CHILD_LOGIN_SECRET, and the API
// stores neither the PIN nor the derived password — the PIN's bcrypt hash lives
// in learner_credentials purely so a wrong PIN can be rejected before we ever
// talk to the auth server.

import { createHmac, randomInt } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { callerOf, requireCaller } from '../auth.js'
import { withAdmin, withUser } from '../db.js'
import { badRequest, forbidden, notFound, unauthorized, HttpError } from '../errors.js'
import { env } from '../env.js'

const uuid = z.string().uuid('That is not a valid id')

// No 0/O/1/I: these get read aloud and typed by seven-year-olds.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'That request was not valid')
  }
  return result.data
}

function requireSecret(): string {
  if (!env.CHILD_LOGIN_SECRET) {
    throw new HttpError(
      503,
      'Child sign-in is not configured on this server',
      'not_configured',
    )
  }
  return env.CHILD_LOGIN_SECRET
}

function adminClient() {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(503, 'Child sign-in is not configured on this server', 'not_configured')
  }
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** The real Supabase password: high entropy, never stored, always recomputable. */
function derivePassword(learnerId: string, pin: string): string {
  return createHmac('sha256', requireSecret())
    .update(`${learnerId}:${pin}`)
    .digest('base64url')
}

function generateCode(length = 8): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return out
}

export async function childLoginAdminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireCaller)

  /**
   * Turn on (or reset) a child's own sign-in. Owner-only, and deliberately not
   * age-gated: this is the mode that exists *so that* an under-13 never needs
   * their own email.
   */
  app.post('/learners/:id/child-login', async (request, reply) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)
    const { pin } = parse(
      z.object({ pin: z.string().regex(/^\d{4,8}$/, 'A PIN is 4 to 8 digits') }),
      request.body,
    )

    // Ownership is checked here rather than left to RLS because the work below
    // happens through the admin API, which has no policies to answer to.
    const learner = await withUser(caller.id, async (db) => {
      const { rows } = await db.query(
        'select id, display_name, owner_id, auth_kind, auth_user_id from public.learners where id = $1',
        [id],
      )
      const row = rows[0]
      if (!row) throw notFound('No such learner')
      if (row.owner_id !== caller.id) {
        throw forbidden('Only the owner can set up a sign-in for this learner')
      }
      if (row.auth_kind === 'self') {
        throw badRequest('This learner already signs in with their own account')
      }
      return row as { id: string; display_name: string; auth_user_id: string | null }
    })

    const admin = adminClient()
    const password = derivePassword(id, pin)
    const email = `learner-${id}@${env.CHILD_EMAIL_DOMAIN}`

    let authUserId = learner.auth_user_id

    if (authUserId) {
      // Re-provisioning: the account exists, only the PIN is changing.
      const { error } = await admin.auth.admin.updateUserById(authUserId, { password })
      if (error) throw new HttpError(502, `Could not update the sign-in: ${error.message}`)
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: learner.display_name, provisioned_learner: id },
      })
      if (error || !data.user) {
        throw new HttpError(502, `Could not create the sign-in: ${error?.message ?? 'unknown'}`)
      }
      authUserId = data.user.id
    }

    const loginCode = generateCode()

    // One privileged call does both halves: attaches the auth user to the
    // learner and stores the code plus the PIN's bcrypt hash.
    await withAdmin(async (db) => {
      await db.query('select public.attach_provisioned_login($1,$2,$3,$4)', [
        id,
        authUserId,
        loginCode,
        pin,
      ])
    })

    reply.code(201)
    return { loginCode, learnerId: id }
  })

  app.delete('/learners/:id/child-login', async (request, reply) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)

    const learner = await withUser(caller.id, async (db) => {
      const { rows } = await db.query(
        'select owner_id, auth_user_id, auth_kind from public.learners where id = $1',
        [id],
      )
      const row = rows[0]
      if (!row) throw notFound('No such learner')
      if (row.owner_id !== caller.id) throw forbidden('Only the owner can do that')
      if (row.auth_kind !== 'provisioned') throw badRequest('That learner has no provisioned sign-in')
      return row as { auth_user_id: string }
    })

    const admin = adminClient()
    await admin.auth.admin.deleteUser(learner.auth_user_id)

    await withAdmin(async (db) => {
      await db.query('delete from public.learner_credentials where learner_id = $1', [id])
      // The auth user is gone, so auth_user_id has already been nulled by the
      // on-delete-set-null foreign key; bring auth_kind back in line with it.
      await db.query(
        `update public.learners set auth_kind = 'none', auth_user_id = null where id = $1`,
        [id],
      )
    })

    reply.code(204)
    return null
  })
}

export async function childLoginPublicRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Exchange a code and PIN for a real Supabase session.
   *
   * Unauthenticated by necessity — the child has no session yet — and therefore
   * the most attackable surface in the product. Three things defend it: the
   * rate limit wrapped around this route, a database function that is invisible
   * to every role but service_role, and the HMAC stretch, which means the PIN
   * alone is not enough even if someone guesses it.
   */
  app.post('/child-login', async (request) => {
    const { loginCode, pin } = parse(
      z.object({
        loginCode: z.string().trim().min(6).max(24),
        pin: z.string().regex(/^\d{4,8}$/, 'A PIN is 4 to 8 digits'),
      }),
      request.body,
    )

    requireSecret()

    const learnerId = await withAdmin(async (db) => {
      const { rows } = await db.query('select public.authenticate_learner($1,$2) as auth_user_id', [
        loginCode.toUpperCase(),
        pin,
      ])
      const authUserId = rows[0]?.auth_user_id as string | null
      if (!authUserId) return null

      const { rows: learnerRows } = await db.query(
        'select id, display_name from public.learners where auth_user_id = $1',
        [authUserId],
      )
      return learnerRows[0] ?? null
    })

    // One message for a bad code and a bad PIN: telling them apart would turn
    // this into an oracle for which codes exist.
    if (!learnerId) throw unauthorized('That code or PIN is not right')

    const learner = learnerId as { id: string; display_name: string }
    const admin = adminClient()
    const password = derivePassword(learner.id, pin)
    const email = `learner-${learner.id}@${env.CHILD_EMAIL_DOMAIN}`

    const { data, error } = await admin.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      request.log.warn({ err: error }, 'provisioned sign-in failed after PIN check passed')
      throw unauthorized('That code or PIN is not right')
    }

    return {
      learnerId: learner.id,
      displayName: learner.display_name,
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
      },
    }
  })
}
