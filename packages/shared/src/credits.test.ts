// Whether a job may run, and what it cost.
//
// Every assertion here is about a parent's trust rather than about revenue:
// the estimate is known before anything is spent, a job that would overdraw is
// refused rather than billed, and a job that failed is ours to absorb.

import { describe, expect, it } from 'vitest'
import {
  authorizeJob,
  creditBalance,
  estimateJob,
  MAX_PAGES_COVERED,
  MAX_PAGES_FREE,
  settleJob,
  type CreditEntry,
} from './credits.js'
import { CREDIT_FLOOR } from './billing.js'

const grant = (credits: number, bucket: CreditEntry['bucket'] = 'included'): CreditEntry => ({
  kind: 'grant',
  bucket,
  credits,
})

describe('the balance is a sum, never a stored total', () => {
  it('adds the ledger up per bucket', () => {
    expect(creditBalance([grant(30), grant(100, 'purchased')])).toEqual({
      included: 30,
      purchased: 100,
      total: 130,
    })
  })

  it('nets spending against grants', () => {
    const entries: CreditEntry[] = [grant(30), { kind: 'consume', bucket: 'included', credits: -12 }]
    expect(creditBalance(entries).included).toBe(18)
  })

  it('never shows a parent a negative balance', () => {
    const entries: CreditEntry[] = [{ kind: 'consume', bucket: 'included', credits: -5 }]
    expect(creditBalance(entries)).toEqual({ included: 0, purchased: 0, total: 0 })
  })

  it('is zero for a ledger with nothing in it', () => {
    expect(creditBalance([]).total).toBe(0)
  })
})

describe('the estimate is known before anything is spent', () => {
  it('is a credit a page', () => {
    expect(estimateJob(24).credits).toBe(24)
  })

  it('charges the floor for a very short document', () => {
    expect(estimateJob(1).credits).toBe(CREDIT_FLOOR)
  })

  it('halves it for work that can wait', () => {
    expect(estimateJob(40, true).credits).toBe(20)
  })
})

describe('authorising a job', () => {
  const balance = (included: number, purchased = 0) => ({
    included,
    purchased,
    total: included + purchased,
  })

  it('allows one the balance covers, and says what it holds', () => {
    const decision = authorizeJob(balance(30), 20, { covered: true })
    expect(decision.ok).toBe(true)
    if (decision.ok) {
      expect(decision.estimate.credits).toBe(20)
      expect(decision.reserve).toEqual([{ kind: 'reserve', bucket: 'included', credits: -20 }])
    }
  })

  it('holds from the included allowance first', () => {
    const decision = authorizeJob(balance(10, 100), 40, { covered: true })
    expect(decision.ok).toBe(true)
    if (decision.ok) {
      expect(decision.reserve).toEqual([
        { kind: 'reserve', bucket: 'included', credits: -10 },
        { kind: 'reserve', bucket: 'purchased', credits: -30 },
      ])
    }
  })

  it('refuses rather than billing an overage, and says how short', () => {
    const decision = authorizeJob(balance(5), 20, { covered: true })
    expect(decision.ok).toBe(false)
    if (!decision.ok) {
      expect(decision.shortBy).toBe(15)
      // The next screen can offer exactly what is needed rather than a generic
      // "upgrade".
      expect(decision.reason).toMatch(/20 credits/)
    }
  })

  it('reads naturally when exactly one credit is left', () => {
    const decision = authorizeJob(balance(1), 30, { covered: true })
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.reason).toMatch(/there is 1 left/)
  })

  it('refuses a document past the page cap before counting credits at all', () => {
    const decision = authorizeJob(balance(9999), MAX_PAGES_COVERED + 1, { covered: true })
    expect(decision.ok).toBe(false)
    if (!decision.ok) expect(decision.reason).toMatch(/Split it/)
  })

  it('caps an uncovered account lower', () => {
    expect(authorizeJob(balance(9999), MAX_PAGES_FREE + 1, { covered: false }).ok).toBe(false)
    expect(authorizeJob(balance(9999), MAX_PAGES_FREE, { covered: false }).ok).toBe(true)
  })
})

describe('settling up', () => {
  const reserved: CreditEntry[] = [
    { kind: 'reserve', bucket: 'included', credits: -30 },
    { kind: 'reserve', bucket: 'purchased', credits: -10 },
  ]

  it('refunds the whole hold when a job fails', () => {
    // The tokens were still spent and llm_usage still records them, but the
    // cost is ours. Charging for a run that produced nothing is how a support
    // queue becomes a chargeback queue.
    const entries = settleJob(reserved, { ok: false })
    expect(entries.every((e) => e.kind === 'refund')).toBe(true)
    expect(entries.reduce((n, e) => n + e.credits, 0)).toBe(40)
  })

  it('releases nothing when the estimate was right', () => {
    expect(settleJob(reserved, { ok: true, actualPages: 40 })).toEqual([])
  })

  it('gives back the difference when a document was shorter than expected', () => {
    const entries = settleJob(reserved, { ok: true, actualPages: 25 })
    expect(entries.reduce((n, e) => n + e.credits, 0)).toBe(15)
  })

  it('gives back purchased credits before free ones', () => {
    // Included expires at the end of the month and purchased does not, so
    // releasing purchased last would quietly turn a parent's bought credits
    // into free ones that vanish.
    const entries = settleJob(reserved, { ok: true, actualPages: 35 })
    expect(entries).toEqual([{ kind: 'release', bucket: 'purchased', credits: 5 }])
  })

  it('never gives back more than was held', () => {
    const entries = settleJob(reserved, { ok: true, actualPages: 0 })
    expect(entries.reduce((n, e) => n + e.credits, 0)).toBeLessThanOrEqual(40)
  })

  it('holds the whole reservation when the real length is unknown', () => {
    expect(settleJob(reserved, { ok: true })).toEqual([])
  })
})
