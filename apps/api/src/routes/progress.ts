// A learner's progress: the snapshot the app boots from, and the writes that
// come back out of a round of practice.
//
// Everything here is scoped by `withUser`, so RLS has already decided whether
// this caller may touch this learner. That is why none of these handlers check
// ownership themselves — doing it twice, in two places, with two chances to
// drift, is how authorization bugs happen.

import type { FastifyInstance } from 'fastify'
import type { ProgressSnapshot } from '@whizzo/shared'
import { emptySnapshot, listKey, masteryKey } from '@whizzo/shared'
import { z } from 'zod'
import { callerOf, requireCaller } from '../auth.js'
import { withUser, type Queryable } from '../db.js'
import { badRequest, notFound } from '../errors.js'
import {
  iso,
  toAchievement,
  toCustomList,
  toDaily,
  toDeck,
  toHighScore,
  toList,
  toMastery,
  toSession,
  toSkill,
} from '../progressMappers.js'
import { insertMany } from '../sql.js'
import {
  customWordListSchema,
  progressChangeSchema,
  quizDeckSchema,
  snapshotSchema,
  type ItemMasteryInput,
  type SkillStateInput,
} from '../schemas.js'

/** Matches what the app keeps in memory; see SESSION_HISTORY_LIMIT on the web. */
const SESSION_FETCH_LIMIT = 100
const DAILY_FETCH_DAYS = 400

const uuid = z.string().uuid('That is not a valid id')

// Input pinned to `unknown` so T binds to the schema's *output* type; without
// it a schema carrying defaults infers its pre-default shape.
function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const issue = result.error.issues[0]
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
    throw badRequest(`${where}${issue?.message ?? 'That request was not valid'}`)
  }
  return result.data
}

/**
 * Confirm the learner is visible to this caller before doing anything else.
 *
 * Without it a write for an invisible learner would simply affect no rows and
 * report success, which is a confusing lie. RLS still does the enforcing; this
 * only turns silence into a 404.
 */
async function assertVisible(db: Queryable, learnerId: string): Promise<void> {
  const { rows } = await db.query('select 1 from public.learners where id = $1', [learnerId])
  if (!rows.length) throw notFound('No such learner')
}

async function loadSnapshot(db: Queryable, learnerId: string): Promise<ProgressSnapshot> {
  const [skills, mastery, lists, achievements, highScores, daily, sessions, customLists, decks] =
    await Promise.all([
      db.query('select * from public.skill_states where learner_id = $1', [learnerId]),
      db.query('select * from public.item_mastery where learner_id = $1', [learnerId]),
      db.query('select * from public.list_progress where learner_id = $1', [learnerId]),
      db.query('select * from public.achievements where learner_id = $1', [learnerId]),
      db.query(
        'select * from public.high_scores where learner_id = $1 order by score desc limit 200',
        [learnerId],
      ),
      db.query(
        `select * from public.daily_activity
          where learner_id = $1 and day >= current_date - $2::int
          order by day desc`,
        [learnerId, DAILY_FETCH_DAYS],
      ),
      db.query(
        `select * from public.sessions where learner_id = $1
          order by ended_at desc limit $2`,
        [learnerId, SESSION_FETCH_LIMIT],
      ),
      db.query('select * from public.word_lists where learner_id = $1', [learnerId]),
      db.query('select * from public.decks where learner_id = $1 order by updated_at desc', [
        learnerId,
      ]),
    ])

  const snapshot = emptySnapshot()

  for (const row of skills.rows) {
    const skill = toSkill(row)
    snapshot.skills[skill.subject] = skill
  }
  for (const row of mastery.rows) {
    const item = toMastery(row)
    snapshot.mastery[masteryKey(item.subject, item.itemKey)] = item
  }
  for (const row of lists.rows) {
    const list = toList(row)
    snapshot.lists[listKey(list.subject, list.listId)] = list
  }
  snapshot.achievements = achievements.rows.map(toAchievement)
  snapshot.highScores = highScores.rows.map(toHighScore)
  snapshot.daily = daily.rows.map(toDaily)
  snapshot.sessions = sessions.rows.map(toSession)
  snapshot.customLists = customLists.rows.map(toCustomList)
  snapshot.decks = decks.rows.map(toDeck)

  return snapshot
}

