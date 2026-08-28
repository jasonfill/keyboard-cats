import { useAuth } from '../../auth/AuthProvider'
import ScreenHeader from '../../components/suite/ScreenHeader'
import { Button, Card } from '../../components/ui'
import { PLANS } from '../../lib/plans'
import type { Navigate } from '../../routes'

export default function UpgradeScreen({ navigate }: { navigate: Navigate }) {
  const { status, profile, configured } = useAuth()
  const current = profile?.plan ?? 'free'

  return (
    <div className="mx-auto w-full max-w-3xl py-4">
      <ScreenHeader
        title="Plans"
        subtitle="The learning is free. Pro is for the grown-ups keeping track."
        onBack={() => navigate({ name: 'home' })}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(['free', 'pro'] as const).map((id) => {
          const plan = PLANS[id]
          const isCurrent = current === id
          return (
            <Card
              key={id}
              className={id === 'pro' ? 'ring-2 ring-sun' : ''}
            >
              <div className="mb-1 flex items-baseline gap-2">
                <h2 className="text-2xl font-extrabold text-ink">{plan.name}</h2>
                {isCurrent && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-700">
                    Your plan
                  </span>
                )}
              </div>
              <p className="mb-3 font-bold text-muted">{plan.tagline}</p>
              <p className="mb-4">
                <span className="text-4xl font-extrabold text-ink">{plan.price}</span>{' '}
                <span className="font-bold text-stone">{plan.cadence}</span>
              </p>
              <ul className="mb-5 space-y-2">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex gap-2 font-bold text-body">
                    <span className="text-emerald-500">✓</span>
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              {id === 'free' ? (
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => navigate({ name: 'home' })}
                  disabled={isCurrent}
                >
                  {isCurrent ? 'You are on this plan' : 'Included for everyone'}
                </Button>
              ) : (
                <Button variant="secondary" className="w-full" disabled>
                  Coming soon
                </Button>
              )}
            </Card>
          )
        })}
      </div>

      <Card className="mt-4">
        <h3 className="mb-1 text-lg font-extrabold text-ink">Why is the curriculum free?</h3>
        <p className="font-bold text-muted">
          A spelling app that locks fourth grade behind a card number is not much use to the kid who
          needs fourth grade. Every word list, every activity, and the adaptive engine itself stay
          free. Pro pays for the reporting and list-building tools that parents and teachers ask for.
        </p>
      </Card>

      {status !== 'signed-in' && configured && (
        <Card className="mt-4">
          <p className="mb-3 font-bold text-muted">
            You will need a free account before you can subscribe.
          </p>
          <Button className="w-full" onClick={() => navigate({ name: 'auth' })}>
            Create a free account
          </Button>
        </Card>
      )}

      <p className="mt-4 text-center text-xs font-bold text-stone">
        Billing is not wired up yet — the plan is modelled end to end, but no payment processor is
        connected in this build.
      </p>
    </div>
  )
}
