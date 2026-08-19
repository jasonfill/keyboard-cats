// Supabase-backed storage for a signed-in learner.
//
// Reads happen once at sign-in and are cached in memory; writes are fire-and-
// forget upserts guarded by Row Level Security, so a dropped request costs at
// most one round of practice rather than corrupting anything.

import type { SupabaseClient } from '@supabase/supabase-js'
import { applyChange, type ProgressChange, type ProgressRepo } from './repo'
import {
  emptySnapshot,
  listKey,
  masteryKey,
  type CustomWordList,
  type DailyActivityRow,
  type HighScoreRow,
  type ItemMastery,
  type ListProgress,
  type ProgressSnapshot,
  type SessionRecord,
  type SkillState,
  type Subject,
  type UnlockedAchievement,
} from './types'

const SESSION_FETCH_LIMIT = 100
const DAILY_FETCH_DAYS = 400

// --- row <-> domain mapping ----------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */

function toSkill(row: any): SkillState {
  return {
    subject: row.subject,
    ability: Number(row.ability),
    abilitySd: Number(row.ability_sd),
    levelIndex: row.level_index,
    placed: row.placed,
    totalAttempts: row.total_attempts,
    totalCorrect: row.total_correct,
    streakDays: row.streak_days,
    bestStreakDays: row.best_streak_days,
    lastActiveOn: row.last_active_on,
    settings: row.settings ?? {},
  }
}

function fromSkill(userId: string, s: SkillState) {
  return {
    user_id: userId,
    subject: s.subject,
    ability: s.ability,
    ability_sd: s.abilitySd,
    level_index: s.levelIndex,
    placed: s.placed,
    total_attempts: s.totalAttempts,
    total_correct: s.totalCorrect,
    streak_days: s.streakDays,
    best_streak_days: s.bestStreakDays,
    last_active_on: s.lastActiveOn,
    settings: s.settings,
    updated_at: new Date().toISOString(),
  }
}

function toMastery(row: any): ItemMastery {
  return {
    subject: row.subject,
    itemKey: row.item_key,
    listId: row.list_id,
    difficulty: Number(row.difficulty),
    mastery: Number(row.mastery),
    reps: row.reps,
    lapses: row.lapses,
    correctStreak: row.correct_streak,
    totalAttempts: row.total_attempts,
    totalCorrect: row.total_correct,
    intervalDays: Number(row.interval_days),
    dueOn: row.due_on,
    firstSeenAt: Date.parse(row.first_seen_at),
    lastSeenAt: Date.parse(row.last_seen_at),
  }
}

function fromMastery(userId: string, m: ItemMastery) {
  return {
    user_id: userId,
    subject: m.subject,
    item_key: m.itemKey,
    list_id: m.listId,
    difficulty: m.difficulty,
    mastery: m.mastery,
    reps: m.reps,
    lapses: m.lapses,
    correct_streak: m.correctStreak,
    total_attempts: m.totalAttempts,
    total_correct: m.totalCorrect,
    interval_days: m.intervalDays,
    due_on: m.dueOn,
    first_seen_at: new Date(m.firstSeenAt).toISOString(),
    last_seen_at: new Date(m.lastSeenAt).toISOString(),
  }
}

function toList(row: any): ListProgress {
  return {
    subject: row.subject,
    listId: row.list_id,
    plays: row.plays,
    testsTaken: row.tests_taken,
    bestScore: row.best_score,
    bestAccuracy: Number(row.best_accuracy),
    stars: row.stars,
    masteredAt: row.mastered_at ? Date.parse(row.mastered_at) : null,
  }
}

function toSession(row: any): SessionRecord {
  return {
    id: row.id,
    subject: row.subject,
    activity: row.activity,
    listId: row.list_id,
    isTest: row.is_test,
    itemsTotal: row.items_total,
    itemsCorrect: row.items_correct,
    accuracy: Number(row.accuracy ?? 0),
    score: row.score,
    wpm: row.wpm,
    durationMs: row.duration_ms,
    abilityBefore: row.ability_before === null ? null : Number(row.ability_before),
    abilityAfter: row.ability_after === null ? null : Number(row.ability_after),
    meta: row.meta ?? {},
    startedAt: Date.parse(row.started_at),
    endedAt: Date.parse(row.ended_at),
  }
}

