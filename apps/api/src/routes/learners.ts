// Learners and their guardians.
//
// Every handler runs through `withUser`, so RLS has already decided what the
// caller can see before a single line here executes. That is why a "not found"
// and a "not yours" collapse into the same 404: from inside the transaction
// they are genuinely the same thing, and telling them apart would leak the
// existence of other people's children.

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { callerOf, requireCaller } from '../auth.js'
import { withUser } from '../db.js'
import { badRequest, notFound } from '../errors.js'
import { toGuardian, toLearner } from '../mappers.js'

const uuid = z.string().uuid('That is not a valid id')

const newLearnerSchema = z.object({
  displayName: z.string().trim().min(1, 'A name is required').max(40),
  avatarEmoji: z.string().trim().min(1).max(8).optional(),
  gradeHint: z.number().int().min(0).max(12).nullable().optional(),
  birthYear: z
    .number()
    .int()
    .min(1900)
    .max(new Date().getFullYear())
    .nullable()
    .optional(),
})

const patchLearnerSchema = z
  .object({
    displayName: z.string().trim().min(1).max(40).optional(),
    avatarEmoji: z.string().trim().min(1).max(8).optional(),
    gradeHint: z.number().int().min(0).max(12).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' })

const inviteSchema = z.object({
  role: z.enum(['parent', 'teacher']).default('parent'),
  purpose: z.enum(['guardian', 'self_login']).default('guardian'),
  ttlHours: z.number().int().min(1).max(168).default(24),
})

const guardianPatchSchema = z.object({
  canManageContent: z.boolean(),
})

// Input pinned to `unknown` so T binds to the schema's output type.
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    throw badRequest(result.error.issues[0]?.message ?? 'That request was not valid')
  }
  return result.data
}

export async function learnerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireCaller)

  // Everyone this caller can see: owned, guarded, or themselves. No filter —
  // the policy is the filter.
  app.get('/learners', async (request) => {
    const caller = callerOf(request)
    const learners = await withUser(caller.id, async (db) => {
      const { rows } = await db.query(
        'select * from public.learners order by created_at asc',
      )
      return rows.map(toLearner)
    })
    return { learners }
  })

  app.post('/learners', async (request, reply) => {
    const caller = callerOf(request)
    const body = parse(newLearnerSchema, request.body)

    const learner = await withUser(caller.id, async (db) => {
      const { rows } = await db.query(
        `insert into public.learners (owner_id, display_name, avatar_emoji, grade_hint, birth_year)
         values ($1, $2, $3, $4, $5)
         returning *`,
        [
          caller.id,
          body.displayName,
          body.avatarEmoji ?? '🐱',
          body.gradeHint ?? null,
          body.birthYear ?? null,
        ],
      )
      const row = rows[0]
      if (!row) throw badRequest('The learner could not be created')
      return toLearner(row)
    })

    reply.code(201)
    return { learner }
  })

  app.patch('/learners/:id', async (request) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)
    const body = parse(patchLearnerSchema, request.body)

    const learner = await withUser(caller.id, async (db) => {
      // Built as a sparse update so an absent key means "leave it alone" while
      // an explicit null means "clear it".
      const sets: string[] = []
      const values: unknown[] = []
      const set = (column: string, value: unknown) => {
        values.push(value)
        sets.push(`${column} = $${values.length}`)
      }
      if (body.displayName !== undefined) set('display_name', body.displayName)
      if (body.avatarEmoji !== undefined) set('avatar_emoji', body.avatarEmoji)
      if (body.gradeHint !== undefined) set('grade_hint', body.gradeHint)

      values.push(id)
      const { rows } = await db.query(
        `update public.learners set ${sets.join(', ')} where id = $${values.length} returning *`,
        values,
      )
      const row = rows[0]
      if (!row) throw notFound('No such learner')
      return toLearner(row)
    })

    return { learner }
  })

  app.delete('/learners/:id', async (request, reply) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)

    await withUser(caller.id, async (db) => {
      const { rowCount } = await db.query('delete from public.learners where id = $1', [id])
      // Only the owner has a delete policy, so a guardian gets 404 here rather
      // than a 403 — which is the right answer: they cannot delete it, and
      // saying "forbidden" would confirm it exists.
      if (!rowCount) throw notFound('No such learner')
    })

    reply.code(204)
    return null
  })

  // --- guardians -----------------------------------------------------------

  app.get('/learners/:id/guardians', async (request) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)

    const guardians = await withUser(caller.id, async (db) => {
      const { rows } = await db.query(
        `select g.*, p.display_name
           from public.guardian_links g
           left join public.profiles p on p.id = g.guardian_id
          where g.learner_id = $1
          order by g.created_at asc`,
        [id],
      )
      return rows.map(toGuardian)
    })

    return { guardians }
  })

  app.patch('/learners/:id/guardians/:guardianId', async (request) => {
    const caller = callerOf(request)
    const { id, guardianId } = parse(
      z.object({ id: uuid, guardianId: uuid }),
      request.params,
    )
    const body = parse(guardianPatchSchema, request.body)

    const guardian = await withUser(caller.id, async (db) => {
      const { rows } = await db.query(
        `update public.guardian_links set can_manage_content = $1
          where learner_id = $2 and guardian_id = $3
          returning *`,
        [body.canManageContent, id, guardianId],
      )
      const row = rows[0]
      if (!row) throw notFound('No such guardian link')
      return toGuardian(row)
    })

    return { guardian }
  })

  app.delete('/learners/:id/guardians/:guardianId', async (request, reply) => {
    const caller = callerOf(request)
    const { id, guardianId } = parse(
      z.object({ id: uuid, guardianId: uuid }),
      request.params,
    )

    await withUser(caller.id, async (db) => {
      const { rowCount } = await db.query(
        'delete from public.guardian_links where learner_id = $1 and guardian_id = $2',
        [id, guardianId],
      )
      if (!rowCount) throw notFound('No such guardian link')
    })

    reply.code(204)
    return null
  })

  // --- invites -------------------------------------------------------------

  app.post('/learners/:id/invites', async (request, reply) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)
    const body = parse(inviteSchema, request.body ?? {})

    const invite = await withUser(caller.id, async (db) => {
      // The RPC is owner-only and raises insufficient_privilege otherwise,
      // which the error mapper turns into a 403.
      const { rows } = await db.query(
        'select public.mint_link_invite($1, $2, $3, $4::interval) as code',
        [id, body.role, body.purpose, `${body.ttlHours} hours`],
      )
      const code = rows[0]?.code as string | undefined
      if (!code) throw badRequest('Could not create an invite')

      const { rows: detail } = await db.query(
        'select expires_at from public.link_invites where code = $1',
        [code],
      )
      return { code, expiresAt: detail[0]?.expires_at ?? null, purpose: body.purpose }
    })

    reply.code(201)
    return { invite }
  })
}

export async function inviteRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireCaller)

  app.post('/invites/redeem', async (request) => {
    const caller = callerOf(request)
    const { code } = parse(
      z.object({ code: z.string().trim().min(4).max(32) }),
      request.body,
    )

    const learnerId = await withUser(caller.id, async (db) => {
      const { rows } = await db.query('select public.redeem_link_invite($1) as learner_id', [
        code.toUpperCase(),
      ])
      return rows[0]?.learner_id as string | undefined
    })

    if (!learnerId) throw badRequest('That code is not valid any more')
    return { learnerId }
  })
}
