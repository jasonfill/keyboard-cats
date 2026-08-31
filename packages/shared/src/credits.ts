// Deciding whether a job may run, and what it cost.
//
// Ingestion is the only feature in the app with a real marginal cost, and this
// is the machinery that keeps a heavy user from being a loss instead of a
// customer. Four rules run through it, and every one is about a parent's trust
// rather than about revenue:
//
//   * the estimate is shown **before** the first model call, never after;
//   * a job that would overdraw is refused, never billed as an overage;
//   * a job that fails is refunded in full — the tokens were ours to lose;
//   * the balance is a sum of the ledger, never a stored total.
//
// See docs/billing-spec.md.

import { CREDIT_FLOOR, creditsForPages, creditsWithSpeed, planSpend, type CreditBalance } from './billing.js'

export type CreditEntryKind =
  | 'grant'
  | 'purchase'
  | 'reserve'
  | 'consume'
  | 'release'
  | 'refund'
  | 'expire'

export interface CreditEntry {
  kind: CreditEntryKind
  bucket: 'included' | 'purchased'
  /** Signed: grants and purchases positive, spend negative. */
  credits: number
}

/**
 * The balance, summed from the ledger.
 *
 * Never a stored total anybody overwrites — the same treatment `attempts`
 * gets, and for the same reason: every dispute is then answerable from the
 * record.
 */
export function creditBalance(entries: readonly CreditEntry[]): CreditBalance {
  let included = 0
  let purchased = 0
  for (const entry of entries) {
    if (entry.bucket === 'included') included += entry.credits
    else purchased += entry.credits
  }
  // A negative bucket would mean the ledger disagrees with itself; showing a
  // negative balance to a parent helps nobody, and the floor makes the
  // arithmetic below safe.
  included = Math.max(0, included)
  purchased = Math.max(0, purchased)
  return { included, purchased, total: included + purchased }
}

export interface JobEstimate {
  pages: number
  credits: number
  noRush: boolean
}

/** What a document will cost, known before anything has been spent. */
export function estimateJob(pages: number, noRush = false): JobEstimate {
  return { pages, credits: creditsWithSpeed(creditsForPages(pages), noRush), noRush }
}

export type QuotaDecision =
  | { ok: true; estimate: JobEstimate; reserve: CreditEntry[] }
  | { ok: false; estimate: JobEstimate; shortBy: number; reason: string }

export const MAX_PAGES_COVERED = 100
export const MAX_PAGES_FREE = 20

/**
 * May this job run?
 *
 * Answered before the first model call, because the alternative is discovering
 * the answer after the money is gone. A refusal says how many credits short it
 * is, so the next screen can offer exactly what is needed rather than a
 * generic "upgrade".
 */
export function authorizeJob(
  balance: CreditBalance,
  pages: number,
  opts: { covered: boolean; noRush?: boolean } = { covered: false },
): QuotaDecision {
  const estimate = estimateJob(pages, opts.noRush ?? false)
  const pageCap = opts.covered ? MAX_PAGES_COVERED : MAX_PAGES_FREE

  if (pages > pageCap) {
    return {
      ok: false,
      estimate,
      shortBy: 0,
      reason: `That document is ${pages} pages and the limit is ${pageCap}. Split it and upload the part you need — which usually makes better content anyway.`,
    }
  }

  const spend = planSpend(balance, estimate.credits)
  if (!spend) {
    return {
      ok: false,
      estimate,
      shortBy: estimate.credits - balance.total,
      reason: `This needs ${estimate.credits} credits and there ${balance.total === 1 ? 'is' : 'are'} ${balance.total} left.`,
    }
  }

  return {
    ok: true,
    estimate,
    reserve: [
      ...(spend.included ? [entry('reserve', 'included', -spend.included)] : []),
      ...(spend.purchased ? [entry('reserve', 'purchased', -spend.purchased)] : []),
    ],
  }
}

function entry(kind: CreditEntryKind, bucket: CreditEntry['bucket'], credits: number): CreditEntry {
  return { kind, bucket, credits }
}

/**
 * What to write when a job ends.
 *
 * A reservation is not a charge. On success the difference between what was
 * held and what was used is released; on failure the whole reservation is,
 * because a run that produced nothing is ours to absorb. Charging for it is
 * how a support queue becomes a chargeback queue.
 */
export function settleJob(
  reserved: readonly CreditEntry[],
  outcome: { ok: boolean; actualPages?: number; noRush?: boolean },
): CreditEntry[] {
  if (!outcome.ok) {
    return reserved.map((e) => entry('refund', e.bucket, Math.abs(e.credits)))
  }

  const held = reserved.reduce((n, e) => n + Math.abs(e.credits), 0)
  const used =
    outcome.actualPages === undefined
      ? held
      : Math.min(
          held,
          creditsWithSpeed(creditsForPages(outcome.actualPages), outcome.noRush ?? false),
        )

  // Give back from `purchased` first. Those do not expire and the included
  // allowance does, so releasing them last would quietly convert a parent's
  // bought credits into free ones that vanish at the end of the month. Same
  // reasoning as spending included first, in the other direction.
  const order: CreditEntry['bucket'][] = ['purchased', 'included']
  const out: CreditEntry[] = []
  let toRelease = held - used

  for (const bucket of order) {
    for (const e of reserved) {
      if (toRelease <= 0) break
      if (e.bucket !== bucket) continue
      const release = Math.min(toRelease, Math.abs(e.credits))
      if (release > 0) {
        out.push(entry('release', bucket, release))
        toRelease -= release
      }
    }
  }

  return out
}

export { CREDIT_FLOOR }