async function writeSkill(
  db: Queryable,
  learnerId: string,
  skill: SkillStateInput,
): Promise<void> {
  await db.query(
    `insert into public.skill_states
       (learner_id, subject, ability, ability_sd, level_index, placed,
        total_attempts, total_correct, streak_days, best_streak_days,
        last_active_on, settings, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
     on conflict (learner_id, subject) do update set
       ability = excluded.ability,
       ability_sd = excluded.ability_sd,
       level_index = excluded.level_index,
       placed = excluded.placed,
       total_attempts = excluded.total_attempts,
       total_correct = excluded.total_correct,
       streak_days = excluded.streak_days,
       best_streak_days = excluded.best_streak_days,
       last_active_on = excluded.last_active_on,
       settings = excluded.settings,
       updated_at = now()`,
    [
      learnerId,
      skill.subject,
      skill.ability,
      skill.abilitySd,
      skill.levelIndex,
      skill.placed,
      skill.totalAttempts,
      skill.totalCorrect,
      skill.streakDays,
      skill.bestStreakDays,
      skill.lastActiveOn,
      JSON.stringify(skill.settings ?? {}),
    ],
  )
}

async function writeMastery(
  db: Queryable,
  learnerId: string,
  items: ItemMasteryInput[],
): Promise<void> {
  await insertMany(
    db,
    'public.item_mastery',
    [
      'learner_id', 'subject', 'item_key', 'list_id', 'difficulty', 'mastery', 'reps',
      'lapses', 'correct_streak', 'total_attempts', 'total_correct', 'interval_days',
      'due_on', 'first_seen_at', 'last_seen_at',
    ],
    items.map((m) => [
      learnerId, m.subject, m.itemKey, m.listId, m.difficulty, m.mastery, m.reps,
      m.lapses, m.correctStreak, m.totalAttempts, m.totalCorrect, m.intervalDays,
      m.dueOn, iso(m.firstSeenAt), iso(m.lastSeenAt),
    ]),
    `on conflict (learner_id, subject, item_key) do update set
       list_id = excluded.list_id,
       difficulty = excluded.difficulty,
       mastery = excluded.mastery,
       reps = excluded.reps,
       lapses = excluded.lapses,
       correct_streak = excluded.correct_streak,
       total_attempts = excluded.total_attempts,
       total_correct = excluded.total_correct,
       interval_days = excluded.interval_days,
       due_on = excluded.due_on,
       last_seen_at = excluded.last_seen_at`,
  )
}

