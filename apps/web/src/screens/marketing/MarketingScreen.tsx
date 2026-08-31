import Mascot from '../../components/Mascot'
import Wordmark from '../../components/Wordmark'
import { Button, Card, Eyebrow } from '../../components/ui'
import { PLANS } from '../../lib/plans'
import { DEFAULT_THEME_ID } from '../../lib/themes'
import type { Navigate } from '../../routes'

/**
 * The signed-out front door.
 *
 * Everything a visitor can reach without an account lives on this one page:
 * what the app is, how the adaptive part works, what a grown-up gets, what it
 * costs. There is deliberately nothing playable here — practice writes to a
 * learner's record, and a visitor has no learner, so the only exits are "make
 * an account", "sign in", and the child's code door.
 *
 * A grown-up surface, so it is theme-free: spark and ink, never a learner's
 * accent. See the third rule in `lib/themes.ts`.
 */
export default function MarketingScreen({ navigate }: { navigate: Navigate }) {
  const toAuth = () => navigate({ name: 'auth' })

  return (
    <div className="mx-auto w-full max-w-5xl py-4">
      <header className="mb-10 flex flex-wrap items-center justify-between gap-3">
        <Wordmark accent={false} />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" onClick={toAuth}>
            Sign in
          </Button>
          <Button onClick={toAuth}>Create a free account</Button>
        </nav>
      </header>

      <Hero onStart={toAuth} />

      <Subjects />

      <Adaptive />

      <ForGrownUps />

      <Pricing onStart={toAuth} />

      <Privacy />

      <section className="mt-10 rounded-[26px] bg-ink px-6 py-10 text-center">
        <h2 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-white md:text-4xl">
          Start with one child and five minutes.
        </h2>
        <p className="mx-auto mt-2 max-w-xl font-bold text-onink">
          The account is free, the whole curriculum is free, and the first round of spelling tells
          you where they actually are.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={toAuth}>Create a free account</Button>
          <Button variant="ghost" onClick={toAuth}>
            Kids: sign in with a code
          </Button>
        </div>
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-hair pt-6">
        <Wordmark accent={false} size={26} />
        <p className="text-xs font-bold text-stone">
          No ads, ever. Children sign in with a code from their grown-up — never an email address.
        </p>
      </footer>
    </div>
  )
}

function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="grid grid-cols-1 items-center gap-6 rounded-[26px] bg-chalk p-7 ring-1 ring-hair md:grid-cols-[1fr_280px] md:p-10">
      <div>
        <Eyebrow>Spelling · Typing · Flashcards</Eyebrow>
        <h1 className="mt-2 font-display text-[40px] font-extrabold leading-[1.05] tracking-[-0.02em] text-ink md:text-[52px]">
          Practice that knows what your child can actually do.
        </h1>
        <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-body">
          Whizzo works out a learner’s real spelling level from the words they attempt, then keeps
          them at the edge of it. Add the typing course and flashcards for anything else, and it is
          one account, one progress record, for every child you look after.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button onClick={onStart}>Create a free account</Button>
          <Button variant="ghost" onClick={onStart}>
            I already have an account
          </Button>
        </div>
        <p className="mt-4 text-sm font-bold text-stone">
          Free for the whole curriculum · no ads · a child never needs an email address
        </p>
      </div>
      <div className="flex items-end justify-center">
        {/* Pinned rather than themed: the front door is brand chrome, and a
            theme left in this browser by whoever used the app here last is not
            a reason for a visitor to be met by a different character. */}
        <Mascot
          mood="cheer"
          themeId={DEFAULT_THEME_ID}
          color="#FF6A2B"
          size={220}
          className="animate-floaty"
        />
      </div>
    </section>
  )
}

const SUBJECTS: Array<{ emoji: string; title: string; body: string; points: string[] }> = [
  {
    emoji: '🔤',
    title: 'Spelling',
    body: 'Adaptive spelling from 2nd through 8th grade, on a curriculum of real graded word lists.',
    points: ['Finds the level in a handful of words', 'Six activities, one honest score', 'Words come back on their own schedule'],
  },
  {
    emoji: '⌨️',
    title: 'Typing',
    body: 'The full touch-typing course: home row to numbers, lessons, arcade rounds and a collection to build.',
    points: ['Guided lessons with hands and keyboard', 'Speed and accuracy tracked per key', 'Ten worlds to choose from'],
  },
  {
    emoji: '🃏',
    title: 'Flashcards',
    body: 'Decks for everything else — vocabulary, states, formulas, French verbs. Paste a list and study it four ways.',
    points: ['Type it, match it, flip it, multiple choice', 'The same spaced review as spelling', 'Starter decks included'],
  },
]

