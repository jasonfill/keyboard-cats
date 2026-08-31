import { Button, Card } from '../../components/ui'
import { money } from '../../lib/plans'
import { PRICE_EXTRA_LEARNER_CENTS, PRICE_FIRST_LEARNER_CENTS } from '@whizzo/shared'
import type { AudienceId, Navigate, Route } from '../../routes'
import { AUDIENCES } from './audiences'
import {
  CheckList,
  FaqList,
  LinkButton,
  MarketingPage,
  OtherAudiences,
  PageHero,
  Panel,
  Section,
  Steps,
} from './chrome'

/**
 * One screen for all four audiences.
 *
 * Four files would drift: the day somebody adds a section to the parents page
 * it stops matching the teachers page, and a visitor who reads two of them
 * notices. So the shape is fixed here and only the words vary — which is also
 * an honest reflection of the product, where the four of them get the same
 * screens and the same permissions.
 */
export default function AudienceScreen({
  who,
  navigate,
}: {
  who: AudienceId
  navigate: Navigate
}) {
  const audience = AUDIENCES[who]
  const here: Route = { name: 'audience', who }
  const toAuth = () => navigate({ name: 'auth' })

  return (
    <MarketingPage current={here} navigate={navigate} closing={audience.closing}>
      <PageHero eyebrow={audience.eyebrow} title={audience.title} body={audience.lede}>
        <Button onClick={toAuth}>Create a free account</Button>
        <LinkButton to={{ name: 'features' }} navigate={navigate} variant="ghost">
          See everything it does
        </LinkButton>
      </PageHero>

      <Section eyebrow="Where you are starting from" title="The situation, as it usually is">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {audience.situation.map((item) => (
            <Panel key={item.title} title={item.title}>
              {item.body}
            </Panel>
          ))}
        </div>
      </Section>

      <Section eyebrow="Getting going" title="How it works for you">
        <Steps steps={audience.steps} />
      </Section>

      <Section
        eyebrow="What you end up with"
        title="Once it is set up"
        className="rounded-[26px] bg-wash p-7 md:p-10"
      >
        <div className="rounded-[22px] bg-chalk p-6 ring-1 ring-hair">
          <CheckList items={audience.gets} />
        </div>
      </Section>

      <Section eyebrow="Money" title={audience.money.title}>
        <Card>
          <p className="text-[17px] leading-relaxed text-body">{audience.money.body}</p>
          <p className="mt-4 font-bold text-muted">
            {money(PRICE_FIRST_LEARNER_CENTS)} a month for the first child,{' '}
            {money(PRICE_EXTRA_LEARNER_CENTS)} for each one after — and payments are not switched on
            yet, so nothing is being charged today.
          </p>
          <div className="mt-5">
            <LinkButton to={{ name: 'pricing' }} navigate={navigate} variant="ghost">
              What coverage includes
            </LinkButton>
          </div>
        </Card>
      </Section>

      <Section eyebrow="Questions" title={`What ${audience.nav.toLowerCase()} ask`}>
        <FaqList items={audience.faq} />
      </Section>

      <OtherAudiences current={here} navigate={navigate} />
    </MarketingPage>
  )
}
