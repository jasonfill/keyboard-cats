// Validation for everything the browser can write.
//
// This is the boundary where an optimistic client-side model becomes rows, so
// it is validated properly rather than trusted. RLS decides *whose* rows may be
// touched; these schemas decide whether the payload is a coherent piece of
// progress at all.

import { z } from 'zod'

export const subjectSchema = z.enum(['spelling', 'typing', 'quiz'])

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD day')

const epochMs = z.number().int().min(0)

export const skillStateSchema = z.object({
  subject: subjectSchema,
  ability: z.number().finite(),
  abilitySd: z.number().finite().nonnegative(),
  levelIndex: z.number().int().min(0),
  placed: z.boolean(),
  totalAttempts: z.number().int().min(0),
  totalCorrect: z.number().int().min(0),
  streakDays: z.number().int().min(0),
  bestStreakDays: z.number().int().min(0),
  lastActiveOn: dayString.nullable(),
  settings: z.record(z.unknown()).default({}),
})

export const itemMasterySchema = z.object({
  subject: subjectSchema,
  itemKey: z.string().min(1).max(200),
  listId: z.string().max(120).nullable(),
  difficulty: z.number().finite(),
  mastery: z.number().min(0).max(1),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  correctStreak: z.number().int().min(0),
  totalAttempts: z.number().int().min(0),
  totalCorrect: z.number().int().min(0),
  intervalDays: z.number().finite().min(0),
  dueOn: dayString.nullable(),
  firstSeenAt: epochMs,
  lastSeenAt: epochMs,
})

export const attemptSchema = z.object({
  subject: subjectSchema,
  itemKey: z.string().min(1).max(200),
  activity: z.string().min(1).max(60),
  isTest: z.boolean(),
  correct: z.boolean(),
  responseMs: z.number().int().min(0).nullable(),
  hintsUsed: z.number().int().min(0),
  difficulty: z.number().finite(),
  given: z.string().max(400).nullable(),
  at: epochMs,
})

export const sessionRecordSchema = z.object({
  id: z.string().uuid(),
  subject: subjectSchema,
  activity: z.string().min(1).max(60),
  listId: z.string().max(120).nullable(),
  isTest: z.boolean(),
  itemsTotal: z.number().int().min(0),
  itemsCorrect: z.number().int().min(0),
  accuracy: z.number().min(0).max(100),
  score: z.number().int(),
  wpm: z.number().int().min(0).nullable(),
  durationMs: z.number().int().min(0),
  abilityBefore: z.number().finite().nullable(),
  abilityAfter: z.number().finite().nullable(),
  meta: z.record(z.unknown()).default({}),
  startedAt: epochMs,
  endedAt: epochMs,
})

export const listProgressSchema = z.object({
  subject: subjectSchema,
  listId: z.string().min(1).max(120),
  plays: z.number().int().min(0),
  testsTaken: z.number().int().min(0),
  bestScore: z.number().int(),
  bestAccuracy: z.number().min(0).max(100),
  stars: z.number().int().min(0).max(3),
  masteredAt: epochMs.nullable(),
})

export const achievementSchema = z.object({
  achievementId: z.string().min(1).max(80),
  subject: z.string().min(1).max(20),
  unlockedAt: epochMs,
})

export const highScoreSchema = z.object({
  id: z.string().optional(),
  subject: subjectSchema,
  mode: z.string().min(1).max(40),
  score: z.number().int(),
  wpm: z.number().int().min(0).nullable(),
  accuracy: z.number().min(0).max(100).nullable(),
  createdAt: epochMs.optional(),
})

export const dailySchema = z.object({
  subject: subjectSchema,
  seconds: z.number().min(0),
  items: z.number().int().min(0),
  correct: z.number().int().min(0),
})

export const quizCardSchema = z.object({
  id: z.string().min(1).max(80),
  term: z.string().min(1).max(400),
  definition: z.string().min(1).max(1000),
  hint: z.string().max(400).nullable(),
  difficulty: z.number().finite(),
})

export const quizDeckSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  description: z.string().max(500).default(''),
  tags: z.array(z.string().max(40)).max(20).default([]),
  // Bounded deliberately: a deck is read and written whole, so an unbounded
  // card array is an unbounded request body.
  cards: z.array(quizCardSchema).max(500),
  source: z.enum(['user', 'starter']).default('user'),
  termLabel: z.string().max(40).default('Term'),
  definitionLabel: z.string().max(40).default('Definition'),
  createdAt: epochMs.optional(),
  updatedAt: epochMs.optional(),
})

export const customWordListSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(80),
  subject: subjectSchema,
  grade: z.number().int().min(0).max(12).nullable(),
  words: z
    .array(z.object({ w: z.string().min(1).max(60), s: z.string().max(400) }))
    .max(1000),
  updatedAt: epochMs.optional(),
})

export const progressChangeSchema = z
  .object({
    skill: skillStateSchema.optional(),
    mastery: z.array(itemMasterySchema).max(1000).optional(),
    session: sessionRecordSchema.optional(),
    attempts: z.array(attemptSchema).max(1000).optional(),
    list: listProgressSchema.optional(),
    achievements: z.array(achievementSchema).max(100).optional(),
    highScore: highScoreSchema.optional(),
    daily: dailySchema.optional(),
    customLists: z.array(customWordListSchema).max(200).optional(),
    decks: z.array(quizDeckSchema).max(200).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'That change was empty' })

export const snapshotSchema = z.object({
  skills: z.record(skillStateSchema),
  mastery: z.record(itemMasterySchema),
  lists: z.record(listProgressSchema),
  achievements: z.array(achievementSchema).max(500),
  highScores: z.array(highScoreSchema).max(500),
  daily: z.array(
    dailySchema.extend({ day: dayString, sessions: z.number().int().min(0) }),
  ).max(1000),
  sessions: z.array(sessionRecordSchema).max(500),
  customLists: z.array(customWordListSchema).max(200),
  decks: z.array(quizDeckSchema).max(200),
})

export type SkillStateInput = z.output<typeof skillStateSchema>
export type ItemMasteryInput = z.output<typeof itemMasterySchema>
export type ProgressChangeInput = z.output<typeof progressChangeSchema>
export type SnapshotInput = z.output<typeof snapshotSchema>