function Subjects() {
  return (
    <section className="mt-10">
      <Eyebrow>Three subjects, one record</Eyebrow>
      <h2 className="mt-1 font-display text-3xl font-extrabold tracking-[-0.02em] text-ink">
        What is inside
      </h2>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {SUBJECTS.map((s) => (
          <Card key={s.title}>
            <span className="text-4xl">{s.emoji}</span>
            <h3 className="mt-2 text-2xl font-extrabold text-ink">{s.title}</h3>
            <p className="mt-1 font-bold text-muted">{s.body}</p>
            <ul className="mt-3 space-y-1.5">
              {s.points.map((p) => (
                <li key={p} className="flex gap-2 text-[15px] font-bold text-body">
                  <span className="text-pine">✓</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </section>
  )
}

const STEPS: Array<{ n: string; title: string; body: string }> = [
  {
    n: '01',
    title: 'One scale for learners and words',
    body: 'Ability and word difficulty sit on the same axis — roughly school grade — so the model can predict how likely a learner is to get a word they have never seen. Nothing here is configured by hand.',
  },
  {
    n: '02',
    title: 'Only unaided spelling counts',
    body: 'Unscrambling letters, filling blanks and picking from four options are good practice, and none of them move the level. Ask for a hint and that word stops counting. It is the one rule that keeps the number honest.',
  },
  {
    n: '03',
    title: 'Words come back on their own schedule',
    body: 'Every word carries its own review state. Right, and the gap grows 1 → 2 → 4 → 8 → 16 → 32 → 60 days. Wrong, and it is due again immediately — in the same sitting, while the moment to fix it is still there.',
  },
]

function Adaptive() {
  return (
    <section className="mt-12">
      <Eyebrow>How the adaptive part works</Eyebrow>
      <h2 className="mt-1 font-display text-3xl font-extrabold tracking-[-0.02em] text-ink">
        “Adaptive” is a cheap claim, so here is the whole of it
      </h2>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-[22px] border border-hair bg-chalk p-5">
            <div className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-spark">
              {s.n}
            </div>
            <h3 className="mt-2 text-xl font-extrabold text-ink">{s.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-body">{s.body}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm font-bold text-stone">
        A theme never changes the curriculum, the difficulty, or what earns a reward. Picking horses
        instead of dinosaurs changes the paint and nothing else.
      </p>
    </section>
  )
}

const GROWNUP: Array<{ title: string; body: string }> = [
  {
    title: 'Add each child to your account',
    body: 'A child gets a full record without ever handing over an email address. They sign in on their own device with a code and a secret number you set.',
  },
  {
    title: 'Set work, and see it done',
    body: 'Assign a spelling list, a deck or a typing lesson. A task is only marked done by a finished session the app graded — never by a child saying so.',
  },
  {
    title: 'Progress you can actually read',
    body: 'Level by grade, unaided accuracy, every word missed, and the sessions behind each number.',
  },
  {
    title: 'Tutors and teachers, same product',
    body: 'Share your connection code with a family and they choose which of their children you can see. Their account stays theirs; you get the same screens a parent gets.',
  },
]

function ForGrownUps() {
  return (
    <section className="mt-12 rounded-[26px] bg-wash p-7 md:p-10">
      <Eyebrow>For parents, tutors and teachers</Eyebrow>
      <h2 className="mt-1 font-display text-3xl font-extrabold tracking-[-0.02em] text-ink">
        The grown-up half
      </h2>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {GROWNUP.map((g) => (
          <div key={g.title} className="rounded-[22px] bg-chalk p-5 ring-1 ring-hair">
            <h3 className="text-xl font-extrabold text-ink">{g.title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-body">{g.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Pricing({ onStart }: { onStart: () => void }) {
  return (
    <section className="mt-12">
      <Eyebrow>Plans</Eyebrow>
      <h2 className="mt-1 font-display text-3xl font-extrabold tracking-[-0.02em] text-ink">
        The learning is free. Pro is for the grown-ups keeping track.
      </h2>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {(['free', 'pro'] as const).map((id) => {
          const plan = PLANS[id]
          return (
            <Card key={id} className={id === 'pro' ? 'ring-2 ring-sun' : ''}>
              <h3 className="text-2xl font-extrabold text-ink">{plan.name}</h3>
              <p className="mb-3 font-bold text-muted">{plan.tagline}</p>
              <p className="mb-4">
                <span className="font-display text-4xl font-extrabold text-ink">{plan.price}</span>{' '}
                <span className="font-bold text-stone">{plan.cadence}</span>
              </p>
              <ul className="mb-5 space-y-2">
                {plan.perks.map((perk) => (
                  <li key={perk} className="flex gap-2 font-bold text-body">
                    <span className="text-pine">✓</span>
                    <span>{perk}</span>
                  </li>
                ))}
              </ul>
              {id === 'free' ? (
                <Button className="w-full" onClick={onStart}>
                  Create a free account
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
      <p className="mt-4 text-center text-xs font-bold text-stone">
        Family Pro is not taking payments yet — the free account is the whole curriculum either way.
      </p>
    </section>
  )
}

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: 'Does my child need an email address?',
    a: 'No. You add them to your account, and they sign in with a code and a secret number. Anyone who tells us they are under 13 is sent to fetch a grown-up rather than shown a sign-up form.',
  },
  {
    q: 'Why do I have to make an account to try it?',
    a: 'Practice is only worth anything if it is attributed to a learner: the level, the review schedule and the report all hang off one record. Signing in first is what makes a session count toward something.',
  },
  {
    q: 'What do you do with the data?',
    a: 'We store what is needed to track learning progress, and nothing else. No ads, no third-party trackers, and you can export everything as CSV.',
  },
  {
    q: 'Is the curriculum really free?',
    a: 'Yes. A spelling app that locks fourth grade behind a card number is not much use to the kid who needs fourth grade. Pro pays for the reporting and list-building tools grown-ups ask for.',
  },
]

function Privacy() {
  return (
    <section className="mt-12">
      <Eyebrow>Questions</Eyebrow>
      <h2 className="mt-1 font-display text-3xl font-extrabold tracking-[-0.02em] text-ink">
        Before you sign up
      </h2>
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        {FAQ.map((f) => (
          <div key={f.q} className="rounded-[22px] bg-quiet p-5">
            <h3 className="text-lg font-extrabold text-ink">{f.q}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-body">{f.a}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
