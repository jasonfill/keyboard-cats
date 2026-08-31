import { useState } from 'react'
import { Button, Card, Eyebrow, Pill } from '../../components/ui'
import { COVERED_PERKS, FREE_PERKS, money, priceBreakdown, priceLine } from '../../lib/plans'
import {
  CREDITS_EXTRA_LEARNER,
  CREDITS_FIRST_LEARNER,
  CREDITS_UNCOVERED_ONCE,
  FREE_DECKS,
  FREE_HISTORY_DAYS,
  FREE_WORD_LISTS,
  PRICE_EXTRA_LEARNER_CENTS,
  PRICE_FIRST_LEARNER_CENTS,
} from '@whizzo/shared'
import type { Navigate, Route } from '../../routes'
import {
  CheckList,
  FaqList,
  LinkButton,
  MarketingPage,
  PageHero,
  Panel,
  Section,
} from './chrome'

/**
 * What it costs.
 *
 * Not a plan picker, because there are no plans. There is a list of children
 * and a question about each one — which is what is actually being bought, and
 * the only shape that survives contact with a teacher who has twenty-five
 * students across twelve families. The in-app upgrade screen is built the same
 * way; this is that screen's argument, for somebody who has not signed up yet.
 *
 * Every price on this page is computed from `@whizzo/shared/billing`, so the
 * number a visitor reads is the number a charge would be built from. A price
 * typed into a marketing page is a price that will eventually be wrong.
 */
export default function PricingScreen({ navigate }: { navigate: Navigate }) {
  const here: Route = { name: 'pricing' }
  const toAuth = () => navigate({ name: 'auth' })

  return (
    <MarketingPage
      current={here}
      navigate={navigate}
      closing={{
        title: 'Nothing to pay today, and nothing to pay ever for the learning.',
        body: 'Payments are not switched on yet. Make the free account, use the whole curriculum, and decide about coverage when there is something to decide.',
      }}
    >
      <PageHero
        eyebrow="Pricing"
        title="You pay for a child, not for an account."
        body={`${money(
          PRICE_FIRST_LEARNER_CENTS,
        )} a month for the first child and ${money(
          PRICE_EXTRA_LEARNER_CENTS,
        )} for each one after. Coverage belongs to the learner, so every grown-up trusted with that child — the other parent, a tutor, a teacher — gets the full picture without being asked for a card.`}
      >
        <Button onClick={toAuth}>Create a free account</Button>
        <LinkButton to={{ name: 'features' }} navigate={navigate} variant="ghost">
          See what is in the product
        </LinkButton>
      </PageHero>

      <Estimator />

      <Section
        eyebrow="The split"
        title="Never gate learning. Gate leverage."
        lede="That is the rule the whole price list comes out of. A child on an uncovered record can still learn everything this app knows how to teach."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <Pill className="bg-quiet text-ink">Free, for everyone</Pill>
            <p className="mb-3 mt-3">
              <span className="font-display text-4xl font-extrabold text-ink">$0</span>{' '}
              <span className="font-bold text-stone">forever</span>
            </p>
            <CheckList items={FREE_PERKS} />
            <div className="mt-5">
              <Button className="w-full" onClick={toAuth}>
                Create a free account
              </Button>
            </div>
          </Card>
          <Card className="ring-2 ring-sun">
            <Pill className="bg-sun/30 text-ink">Covering a child</Pill>
            <p className="mb-3 mt-3">
              <span className="font-display text-4xl font-extrabold text-ink">
                {money(PRICE_FIRST_LEARNER_CENTS)}
              </span>{' '}
              <span className="font-bold text-stone">
                a month for the first child, {money(PRICE_EXTRA_LEARNER_CENTS)} after
              </span>
            </p>
            <CheckList items={COVERED_PERKS} />
            <div className="mt-5">
              <Button variant="secondary" className="w-full" disabled>
                Coming soon
              </Button>
            </div>
          </Card>
        </div>
        <p className="mt-4 text-center text-xs font-bold text-stone">
          Payments are not switched on yet — and the free account is the whole curriculum either
          way.
        </p>
      </Section>

      <WhoPays />

      <Section
        eyebrow="Documents"
        title="The one thing metered rather than gated"
        lede="Turning a document into practice material is the only feature here with a real cost per use, so it is the only one counted."
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel title="Counted by page, not by document">
            A page is very nearly the unit of cost; a document is not. An allowance of “ten
            documents” would price ten worksheets the same as ten chapters, and lose money on
            exactly the case the feature exists for.
          </Panel>
          <Panel title="Quoted before it runs">
            You are shown the estimate and your balance, and nothing starts until you say so. Work
            that can wait until tonight costs half.
          </Panel>
          <Panel title="A stop, not an overage">
            If the balance will not cover it, the run is refused rather than billed. This is a
            product bought by parents for children; a surprise bill would cost more in trust than
            the credits are worth.
          </Panel>
        </div>
        <div className="mt-4 rounded-[22px] bg-quiet p-5">
          <Eyebrow>The allowance</Eyebrow>
          <p className="mt-2 text-[15px] font-bold text-body">
            {CREDITS_UNCOVERED_ONCE} credits to try, once, on a free account ·{' '}
            {CREDITS_FIRST_LEARNER} credits a month with a covered child, plus{' '}
            {CREDITS_EXTRA_LEARNER} for each extra child — pooled across the family rather than
            trapped per learner.
          </p>
        </div>
      </Section>

      <Section eyebrow="Questions" title="About the money specifically">
        <FaqList
          items={[
            {
              q: 'What happens to my content if I stop paying?',
              a: `Nothing is deleted, ever. The limits apply to creating, never to keeping: forty decks made while covered stay usable, and the forty-first is refused. An uncovered learner keeps ${FREE_DECKS} decks of their own and ${FREE_WORD_LISTS} custom word list, and the starter decks never count against that.`,
            },
            {
              q: 'What do I lose if I never pay?',
              a: `The reporting depth, and nothing else. You see the last ${FREE_HISTORY_DAYS} days instead of the whole history, and the word-by-word report, retention, rewards, printables and export are not there. Every activity, the whole curriculum and the work anybody sets stay free.`,
            },
            {
              q: 'Why per child rather than a family price?',
              a: 'A flat family rate charges a one-child family the same as a four-child family for the same money, and one-child families are most families. Per child is the version where the smallest household is not subsidising the largest.',
            },
            {
              q: 'Can two grown-ups both pay for the same child?',
              a: 'There is no reason to. Coverage is a property of the child, so once anybody has covered them, everybody connected to that child sees the full picture — including the tutor and the teacher, who are never asked to pay for anything.',
            },
          ]}
        />
      </Section>
    </MarketingPage>
  )
}