export async function progressRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', requireCaller)

  app.get('/learners/:id/progress', async (request) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)

    const snapshot = await withUser(caller.id, async (db) => {
      await assertVisible(db, id)
      return loadSnapshot(db, id)
    })

    return { snapshot }
  })

  // One round of practice. Applied as a single transaction: a session and the
  // attempts that belong to it either both land or neither does, which is what
  // keeps `attempts` usable as the audit trail everything else derives from.
  app.post('/learners/:id/progress', async (request, reply) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)
    const change = parse(progressChangeSchema, request.body)

    await withUser(caller.id, async (db) => {
      await assertVisible(db, id)

      if (change.skill) await writeSkill(db, id, change.skill)
      if (change.mastery?.length) await writeMastery(db, id, change.mastery)

      if (change.list) {
        const l = change.list
        await db.query(
          `insert into public.list_progress
             (learner_id, subject, list_id, plays, tests_taken, best_score,
              best_accuracy, stars, mastered_at, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
           on conflict (learner_id, subject, list_id) do update set
             plays = excluded.plays,
             tests_taken = excluded.tests_taken,
             best_score = excluded.best_score,
             best_accuracy = excluded.best_accuracy,
             stars = excluded.stars,
             mastered_at = excluded.mastered_at,
             updated_at = now()`,
          [id, l.subject, l.listId, l.plays, l.testsTaken, l.bestScore,
           l.bestAccuracy, l.stars, iso(l.masteredAt)],
        )
      }

      if (change.session) {
        const s = change.session
        await db.query(
          `insert into public.sessions
             (id, learner_id, subject, activity, list_id, is_test, items_total,
              items_correct, accuracy, score, wpm, duration_ms, ability_before,
              ability_after, meta, started_at, ended_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
           on conflict (id) do update set
             items_total = excluded.items_total,
             items_correct = excluded.items_correct,
             accuracy = excluded.accuracy,
             score = excluded.score,
             wpm = excluded.wpm,
             duration_ms = excluded.duration_ms,
             ability_after = excluded.ability_after,
             meta = excluded.meta,
             ended_at = excluded.ended_at`,
          [s.id, id, s.subject, s.activity, s.listId, s.isTest, s.itemsTotal,
           s.itemsCorrect, s.accuracy, s.score, s.wpm, s.durationMs,
           s.abilityBefore, s.abilityAfter, JSON.stringify(s.meta ?? {}),
           iso(s.startedAt), iso(s.endedAt)],
        )
      }

      // Append-only: the record of truth is never rewritten.
      if (change.attempts?.length) {
        await insertMany(
          db,
          'public.attempts',
          ['learner_id', 'session_id', 'subject', 'item_key', 'activity', 'is_test',
           'correct', 'response_ms', 'hints_used', 'difficulty', 'given', 'created_at'],
          change.attempts.map((a) => [
            id, change.session?.id ?? null, a.subject, a.itemKey, a.activity, a.isTest,
            a.correct, a.responseMs, a.hintsUsed, a.difficulty, a.given, iso(a.at),
          ]),
        )
      }

      if (change.achievements?.length) {
        await insertMany(
          db,
          'public.achievements',
          ['learner_id', 'achievement_id', 'subject', 'unlocked_at'],
          change.achievements.map((a) => [id, a.achievementId, a.subject, iso(a.unlockedAt)]),
          'on conflict (learner_id, achievement_id) do nothing',
        )
      }

      if (change.highScore) {
        const h = change.highScore
        await db.query(
          `insert into public.high_scores (learner_id, subject, mode, score, wpm, accuracy)
           values ($1,$2,$3,$4,$5,$6)`,
          [id, h.subject, h.mode, h.score, h.wpm, h.accuracy],
        )
      }

      if (change.daily) {
        const d = change.daily
        await db.query('select public.bump_daily_activity($1,$2,$3,$4,$5)', [
          id, d.subject, Math.round(d.seconds), d.items, d.correct,
        ])
      }
    })

    reply.code(204)
    return null
  })

  // The guest-to-account merge: a whole snapshot at once.
  app.put('/learners/:id/progress', async (request, reply) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)
    const snapshot = parse(snapshotSchema, request.body)

    await withUser(caller.id, async (db) => {
      await assertVisible(db, id)

      for (const skill of Object.values(snapshot.skills)) await writeSkill(db, id, skill)
      const mastery = Object.values(snapshot.mastery)
      if (mastery.length) await writeMastery(db, id, mastery)

      for (const l of Object.values(snapshot.lists)) {
        await db.query(
          `insert into public.list_progress
             (learner_id, subject, list_id, plays, tests_taken, best_score,
              best_accuracy, stars, mastered_at, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
           on conflict (learner_id, subject, list_id) do update set
             plays = excluded.plays,
             tests_taken = excluded.tests_taken,
             best_score = excluded.best_score,
             best_accuracy = excluded.best_accuracy,
             stars = excluded.stars,
             mastered_at = excluded.mastered_at,
             updated_at = now()`,
          [id, l.subject, l.listId, l.plays, l.testsTaken, l.bestScore,
           l.bestAccuracy, l.stars, iso(l.masteredAt)],
        )
      }

      if (snapshot.achievements.length) {
        await insertMany(
          db,
          'public.achievements',
          ['learner_id', 'achievement_id', 'subject', 'unlocked_at'],
          snapshot.achievements.map((a) => [id, a.achievementId, a.subject, iso(a.unlockedAt)]),
          'on conflict (learner_id, achievement_id) do nothing',
        )
      }
    })

    reply.code(204)
    return null
  })

  app.delete('/learners/:id/progress', async (request, reply) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)

    await withUser(caller.id, async (db) => {
      await assertVisible(db, id)
      // Ordered so the audit trail goes last: if this fails part way, what
      // survives is the record everything else can be rebuilt from.
      for (const table of [
        'public.sessions', 'public.item_mastery', 'public.list_progress',
        'public.achievements', 'public.daily_activity', 'public.high_scores',
        'public.skill_states', 'public.attempts',
      ]) {
        await db.query(`delete from ${table} where learner_id = $1`, [id])
      }
    })

    reply.code(204)
    return null
  })

  // --- content -------------------------------------------------------------

  app.post('/learners/:id/word-lists', async (request) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)
    const { customLists } = parse(
      z.object({ customLists: z.array(customWordListSchema).min(1).max(200) }),
      request.body,
    )

    const saved = await withUser(caller.id, async (db) => {
      await assertVisible(db, id)
      const out = []
      for (const list of customLists) {
        const { rows } = await db.query(
          `insert into public.word_lists (id, learner_id, title, subject, grade, words, created_by, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7, now())
           on conflict (id) do update set
             title = excluded.title,
             subject = excluded.subject,
             grade = excluded.grade,
             words = excluded.words,
             updated_at = now()
           returning *`,
          [list.id, id, list.title, list.subject, list.grade, JSON.stringify(list.words), caller.id],
        )
        const row = rows[0]
        if (row) out.push(toCustomList(row))
      }
      return out
    })

    return { customLists: saved }
  })

  app.delete('/learners/:id/word-lists/:listId', async (request, reply) => {
    const caller = callerOf(request)
    const { id, listId } = parse(z.object({ id: uuid, listId: uuid }), request.params)

    await withUser(caller.id, async (db) => {
      const { rowCount } = await db.query(
        'delete from public.word_lists where id = $1 and learner_id = $2',
        [listId, id],
      )
      if (!rowCount) throw notFound('No such word list')
    })

    reply.code(204)
    return null
  })

  app.post('/learners/:id/decks', async (request) => {
    const caller = callerOf(request)
    const { id } = parse(z.object({ id: uuid }), request.params)
    const { decks } = parse(
      z.object({ decks: z.array(quizDeckSchema).min(1).max(200) }),
      request.body,
    )

    const saved = await withUser(caller.id, async (db) => {
      await assertVisible(db, id)
      const out = []
      for (const deck of decks) {
        const { rows } = await db.query(
          `insert into public.decks
             (id, learner_id, title, description, tags, cards, term_label,
              definition_label, created_by, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
           on conflict (id) do update set
             title = excluded.title,
             description = excluded.description,
             tags = excluded.tags,
             cards = excluded.cards,
             term_label = excluded.term_label,
             definition_label = excluded.definition_label,
             updated_at = now()
           returning *`,
          [deck.id, id, deck.title, deck.description, deck.tags,
           JSON.stringify(deck.cards), deck.termLabel, deck.definitionLabel, caller.id],
        )
        const row = rows[0]
        if (row) out.push(toDeck(row))
      }
      return out
    })

    return { decks: saved }
  })

  app.delete('/learners/:id/decks/:deckId', async (request, reply) => {
    const caller = callerOf(request)
    const { id, deckId } = parse(z.object({ id: uuid, deckId: uuid }), request.params)

    await withUser(caller.id, async (db) => {
      const { rowCount } = await db.query(
        'delete from public.decks where id = $1 and learner_id = $2',
        [deckId, id],
      )
      if (!rowCount) throw notFound('No such deck')
    })

    reply.code(204)
    return null
  })
}
