// Plan definitions.
//
// The whole core curriculum is free on purpose: a spelling app that paywalls
// fourth grade is not much use to the kid who needs it. Pro pays for the things
// a parent or teacher wants rather than the things a learner needs.

export type PlanId = 'free' | 'pro'

export interface PlanLimits {
  /** Custom word lists a learner can save. */
  customLists: number
  /** Study decks a learner can save. */
  decks: number
  /** How far back the progress dashboard will look. */
  historyDays: number
  printableReports: boolean
  detailedWordReport: boolean
  dataExport: boolean
}

export interface PlanDef {
  id: PlanId
  name: string
  price: string
  cadence: string
  tagline: string
  perks: string[]
  limits: PlanLimits
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: {
    id: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    tagline: 'The entire curriculum, for everyone.',
    perks: [
      'All 7 grade levels of spelling (2nd through 8th)',
      'The full typing course and arcade modes',
      'Adaptive practice and spaced review',
      'Progress that follows you across devices',
      'One saved custom word list',
      'Three study decks, and every starter deck',
    ],
    limits: {
      customLists: 1,
      decks: 3,
      historyDays: 30,
      printableReports: false,
      detailedWordReport: false,
      dataExport: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Family Pro',
    price: '$4',
    cadence: 'per month',
    tagline: 'For parents and teachers who want the receipts.',
    perks: [
      'Everything in Free',
      'Unlimited custom word lists — paste this week’s class list',
      'Unlimited study decks for any subject you like',
      'Full progress history instead of the last 30 days',
      'Word-by-word mastery report with every miss the learner made',
      'Printable weekly progress sheets',
      'Export all of your data as CSV',
    ],
    limits: {
      customLists: 50,
      decks: 200,
      historyDays: Number.POSITIVE_INFINITY,
      printableReports: true,
      detailedWordReport: true,
      dataExport: true,
    },
  },
}

export function limitsFor(plan: PlanId): PlanLimits {
  return PLANS[plan]?.limits ?? PLANS.free.limits
}

export function isPro(plan: PlanId | undefined): boolean {
  return plan === 'pro'
}

/** Gate keys used by the UI so every paywall reads from one place. */
export type Gate = keyof PlanLimits

export function allows(plan: PlanId, gate: Gate): boolean {
  const value = limitsFor(plan)[gate]
  return typeof value === 'boolean' ? value : value > 0
}
