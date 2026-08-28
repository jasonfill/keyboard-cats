import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import ScreenHeader from '../../components/suite/ScreenHeader'
import SharedWork from '../../components/suite/SharedWork'
import { Button, Card, Pill } from '../../components/ui'
import { STARTER_DECKS } from '../../data/quiz/starterDecks'
import {
  deleteLibraryDeck,
  deleteLibraryList,
  loadLibrary,
  saveLibraryDecks,
  saveLibraryLists,
} from '../../lib/assignments/library'
import { useLearners } from '../../lib/learners/LearnerProvider'
import { useProgress } from '../../lib/progress/ProgressProvider'
import type { CustomWordList, QuizDeck } from '../../lib/progress/types'
import { allDecks, newId } from '../../lib/quiz/decks'
import type { Navigate } from '../../routes'
import AssignForm from './AssignForm'

/**
 * Everything a grown-up owns, and the place to set it as work.
 *
 * Content used to belong to a learner, which is fine for a child making their
 * own flashcards and wrong for anyone teaching more than one person: material
 * ends up filed under whichever student was on screen, and reusing it means
 * copying it. A library is content that is *yours* — built once, set for as
 * many learners as you like, and readable by a student only once you have
 * actually given it to them.
 *
 * Assigning lives here as well as on a child's task list, because "set this for
 * three of them" starts from the material, not from a child.
 */
export default function LibraryScreen({ navigate }: { navigate: Navigate }) {
  const { status, user } = useAuth()
  const { learners } = useLearners()
  const { snapshot } = useProgress()

  const [decks, setDecks] = useState<QuizDeck[]>([])
  const [lists, setLists] = useState<CustomWordList[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [assigning, setAssigning] = useState<{ kind: 'deck' | 'list'; id: string } | null>(null)

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const lib = await loadLibrary(signal)
      if (!signal?.aborted) {
        setDecks(lib.decks)
        setLists(lib.customLists)
      }
    } catch {
      /* an empty library reads the same as one that would not load */
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status !== 'signed-in') {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load, status])

  /** Decks belonging to the learners this grown-up looks after, worth copying in. */
  const learnerDecks = useMemo(
    () => allDecks(snapshot, STARTER_DECKS).filter((d) => d.source === 'user'),
    [snapshot],
  )

  const assignable = learners.filter((l) => l.authUserId !== user?.id)

  if (status !== 'signed-in') {
    return (
      <div className="mx-auto w-full max-w-3xl py-4">
        <ScreenHeader title="Library 📚" onBack={() => navigate({ name: 'home' })} />
        <Card>
          <p className="mb-3 font-bold text-slate-500">
            A library holds the decks and word lists that are yours rather than any one
            learner&apos;s, so it needs an account.
          </p>
          <Button onClick={() => navigate({ name: 'auth' })}>Sign in</Button>
        </Card>
      </div>
    )
  }

  const copyIn = async (deck: QuizDeck) => {
    setBusy(deck.id)
    try {
      // A new id: this is a copy in your library, not a move of the child's.
      await saveLibraryDecks([{ ...deck, id: newId('d'), createdAt: Date.now(), updatedAt: Date.now() }])
      await load()
    } finally {
      setBusy(null)
    }
  }

  const copyListIn = async (list: CustomWordList) => {
    setBusy(list.id)
    try {
      await saveLibraryLists([{ ...list, id: newId('l') }])
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl py-4">
      <ScreenHeader
        title="Library 📚"
        subtitle="Everything you have made, ready to set for any learner you look after."
        onBack={() => navigate({ name: 'home' })}
      />

      {assigning && (
        <div className="mb-4">
          <AssignForm
            learners={assignable}
            defaultLearnerIds={[]}
            fixedTarget={assigning}
            onDone={() => setAssigning(null)}
            onCancel={() => setAssigning(null)}
          />
        </div>
      )}

      <Card className="mb-4">
        <h2 className="mb-1 text-xl font-extrabold text-grape">Your decks ({decks.length})</h2>
        <p className="mb-3 font-bold text-slate-500">
          Yours, not any one learner&apos;s. A student can only open one after you have set it for
          them.
        </p>
        {loading ? (
          <p className="font-bold text-slate-400">Loading…</p>
        ) : decks.length === 0 ? (
          <p className="font-bold text-slate-400">
            Nothing here yet. Copy one in from below, or make a deck and add it.
          </p>
        ) : (
          <ul className="space-y-2">
            {decks.map((deck) => (
              <li
                key={deck.id}
                className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/85 px-4 py-3 ring-1 ring-purple-100"
              >
                <span className="font-extrabold text-grape">{deck.title}</span>
                <Pill className="bg-slate-100 text-xs text-slate-500">
                  {deck.cards.length} cards
                </Pill>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button onClick={() => setAssigning({ kind: 'deck', id: deck.id })}>
                    Set as work
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy === deck.id}
                    onClick={async () => {
                      setBusy(deck.id)
                      try {
                        await deleteLibraryDeck(deck.id)
                        await load()
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    🗑️
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mb-4">
        <h2 className="mb-1 text-xl font-extrabold text-grape">
          Your word lists ({lists.length})
        </h2>
        {loading ? (
          <p className="font-bold text-slate-400">Loading…</p>
        ) : lists.length === 0 ? (
          <p className="font-bold text-slate-400">No word lists of your own yet.</p>
        ) : (
          <ul className="space-y-2">
            {lists.map((list) => (
              <li
                key={list.id}
                className="flex flex-wrap items-center gap-2 rounded-2xl bg-white/85 px-4 py-3 ring-1 ring-purple-100"
              >
                <span className="font-extrabold text-grape">{list.title}</span>
                <Pill className="bg-slate-100 text-xs text-slate-500">
                  {list.words.length} words
                </Pill>
                <div className="ml-auto flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    disabled={busy === list.id}
                    onClick={async () => {
                      setBusy(list.id)
                      try {
                        await deleteLibraryList(list.id)
                        await load()
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    🗑️
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Work already set — the same panel the task list shows, because "what
          have I given out?" belongs next to "what have I made?". */}
      <SharedWork />

      {(learnerDecks.length > 0 || snapshot.customLists.length > 0) && (
        <Card>
          <h2 className="mb-1 text-xl font-extrabold text-grape">Copy into your library</h2>
          <p className="mb-3 font-bold text-slate-500">
            Material that belongs to a learner. Copying leaves theirs alone and gives you one you
            can set for anybody.
          </p>
          <div className="flex flex-wrap gap-2">
            {learnerDecks.map((deck) => (
              <Button
                key={deck.id}
                variant="secondary"
                disabled={busy === deck.id}
                onClick={() => copyIn(deck)}
              >
                🃏 {deck.title}
              </Button>
            ))}
            {snapshot.customLists.map((list) => (
              <Button
                key={list.id}
                variant="secondary"
                disabled={busy === list.id}
                onClick={() => copyListIn(list)}
              >
                ✏️ {list.title}
              </Button>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
