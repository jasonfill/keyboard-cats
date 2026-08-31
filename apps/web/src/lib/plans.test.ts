// The words on the pricing pages, and the sums under them.
//
// This file used to test a second copy of the gating rules that lived here —
// `limitsFor`, `isPro`, a 'free' | 'pro' plan id — while the app's actual gates
// had already moved to coverage. Two sets of rules tested separately is how the
// pricing page ends up promising something the gate does not give. The rules
// are tested once now, in `packages/shared/src/billing.test.ts`, against the
// authority; what is left here is copy, and the one thing copy can get wrong
// is quoting a price the charge would not match.

import { describe, expect, it } from 'vitest'
import {
  monthlyPriceCents,
  PRICE_EXTRA_LEARNER_CENTS,
  PRICE_FIRST_LEARNER_CENTS,
} from '@whizzo/shared'
import { COVERED_PERKS, FREE_PERKS, money, priceBreakdown, priceLine } from './plans'

describe('the price, said in words', () => {
  it('quotes what would actually be charged', () => {
    // The point of importing the constants rather than typing "$4": a price
    // changed in one place and not the other is a page that lies.
    expect(priceLine(1)).toBe(`${money(PRICE_FIRST_LEARNER_CENTS)} a month`)
    expect(priceLine(3)).toBe(`${money(monthlyPriceCents(3))} a month`)
  })

  it('is the marketed sum: $4 for one child, $8 for three', () => {
    expect(priceLine(1)).toContain('$4')
    expect(priceLine(3)).toContain('$8')
  })

  it('offers nothing at no children rather than a price of zero', () => {
    // "$0 a month" reads as an offer. Nobody is being offered anything.
    expect(priceLine(0)).not.toContain('$')
    expect(priceLine(-1)).not.toContain('$')
  })

  it('drops the cents when there are none, and keeps them when there are', () => {
    expect(money(400)).toBe('$4')
    expect(money(1350)).toBe('$13.50')
  })
})

describe('showing the arithmetic', () => {
  it('explains a total that is more than one child', () => {
    const line = priceBreakdown(3)
    expect(line).toContain(money(PRICE_FIRST_LEARNER_CENTS))
    expect(line).toContain(money(PRICE_EXTRA_LEARNER_CENTS))
    expect(line).toContain('2 more')
  })

  it('says nothing when there is nothing to explain', () => {
    // One child at $4 needs no working shown, and a breakdown of a single
    // number is noise dressed as transparency.
    expect(priceBreakdown(1)).toBeNull()
    expect(priceBreakdown(0)).toBeNull()
  })
})

describe('what the free list promises', () => {
  it('never puts the curriculum behind the price', () => {
    // The product's stated refusal: a spelling app that paywalls fourth grade
    // is not much use to the kid who needs fourth grade. If any of these ever
    // migrate to the covered list, that promise has been broken.
    const free = FREE_PERKS.join(' ').toLowerCase()
    expect(free).toContain('spelling')
    expect(free).toContain('typing')
    expect(free).toContain('activity')
    expect(free).toContain('adaptive')
  })

  it('leaves setting work free, which is the wedge', () => {
    // A teacher who assigns to twenty-five children causes twenty-five
    // families to open the app. Gating that would strangle the business to
    // protect it.
    expect(FREE_PERKS.join(' ').toLowerCase()).toContain('set by a parent')
  })

  it('does not also claim the things coverage is for', () => {
    const free = FREE_PERKS.join(' ').toLowerCase()
    expect(free).not.toContain('unlimited')
    expect(free).not.toContain('printable')
  })
})

describe('what coverage promises', () => {
  it('is about one child, not about an account', () => {
    expect(COVERED_PERKS.join(' ').toLowerCase()).toContain('that child')
  })

  it('names the gates that actually exist', () => {
    // Each of these corresponds to a Gate in shared/billing. A perk with no
    // gate behind it is a promise nothing keeps.
    const covered = COVERED_PERKS.join(' ').toLowerCase()
    expect(covered).toContain('history')
    expect(covered).toContain('report')
    expect(covered).toContain('reward')
    expect(covered).toContain('export')
  })
})