const CHOICES = [1, 2, 3, 4, 5, 6]

/**
 * The price, for the number of children you actually have.
 *
 * A parent with three children should not have to do the arithmetic to find
 * out what three costs, and should be able to see where the total came from
 * once they have — that is the difference between a price they trust and a
 * price they email about.
 */
function Estimator() {
  const [learners, setLearners] = useState(1)

  return (
    <Section eyebrow="Work it out" title="How many children are you covering?">
      <Card>
        <div
          role="group"
          aria-label="Number of children to cover"
          className="flex flex-wrap items-center gap-2"
        >
          {CHOICES.map((count) => {
            const chosen = count === learners
            return (
              <button
                key={count}
                type="button"
                aria-pressed={chosen}
                onClick={() => setLearners(count)}
                className={`h-12 w-12 rounded-xl text-lg font-extrabold transition-colors ${
                  chosen
                    ? 'bg-ink text-white'
                    : 'border-2 border-edge bg-chalk text-ink hover:bg-wash'
                }`}
              >
                {count}
              </button>
            )
          })}
        </div>
        <p className="mt-5 font-display text-4xl font-extrabold text-ink">{priceLine(learners)}</p>
        {priceBreakdown(learners) && (
          <p className="mt-1 font-bold text-muted">{priceBreakdown(learners)}</p>
        )}
        <p className="mt-3 text-[15px] font-bold text-stone">
          Cancel whenever you like. Nothing a child has made or done is deleted if you do.
        </p>
      </Card>
    </Section>
  )
}

/** The table that answers the only question a teacher actually has. */
function WhoPays() {
  const rows: Array<[string, string, string]> = [
    ['A parent or guardian', 'Yes, for their own children', 'They are the one buying the receipts'],
    [
      'A teacher',
      'Never, for anybody',
      'Setting work is free permanently — a teacher assigning to a class is the best thing that happens here',
    ],
    [
      'A tutor',
      'Never, for anybody',
      'They get the full picture for any child a family has covered, having bought nothing',
    ],
    ['A learner', 'Never', 'Nothing a learner needs is behind a card, at any age'],
  ]

  return (
    <Section
      eyebrow="Who pays"
      title="One of these four, and only one"
      lede="This is not a discount policy. It falls out of coverage belonging to the child rather than to an account."
    >
      <div className="overflow-x-auto rounded-[22px] border border-hair bg-chalk">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <thead>
            <tr className="border-b border-hair">
              <th className="p-4">
                <Eyebrow>Who</Eyebrow>
              </th>
              <th className="p-4">
                <Eyebrow>Pays?</Eyebrow>
              </th>
              <th className="p-4">
                <Eyebrow>Why</Eyebrow>
              </th>
            </tr>
          </thead>
          <tbody className="text-[15px] text-body">
            {rows.map(([who, pays, why]) => (
              <tr key={who} className="border-b border-hair last:border-0">
                <td className="p-4 align-top font-extrabold text-ink">{who}</td>
                <td className="p-4 align-top font-extrabold text-ink">{pays}</td>
                <td className="p-4 align-top">{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}