function toCustomList(row: any): CustomWordList {
  return {
    id: row.id,
    title: row.title,
    subject: row.subject,
    grade: row.grade,
    words: row.words ?? [],
    updatedAt: Date.parse(row.updated_at),
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// --- repo ----------------------------------------------------------------

export class CloudProgressRepo implements ProgressRepo {
  readonly kind = 'cloud' as const

  private snapshot: ProgressSnapshot = emptySnapshot()

  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  async load(): Promise<ProgressSnapshot> {
    const [skills, mastery, lists, achievements, highScores, daily, sessions, customLists] =
      await Promise.all([
        this.client.from('skill_states').select('*').eq('user_id', this.userId),
        this.client.from('item_mastery').select('*').eq('user_id', this.userId),
        this.client.from('list_progress').select('*').eq('user_id', this.userId),
        this.client.from('achievements').select('*').eq('user_id', this.userId),
        this.client
          .from('high_scores')
          .select('*')
          .eq('user_id', this.userId)
          .order('score', { ascending: false })
          .limit(20),
        this.client
          .from('daily_activity')
          .select('*')
          .eq('user_id', this.userId)
          .order('day', { ascending: false })
          .limit(DAILY_FETCH_DAYS),
        this.client
          .from('sessions')
          .select('*')
          .eq('user_id', this.userId)
          .order('ended_at', { ascending: false })
          .limit(SESSION_FETCH_LIMIT),
        this.client.from('word_lists').select('*').eq('user_id', this.userId),
      ])

    const snapshot = emptySnapshot()

    for (const row of skills.data ?? []) snapshot.skills[row.subject] = toSkill(row)
    for (const row of mastery.data ?? []) {
      const m = toMastery(row)
      snapshot.mastery[masteryKey(m.subject, m.itemKey)] = m
    }
    for (const row of lists.data ?? []) {
      const l = toList(row)
      snapshot.lists[listKey(l.subject, l.listId)] = l
    }
    snapshot.achievements = (achievements.data ?? []).map(
      (row): UnlockedAchievement => ({
        achievementId: row.achievement_id,
        subject: row.subject,
        unlockedAt: Date.parse(row.unlocked_at),
      }),
    )
    snapshot.highScores = (highScores.data ?? []).map(
      (row): HighScoreRow => ({
        id: row.id,
        subject: row.subject,
        mode: row.mode,
        score: row.score,
        wpm: row.wpm,
        accuracy: row.accuracy === null ? null : Number(row.accuracy),
        createdAt: Date.parse(row.created_at),
      }),
    )
    snapshot.daily = (daily.data ?? []).map(
      (row): DailyActivityRow => ({
        day: row.day,
        subject: row.subject,
        seconds: row.seconds,
        items: row.items,
        correct: row.correct,
        sessions: row.sessions,
      }),
    )
    snapshot.sessions = (sessions.data ?? []).map(toSession)
    snapshot.customLists = (customLists.data ?? []).map(toCustomList)

    this.snapshot = snapshot
    return snapshot
  }

  async persist(change: ProgressChange): Promise<void> {
    this.snapshot = applyChange(this.snapshot, change)
    const uid = this.userId
    const writes: Array<PromiseLike<unknown>> = []

    if (change.skill) {
      writes.push(this.client.from('skill_states').upsert(fromSkill(uid, change.skill)))
    }

    if (change.mastery?.length) {
      writes.push(
        this.client.from('item_mastery').upsert(change.mastery.map((m) => fromMastery(uid, m))),
      )
    }

    if (change.list) {
      writes.push(
        this.client.from('list_progress').upsert({
          user_id: uid,
          subject: change.list.subject,
          list_id: change.list.listId,
          plays: change.list.plays,
          tests_taken: change.list.testsTaken,
          best_score: change.list.bestScore,
          best_accuracy: change.list.bestAccuracy,
          stars: change.list.stars,
          mastered_at: change.list.masteredAt ? new Date(change.list.masteredAt).toISOString() : null,
          updated_at: new Date().toISOString(),
        }),
      )
    }

    if (change.session) {
      const s = change.session
      writes.push(
        this.client.from('sessions').upsert({
          id: s.id,
          user_id: uid,
          subject: s.subject,
          activity: s.activity,
          list_id: s.listId,
          is_test: s.isTest,
          items_total: s.itemsTotal,
          items_correct: s.itemsCorrect,
          accuracy: s.accuracy,
          score: s.score,
          wpm: s.wpm,
          duration_ms: s.durationMs,
          ability_before: s.abilityBefore,
          ability_after: s.abilityAfter,
          meta: s.meta,
          started_at: new Date(s.startedAt).toISOString(),
          ended_at: new Date(s.endedAt).toISOString(),
        }),
      )
    }

    // Attempts are the audit trail — always written, never updated.
    if (change.attempts?.length) {
      writes.push(
        this.client.from('attempts').insert(
          change.attempts.map((a) => ({
            user_id: uid,
            session_id: change.session?.id ?? null,
            subject: a.subject,
            item_key: a.itemKey,
            activity: a.activity,
            is_test: a.isTest,
            correct: a.correct,
            response_ms: a.responseMs,
            hints_used: a.hintsUsed,
            difficulty: a.difficulty,
            given: a.given,
            created_at: new Date(a.at).toISOString(),
          })),
        ),
      )
    }

    if (change.achievements?.length) {
      writes.push(
        this.client.from('achievements').upsert(
          change.achievements.map((a) => ({
            user_id: uid,
            achievement_id: a.achievementId,
            subject: a.subject,
            unlocked_at: new Date(a.unlockedAt).toISOString(),
          })),
          { onConflict: 'user_id,achievement_id', ignoreDuplicates: true },
        ),
      )
    }

    if (change.highScore) {
      const h = change.highScore
      writes.push(
        this.client.from('high_scores').insert({
          user_id: uid,
          subject: h.subject,
          mode: h.mode,
          score: h.score,
          wpm: h.wpm,
          accuracy: h.accuracy,
        }),
      )
    }

    if (change.daily) {
      writes.push(
        this.client.rpc('bump_daily_activity', {
          p_subject: change.daily.subject,
          p_seconds: Math.round(change.daily.seconds),
          p_items: change.daily.items,
          p_correct: change.daily.correct,
        }),
      )
    }

    const results = await Promise.allSettled(writes)
    const failed = results.filter((r) => r.status === 'rejected')
    if (failed.length) {
      console.warn('[cat-academy] some progress writes failed', failed)
    }
  }

  /** Push a whole merged snapshot at once — used by the guest -> account sync. */
  async pushSnapshot(snapshot: ProgressSnapshot): Promise<void> {
    const uid = this.userId
    const skills = Object.values(snapshot.skills)
    const mastery = Object.values(snapshot.mastery)
    const lists = Object.values(snapshot.lists)

    await Promise.allSettled([
      skills.length
        ? this.client.from('skill_states').upsert(skills.map((s) => fromSkill(uid, s)))
        : Promise.resolve(),
      mastery.length
        ? this.client.from('item_mastery').upsert(mastery.map((m) => fromMastery(uid, m)))
        : Promise.resolve(),
      lists.length
        ? this.client.from('list_progress').upsert(
            lists.map((l) => ({
              user_id: uid,
              subject: l.subject,
              list_id: l.listId,
              plays: l.plays,
              tests_taken: l.testsTaken,
              best_score: l.bestScore,
              best_accuracy: l.bestAccuracy,
              stars: l.stars,
              mastered_at: l.masteredAt ? new Date(l.masteredAt).toISOString() : null,
              updated_at: new Date().toISOString(),
            })),
          )
        : Promise.resolve(),
      snapshot.achievements.length
        ? this.client.from('achievements').upsert(
            snapshot.achievements.map((a) => ({
              user_id: uid,
              achievement_id: a.achievementId,
              subject: a.subject,
              unlocked_at: new Date(a.unlockedAt).toISOString(),
            })),
            { onConflict: 'user_id,achievement_id', ignoreDuplicates: true },
          )
        : Promise.resolve(),
    ])

    this.snapshot = snapshot
  }

  async saveCustomLists(lists: CustomWordList[]): Promise<CustomWordList[]> {
    const { data } = await this.client
      .from('word_lists')
      .upsert(
        lists.map((l) => ({
          id: l.id,
          user_id: this.userId,
          title: l.title,
          subject: l.subject,
          grade: l.grade,
          words: l.words,
        })),
      )
      .select()
    return (data ?? []).map(toCustomList)
  }

  async deleteCustomList(id: string): Promise<void> {
    await this.client.from('word_lists').delete().eq('id', id).eq('user_id', this.userId)
  }

  async reset(): Promise<void> {
    const tables = [
      'attempts',
      'sessions',
      'item_mastery',
      'list_progress',
      'achievements',
      'daily_activity',
      'high_scores',
      'skill_states',
    ]
    await Promise.allSettled(
      tables.map((t) => this.client.from(t).delete().eq('user_id', this.userId)),
    )
    this.snapshot = emptySnapshot()
  }
}

export type { Subject }
