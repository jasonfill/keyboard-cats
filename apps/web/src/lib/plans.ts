// What coverage is *called*, and what it says it includes.
//
// The whole core curriculum is free on purpose: a spelling app that paywalls
// fourth grade is not much use to the kid who needs it. Paying for a child buys
// the things a grown-up wants — the receipts — not the things a learner needs.
//
// **No gating lives here, and no plan lives here either.** This file used to
// carry a `PlanId` of 'free' | 'pro' with its own `limitsFor`, `isPro` and
// `allows`, which made it a second answer to "has this been paid for?" — and
// the two answers had already drifted: the gates moved to coverage in migration
// 0013 while three screens went on asking `profiles.plan`, so a parent whose
// child was covered could be told they were on Free.
//
// The authority is `@whizzo/shared/billing`, keyed on whether a *learner* is
// covered rather than on whether a user is Pro — because "is this user Pro?"
// has no answer for a teacher with twenty-five students across twelve families.
// What is left here is copy, and prices imported from that authority so the
// page and the charge can never disagree.

import {
  PRICE_EXTRA_LEARNER_CENTS,
  PRICE_FIRST_LEARNER_CENTS,
  CREDITS_FIRST_LEARNER,
  CREDITS_EXTRA_LEARNER,
  CREDITS_UNCOVERED_ONCE,
  FREE_DECKS,
  FREE_HISTORY_DAYS,
  FREE_WORD_LISTS,
  monthlyPriceCents,
} from '@whizzo/shared'

/** "3 study decks", "1 custom word list" — the count and the right noun. */
function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** `$4`, `$8` — whole dollars where they are whole, which these always are. */
export function money(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`
}

/**
 * What covering this many children costs, said the way a person would say it.
 *
 * Zero is not "$0" — that is a price, and nobody is being offered anything at
 * zero children. It is the absence of a charge.
 */
export function priceLine(learners: number): string {
  if (learners <= 0) return 'Nothing to pay yet'
  return `${money(monthlyPriceCents(learners))} a month`
}

/**
 * The arithmetic, spelled out under the total.
 *
 * A parent looking at $8 for three children should be able to see where the 8
 * came from without doing the sum themselves — that is the difference between
 * a price they trust and a price they query.
 */
export function priceBreakdown(learners: number): string | null {
  if (learners <= 1) return null
  const extra = learners - 1
  return `${money(PRICE_FIRST_LEARNER_CENTS)} for the first, ${money(
    PRICE_EXTRA_LEARNER_CENTS,
  )} each for ${extra} more`
}

/** What everybody gets, paid or not. This list is the product's whole promise. */
export const FREE_PERKS: string[] = [
  'All 7 grade levels of spelling (2nd through 8th)',
  'The full typing course and arcade modes',
  'Every learning activity, and the mastery ladder behind them',
  'Adaptive practice and spaced review',
  'Work set by a parent, a tutor or a teacher',
  'Progress that follows a learner across devices',
  `${count(FREE_DECKS, 'study deck')} and ${count(FREE_WORD_LISTS, 'custom word list')}`,
  `The last ${FREE_HISTORY_DAYS} days of progress`,
  `${CREDITS_UNCOVERED_ONCE} document credits to try, once`,
]

/**
 * What paying for a child adds — for that child.
 *
 * Written per learner rather than per account, because that is how it actually
 * works: a tutor sitting with a covered child sees all of this and has never
 * bought anything.
 */
export const COVERED_PERKS: string[] = [
  'Everything above, for that child',
  'Their full progress history instead of the last 30 days',
  'Word-by-word mastery report with every miss they made',
  'Retention: what is sticking, and what is about to slip',
  'Rewards you can offer, track and check off as paid',
  'Unlimited study decks and custom word lists',
  'Printable weekly progress sheets, and CSV export',
  `${CREDITS_FIRST_LEARNER} document credits a month (+${CREDITS_EXTRA_LEARNER} per extra child, pooled)`,
]
