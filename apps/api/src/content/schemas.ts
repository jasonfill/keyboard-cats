// What we ask a model for, and what we will accept back.
//
// The schema is not a loose sketch — it is the real card shape, so a bundle
// that parses is a bundle that can be validated and landed without a
// translation step in between. Everything optional here is optional because a
// document may genuinely not contain it, never because the model is allowed to
// be lazy about it.

import { z } from 'zod'

/** One learnable topic the read stage found, with the pages it came from. */
export const topicSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.string().min(1).max(120),
  summary: z.string().max(400),
  pages: z.array(z.number().int().nonnegative()).max(40),
  /** Roughly how many cards this topic could support. Advisory. */
  estimatedCards: z.number().int().min(0).max(300),
})

/**
 * What the document is, who it is for, and what is learnable in it.
 *
 * The grade band matters: it is what lets the app file the result somewhere
 * sensible and pitch the cards at the right reading level, and a model reading
 * the actual pages guesses it far better than a parent picking from a dropdown.
 */
export const sourceMapSchema = z.object({
  title: z.string().max(160),
  subject: z.string().max(80),
  /** Our track id, proposed. Unknown values fall back to General downstream. */
  track: z.string().max(60).nullable(),
  gradeLow: z.number().int().min(0).max(13).nullable(),
  gradeHigh: z.number().int().min(0).max(13).nullable(),
  /** Said plainly, for the review screen. */
  note: z.string().max(400),
  topics: z.array(topicSchema).max(20),
})

export const generatedCardSchema = z.object({
  term: z.string().min(1).max(4000),
  definition: z.string().min(1).max(4000),
  hint: z.string().max(1000).nullable(),
  category: z.string().max(60).nullable(),
  example: z.string().max(600).nullable(),
  // Asked for here rather than added later: the document is already in a
  // cached context block, and backfilling it means reading every source again.
  explanation: z.string().max(600).nullable(),
  answerKind: z.enum(['text', 'numeric', 'set']),
  tolerance: z.number().nullable(),
  altAnswers: z.array(z.string().max(200)).max(6),
  sourcePages: z.array(z.number().int().nonnegative()).max(8),
})

export const generatedSetSchema = z.object({
  title: z.string().min(1).max(80),
  track: z.string().max(60).nullable(),
  objectives: z.array(z.string().max(80)).max(3),
  cards: z.array(generatedCardSchema).max(300),
})

export type SourceMap = z.infer<typeof sourceMapSchema>
export type Topic = z.infer<typeof topicSchema>
export type GeneratedSet = z.infer<typeof generatedSetSchema>
