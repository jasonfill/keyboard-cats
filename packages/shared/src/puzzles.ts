// Puzzle generators shared by more than one subject.
//
// The spelling module has had its own for a while — missing letters, scramble,
// plausible misspellings — and those stay there, because they lean on English
// orthography and only make sense for a word. What lives here is the scaffold
// that works on any answer at all.

import { richToPlain } from './rich/index.js'

export interface LetterHint {
  /** What the learner sees: `m____________`, spaces and hyphens intact. */
  masked: string
  /** How many characters they still have to produce. */
  hidden: number
}

/** Characters kept visible because they are structure, not answer. */
const STRUCTURAL = /[\s\-'’/(),.]/

/**
 * The first letter and the shape of the answer.
 *
 * This is the missing rung. Today a card goes from a four-way choice straight
 * to a blank page, and a learner who is not ready fails at a *format* rather
 * than at the content — which teaches them the wrong thing about themselves.
 * One letter and a length is enough to make recall attemptable without making
 * it free.
 *
 * Word boundaries, hyphens and apostrophes stay visible. That is deliberate:
 * knowing an answer is two words is a real part of knowing it, and hiding the
 * shape makes the task guessing rather than recall. The letters are the part
 * being tested.
 *
 * `reveal` exists so the scaffold can be loosened for a learner who is
 * struggling — two letters instead of one — without inventing another
 * activity. It never reveals so much that nothing is left to produce.
 */
export function buildLetterHint(answer: string, reveal = 1): LetterHint {
  const text = richToPlain(answer).trim()
  if (!text) return { masked: '', hidden: 0 }

  const chars = [...text]
  // Never give away the whole thing: at least one character stays hidden.
  const letterCount = chars.filter((c) => !STRUCTURAL.test(c)).length
  const budget = Math.max(0, Math.min(reveal, letterCount - 1))

  let shown = 0
  const masked = chars
    .map((c) => {
      if (STRUCTURAL.test(c)) return c
      if (shown < budget) {
        shown += 1
        return c
      }
      return '_'
    })
    .join('')

  return { masked, hidden: letterCount - shown }
}

/**
 * The answers offered beside a Word Bank round, shuffled.
 *
 * The same rung as the letter hint, for answers whose shape is a phrase rather
 * than a word — showing `p_____________ __ ______` for "photosynthesis in
 * plants" is a worse scaffold than simply listing the candidates.
 *
 * The correct answer is always in the bank. A bank that might not contain the
 * answer is a trick, and a learner who has been tricked once stops trusting
 * the format.
 */
export function buildWordBank(
  answer: string,
  others: string[],
  size = 5,
  rng: () => number = Math.random,
): string[] {
  const target = richToPlain(answer).trim()
  const seen = new Set([target.toLowerCase()])
  const bank = [target]

  for (const other of others) {
    if (bank.length >= size) break
    const text = richToPlain(other).trim()
    const key = text.toLowerCase()
    if (!text || seen.has(key)) continue
    seen.add(key)
    bank.push(text)
  }

  for (let i = bank.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[bank[i], bank[j]] = [bank[j], bank[i]]
  }
  return bank
}
