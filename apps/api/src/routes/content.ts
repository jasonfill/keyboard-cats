// Turning a document into practice material.
//
// The shape worth noticing: **nothing here spends money without saying what it
// will cost first.** A source is registered and read for its page count, the
// estimate comes back to the client, and only a second, explicit call starts
// the run. That is one more round trip and it is the difference between a
// parent choosing to spend twenty credits and discovering they did.

import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  authorizeJob,
  creditBalance,
  estimateJob,
  type CreditEntry,
} from '@whizzo/shared'
import { callerOf, requireCaller } from '../auth.js'
import { withUser } from '../db.js'
import { badRequest, notFound } from '../errors.js'
import { env } from '../env.js'
import { toJobView, type JobRow } from '../content/jobs.js'
import { googleExportUrl, screenUrl } from '../content/fetch.js'

const uuid = z.string().uuid('That is not a valid id')

const linkSchema = z.object({ url: z.string().min(1).max(2000) })

const buildSchema = z.object({
  topicIds: z.array(z.string().max(60)).max(20).default([]),
  /** Half the credits, lands within a day. */
  noRush: z.boolean().default(false),
  target: z
    .union([z.literal('library'), z.object({ learnerIds: z.array(uuid).min(1).max(40) })])
    .default('library'),
})

/* eslint-disable @typescript-eslint/no-explicit-any */
function toJobRow(row: any): JobRow {
  return {
    id: row.id,
    sourceId: row.source_id,
    status: row.status,
    stageDetail: row.stage_detail ?? {},
    claimedAt: row.claimed_at ? Date.parse(row.claimed_at) : null,
    heartbeatAt: row.heartbeat_at ? Date.parse(row.heartbeat_at) : null,
    attempts: row.attempts ?? 0,
    error: row.error ?? null,
    result: row.result ?? null,
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function contentRoutes(app: FastifyInstance): Promise<void> {
  // Every route here is a grown-up's, and every one of them either spends money
  // or reads what was spent.
  app.addHook('preHandler', requireCaller)

  /**
   * Whether this feature is available at all.
   *
   * A contributor running the API without a key should get a clear answer
   * rather than a 500 from three layers down, and the client should be able to
   * hide the upload door rather than offering something that cannot work.
   */
  const enabled = Boolean(env.ANTHROPIC_API_KEY)

  app.get('/content/status', async (request) => {
    const caller = callerOf(request)
    if (!enabled) return { enabled: false, balance: null }

    const balance = await withUser(caller.id, async (db) => {
      const { rows } = await db.query(
        `select kind, bucket, credits from public.credit_ledger
          where user_id = $1
             or subscription_id in (select id from public.subscriptions where payer_id = $1)`,
        [caller.id],
      )
      return creditBalance(rows as CreditEntry[])
    })
    return { enabled: true, balance }
  })

  /**
   * Register a link as a source.
   *
   * Screened here and fetched by the runner, so an obviously bad link is
   * refused while the person is still looking at the field rather than in a
   * job that fails a minute later.
   */
  app.post('/content/sources/link', async (request) => {
    if (!enabled) throw badRequest('Document upload is not switched on here.', 'not_enabled')
    const caller = callerOf(request)
    const { url } = linkSchema.parse(request.body)

    const screened = screenUrl(url)
    if (!screened.ok) throw badRequest(screened.message, screened.code)

    const target = googleExportUrl(screened.url) ?? screened.url

    return withUser(caller.id, async (db) => {
      const { rows } = await db.query(
        `insert into public.content_sources
           (owner_user_id, kind, origin, mime, bytes, sha256)
         values ($1, 'link', $2, 'application/octet-stream', 0, $3)
         returning *`,
        [caller.id, target.toString(), await digest(target.toString())],
      )
      const source = rows[0]
      const job = await db.query(
        `insert into public.content_jobs (source_id) values ($1) returning *`,
        [source.id],
      )
      return { sourceId: source.id, job: toJobView(toJobRow(job.rows[0])) }
    })
  })

  /** Watch a run. The client polls this; the row is the only progress there is. */
  app.get('/content/jobs/:id', async (request) => {
    const caller = callerOf(request)
    const { id } = z.object({ id: uuid }).parse(request.params)

    return withUser(caller.id, async (db) => {
      const { rows } = await db.query('select * from public.content_jobs where id = $1', [id])
      // RLS is the filter: from inside the transaction, "not yours" and "not
      // there" are genuinely the same thing.
      if (!rows.length) throw notFound('No such run')
      return { job: toJobView(toJobRow(rows[0])) }
    })
  })

  /**
   * What this document will cost, before anything is spent.
   *
   * Separate from starting the run on purpose. The page count is known once the
   * file is registered, so the estimate is exact — and showing it to the person
   * deciding is the whole reason the two calls are not one.
   */
  app.get('/content/sources/:id/estimate', async (request) => {
    const caller = callerOf(request)
    const { id } = z.object({ id: uuid }).parse(request.params)
    const noRush = z.object({ noRush: z.coerce.boolean().default(false) }).parse(request.query)

    return withUser(caller.id, async (db) => {
      const { rows } = await db.query('select * from public.content_sources where id = $1', [id])
      if (!rows.length) throw notFound('No such document')
      const pages = rows[0].pages ?? 0

      const ledger = await db.query(
        `select kind, bucket, credits from public.credit_ledger
          where user_id = $1
             or subscription_id in (select id from public.subscriptions where payer_id = $1)`,
        [caller.id],
      )
      const balance = creditBalance(ledger.rows as CreditEntry[])
      const covered = await isAnyLearnerCovered(db, caller.id)
      const decision = authorizeJob(balance, pages, { covered, noRush: noRush.noRush })

      return {
        estimate: estimateJob(pages, noRush.noRush),
        balance,
        allowed: decision.ok,
        reason: decision.ok ? null : decision.reason,
      }
    })
  })

  /**
   * Start the run.
   *
   * Refuses here rather than inside the job, so a parent who cannot afford it
   * finds out immediately and the refusal carries the number the next screen
   * needs.
   */
  app.post('/content/sources/:id/build', async (request, reply) => {
    if (!enabled) throw badRequest('Document upload is not switched on here.', 'not_enabled')
    const caller = callerOf(request)
    const { id } = z.object({ id: uuid }).parse(request.params)
    const body = buildSchema.parse(request.body ?? {})

    return withUser(caller.id, async (db) => {
      const { rows } = await db.query('select * from public.content_sources where id = $1', [id])
      if (!rows.length) throw notFound('No such document')

      const ledger = await db.query(
        `select kind, bucket, credits from public.credit_ledger
          where user_id = $1
             or subscription_id in (select id from public.subscriptions where payer_id = $1)`,
        [caller.id],
      )
      const balance = creditBalance(ledger.rows as CreditEntry[])
      const covered = await isAnyLearnerCovered(db, caller.id)
      const decision = authorizeJob(balance, rows[0].pages ?? 0, { covered, noRush: body.noRush })

      if (!decision.ok) {
        reply.code(402)
        return { error: decision.reason, estimate: decision.estimate, balance }
      }

      const job = await db.query(
        `insert into public.content_jobs (source_id, stage_detail)
         values ($1, $2) returning *`,
        [id, JSON.stringify({ topicIds: body.topicIds, noRush: body.noRush, target: body.target })],
      )
      return { job: toJobView(toJobRow(job.rows[0])) }
    })
  })

  /**
   * Accept a draft.
   *
   * One action on the whole set, because the three-action setup budget does not
   * survive line-by-line review being mandatory. Editing exists and nobody has
   * to use it.
   */
  app.post('/library/decks/:id/accept', async (request) => {
    const caller = callerOf(request)
    const { id } = z.object({ id: uuid }).parse(request.params)

    return withUser(caller.id, async (db) => {
      const { rows } = await db.query(
        `update public.decks set accepted_at = now(), updated_at = now()
          where id = $1 and accepted_at is null
          returning id, accepted_at`,
        [id],
      )
      // Already accepted is not an error — a second tap on a slow connection
      // should not read as a failure.
      if (!rows.length) {
        const existing = await db.query('select id, accepted_at from public.decks where id = $1', [id])
        if (!existing.rows.length) throw notFound('No such set')
        return { acceptedAt: Date.parse(existing.rows[0].accepted_at) }
      }
      return { acceptedAt: Date.parse(rows[0].accepted_at) }
    })
  })

  app.delete('/content/sources/:id', async (request) => {
    const caller = callerOf(request)
    const { id } = z.object({ id: uuid }).parse(request.params)
    await withUser(caller.id, async (db) => {
      await db.query('delete from public.content_sources where id = $1', [id])
    })
    return { ok: true }
  })
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Whether this caller covers anybody, which is what lifts the page cap.
 *
 * Scoped by the caller rather than left to row-level security. RLS does filter
 * `learners` here, so both give the same answer today — but the rule is a
 * business rule, and one that silently becomes "is anyone in the system
 * covered?" the first time it is called without a user context is not one worth
 * relying on. The runner is exactly that context.
 */
async function isAnyLearnerCovered(db: any, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    `select 1
       from public.learners l
      where (
              l.owner_id = $1
              or exists (
                select 1 from public.guardian_links g
                 where g.learner_id = l.id and g.guardian_id = $1
              )
            )
        and public.is_learner_covered(l.id)
      limit 1`,
    [userId],
  )
  return rows.length > 0
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function digest(value: string): Promise<string> {
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(value).digest('hex')
}
