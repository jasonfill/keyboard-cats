import { useMemo } from 'react'
import CatMascot from '../../components/CatMascot'
import MasteryBar from '../../components/suite/MasteryBar'
import ScreenHeader from '../../components/suite/ScreenHeader'
import { Button, Card, Pill, StarRow } from '../../components/ui'
import { STARTER_DECKS } from '../../data/quiz/starterDecks'
import { limitsFor } from '../../lib/plans'
import { useAuth } from '../../auth/AuthProvider'
import { useProgress } from '../../lib/progress/ProgressProvider'
import { listKey, todayString, type QuizDeck } from '../../lib/progress/types'
import { allDecks, deckStats } from '../../lib/quiz/decks'
import { dueAcrossDecks } from '../../lib/quiz/session'
import type { Navigate } from '../../routes'

export default function QuizHome({ navigate }: { navigate: Navigate }) {
  const { profile } = useAuth()
  const { snapshot, skill } = useProgress()
  const state = skill('quiz')
  const limits = limitsFor(profile?.plan ?? 'free')
  const today = todayString()

  const mine = useMemo(
    () => [...snapshot.decks].sort((a, b) => b.updatedAt - a.updatedAt),
    [snapshot.decks],
  )
  const everything = useMemo(() => allDecks(snapshot, STARTER_DECKS), [snapshot])
  const due = useMemo(() => dueAcrossDecks(snapshot, everything, today), [snapshot, everything, today])

  const totals = useMemo(() => {
    let cards = 0
    let mastered = 0
    let practiced = 0
    let learning = 0
    for (const deck of everything) {
      const s = deckStats(snapshot, deck, today)
      cards += s.total
      mastered += s.mastered
      practiced += s.practiced
      learning += s.learning
    }
    return { cards, mastered, practiced, learning }
  }, [everything, snapshot, today])

  const atLimit = mine.length >= limits.decks

  return (
    <div className="mx-auto w-full max-w-4xl py-4">
      <ScreenHeader
        title="Quiz Cats 🃏"
        subtitle="Flashcards for anything you need to learn by heart."
        onBack={() => navigate({ name: 'home' })}
        backLabel="← Academy"
      />

      {/* Streak and totals */}
      <div className="mb-5 rounded-3xl bg-gradient-to-r from-emerald-300 to-teal-400 p-1 shadow-lg">
        <div className="rounded-[22px] bg-white/92 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                Your cards
              </p>
              <h2 className="text-2xl font-extrabold text-grape">
                {totals.mastered} of {totals.cards} mastered
              </h2>
              <p className="font-bold text-slate-500">
                {state.streakDays > 0
                  ? `🔥 ${state.streakDays} day streak — keep it going.`
                  : 'Study any deck today to start a streak.'}
              </p>
            </div>
            <CatMascot mood={totals.mastered > 0 ? 'excited' : 'happy'} size={72} />
          </div>
          <MasteryBar
            className="mt-4"
            total={totals.cards}
            mastered={totals.mastered}
            practiced={totals.practiced}
            learning={totals.learning}
          />
        </div>
      </div>

      {/* The cross-deck review queue — the thing spaced repetition is for. */}
      {due.length > 0 && (
        <Card className="mb-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <h3 className="text-xl font-extrabold text-grape">Due for review</h3>
                <Pill className="bg-amber-100 text-amber-700">🔁 {due.length} cards</Pill>
              </div>
              <p className="font-bold text-slate-500">
                Cards from every deck that you are about to forget. Ten minutes here beats an hour
                the night before.
              </p>
            </div>
            <Button
              onClick={() =>
                navigate({ name: 'quiz-play', mode: 'review', size: Math.min(due.length, 20) })
              }
            >
              🔁 Review {Math.min(due.length, 20)} cards
            </Button>
          </div>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl font-extrabold text-grape">My decks</h3>
        <Button onClick={() => navigate({ name: 'quiz-edit' })} disabled={atLimit}>
          ➕ New deck
        </Button>
      </div>

      {atLimit && (
        <Card className="mb-4">
          <p className="font-bold text-amber-700">
            The free plan saves {limits.decks} decks.{' '}
            <button className="underline" onClick={() => navigate({ name: 'upgrade' })}>
              Family Pro
            </button>{' '}
            lifts that limit. Starter decks never count against it.
          </p>
        </Card>
      )}

      {mine.length === 0 ? (
        <Card className="mb-6">
          <p className="mb-3 font-bold text-slate-500">
            No decks of your own yet. Make one by pasting a list — vocabulary, dates, formulas,
            anything with two sides to it — or start with one of ours below.
          </p>
          <Button onClick={() => navigate({ name: 'quiz-edit' })}>➕ Make my first deck</Button>
        </Card>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-2">
          {mine.map((deck) => (
            <DeckCard key={deck.id} deck={deck} navigate={navigate} />
          ))}
        </div>
      )}

      <h3 className="mb-3 text-2xl font-extrabold text-grape">Starter decks</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {STARTER_DECKS.map((deck) => (
          <DeckCard key={deck.id} deck={deck} navigate={navigate} />
        ))}
      </div>
    </div>
  )
}

function DeckCard({ deck, navigate }: { deck: QuizDeck; navigate: Navigate }) {
  const { snapshot } = useProgress()
  const today = todayString()
  const stats = deckStats(snapshot, deck, today)
  const progress = snapshot.lists[listKey('quiz', deck.id)]

  return (
    <button
      onClick={() => navigate({ name: 'quiz-deck', deckId: deck.id })}
      className="rounded-3xl bg-white/85 p-5 text-left shadow-xl ring-1 ring-purple-100 backdrop-blur transition-transform hover:-translate-y-1 hover:shadow-2xl"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-extrabold text-grape">{deck.title}</h4>
          <p className="text-sm font-bold text-slate-400">
            {deck.cards.length} cards
            {stats.seen > 0 && ` · ${stats.mastered} mastered`}
          </p>
        </div>
        {deck.source === 'starter' ? (
          <Pill className="shrink-0 bg-teal-100 text-teal-700">Starter</Pill>
        ) : (
          <Pill className="shrink-0 bg-purple-100 text-grape">Mine</Pill>
        )}
      </div>

      {deck.description && (
        <p className="mb-3 text-sm font-bold text-slate-500">{deck.description}</p>
      )}

      <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all"
          style={{ width: `${Math.round(stats.progress * 100)}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {stats.due > 0 && <Pill className="bg-amber-100 text-amber-700">🔁 {stats.due} due</Pill>}
        {progress?.stars ? <StarRow stars={progress.stars} size={18} /> : null}
        {stats.lastStudiedAt && (
          <span className="text-xs font-bold text-slate-400">
            Last studied {new Date(stats.lastStudiedAt).toLocaleDateString()}
          </span>
        )}
      </div>
    </button>
  )
}
