import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import ScreenHeader from '../../components/suite/ScreenHeader'
import { Button, Card, Pill } from '../../components/ui'
import { limitsFor } from '../../lib/plans'
import { useProgress } from '../../lib/progress/ProgressProvider'
import type { QuizCard, QuizDeck } from '../../lib/progress/types'
import {
  MAX_CARDS_PER_DECK,
  emptyDeck,
  makeCard,
  normalizeDeck,
  parseImport,
  type CardSeparator,
  type TermSeparator,
} from '../../lib/quiz/decks'
import type { Navigate } from '../../routes'

/**
 * Deck editor. Two ways in, because there are two kinds of person making a
 * deck: the one pasting forty rows out of a study guide, and the one typing
 * six cards for tomorrow's test. Paste-import handles the first; the row
 * editor handles the second, and both write the same deck.
 */
export default function DeckEditor({
  deckId,
  navigate,
}: {
  deckId?: string
  navigate: Navigate
}) {
  const { profile } = useAuth()
  const { snapshot, saveDeck } = useProgress()
  const limits = limitsFor(profile?.plan ?? 'free')

  const existing = deckId ? snapshot.decks.find((d) => d.id === deckId) : undefined
  const [draft, setDraft] = useState<QuizDeck>(() => existing ?? emptyDeck())
  const [showImport, setShowImport] = useState(!existing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isNew = !existing
  const overDeckLimit = isNew && snapshot.decks.length >= limits.decks

  const update = (patch: Partial<QuizDeck>) => setDraft((d) => ({ ...d, ...patch }))

  const setCard = (id: string, patch: Partial<QuizCard>) =>
    setDraft((d) => ({
      ...d,
      cards: d.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }))

  const addCard = () =>
    setDraft((d) => ({ ...d, cards: [...d.cards, makeCard('', '')] }))

  const removeCard = (id: string) =>
    setDraft((d) => ({ ...d, cards: d.cards.filter((c) => c.id !== id) }))

  const moveCard = (id: string, delta: number) =>
    setDraft((d) => {
      const i = d.cards.findIndex((c) => c.id === id)
      const j = i + delta
      if (i < 0 || j < 0 || j >= d.cards.length) return d
      const cards = [...d.cards]
      ;[cards[i], cards[j]] = [cards[j], cards[i]]
      return { ...d, cards }
    })

  const ready = draft.title.trim().length > 0 && draft.cards.filter(isFilled).length >= 2

  const save = async () => {
    if (!ready || overDeckLimit) return
    setBusy(true)
    setError(null)
    try {
      const normalized = normalizeDeck(draft)
      await saveDeck(normalized)
      navigate({ name: 'quiz-deck', deckId: normalized.id })
    } catch (err) {
      console.warn('[cat-academy] deck save failed', err)
      setError('That did not save. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl py-4">
      <ScreenHeader
        title={isNew ? 'New deck 🃏' : 'Edit deck ✏️'}
        subtitle="Two sides to every card: what you are asked, and what you have to remember."
        onBack={() =>
          navigate(deckId ? { name: 'quiz-deck', deckId } : { name: 'quiz' })
        }
      />

      {overDeckLimit && (
        <Card className="mb-4">
          <p className="font-bold text-amber-700">
            You have used all {limits.decks} of your free decks.{' '}
            <button className="underline" onClick={() => navigate({ name: 'upgrade' })}>
              Family Pro
            </button>{' '}
            lifts the limit, or you can delete one you have finished with.
          </p>
        </Card>
      )}

      <Card className="mb-4">
        <label className="mb-1 block text-sm font-bold text-slate-500">Deck name</label>
        <input
          value={draft.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Chapter 7 — the Water Cycle"
          maxLength={80}
          className="mb-4 w-full rounded-xl border-2 border-purple-200 px-4 py-3 font-bold text-grape focus:border-grape focus:outline-none"
        />

        <label className="mb-1 block text-sm font-bold text-slate-500">
          Description <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Everything on Friday's test."
          maxLength={300}
          className="mb-4 w-full rounded-xl border-2 border-purple-200 px-4 py-3 font-bold text-grape focus:border-grape focus:outline-none"
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-500">Call side one</label>
            <input
              value={draft.termLabel}
              onChange={(e) => update({ termLabel: e.target.value })}
              placeholder="Term"
              maxLength={24}
              className="w-full rounded-xl border-2 border-purple-200 px-4 py-2.5 font-bold text-grape focus:border-grape focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-slate-500">Call side two</label>
            <input
              value={draft.definitionLabel}
              onChange={(e) => update({ definitionLabel: e.target.value })}
              placeholder="Definition"
              maxLength={24}
              className="w-full rounded-xl border-2 border-purple-200 px-4 py-2.5 font-bold text-grape focus:border-grape focus:outline-none"
            />
          </div>
        </div>
      </Card>

      {showImport ? (
        <ImportPanel
          onCancel={() => setShowImport(false)}
          onImport={(cards, replace) =>
            setDraft((d) => ({
              ...d,
              cards: replace ? cards : [...d.cards, ...cards],
            }))
          }
        />
      ) : (
        <Button variant="ghost" className="mb-4 w-full" onClick={() => setShowImport(true)}>
          📥 Paste a list instead
        </Button>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl font-extrabold text-grape">
          Cards ({draft.cards.filter(isFilled).length})
        </h3>
        <Button variant="ghost" onClick={addCard} disabled={draft.cards.length >= MAX_CARDS_PER_DECK}>
          ➕ Add a card
        </Button>
      </div>

      <div className="mb-4 space-y-2">
        {draft.cards.length === 0 && (
          <Card>
            <p className="font-bold text-slate-400">
              No cards yet. Add one below, or paste a whole list at once.
            </p>
          </Card>
        )}
        {draft.cards.map((card, i) => (
          <div
            key={card.id}
            className="rounded-2xl bg-white/85 p-3 shadow ring-1 ring-purple-100"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">
                Card {i + 1}
              </span>
              <div className="flex gap-1">
                <IconButton label="Move up" onClick={() => moveCard(card.id, -1)} disabled={i === 0}>
                  ↑
                </IconButton>
                <IconButton
                  label="Move down"
                  onClick={() => moveCard(card.id, 1)}
                  disabled={i === draft.cards.length - 1}
                >
                  ↓
                </IconButton>
                <IconButton label="Delete card" onClick={() => removeCard(card.id)}>
                  ✕
                </IconButton>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                value={card.term}
                onChange={(e) => setCard(card.id, { term: e.target.value })}
                placeholder={draft.termLabel}
                className="w-full rounded-xl border-2 border-purple-200 px-3 py-2 font-bold text-grape focus:border-grape focus:outline-none"
              />
              <input
                value={card.definition}
                onChange={(e) => setCard(card.id, { definition: e.target.value })}
                placeholder={draft.definitionLabel}
                className="w-full rounded-xl border-2 border-purple-200 px-3 py-2 font-bold text-slate-600 focus:border-grape focus:outline-none"
              />
            </div>
          </div>
        ))}
      </div>

      {error && (
        <Card className="mb-4">
          <p className="font-bold text-rose-600">{error}</p>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={save} disabled={!ready || busy || overDeckLimit}>
          {busy ? 'Saving…' : `Save deck (${draft.cards.filter(isFilled).length} cards)`}
        </Button>
        <Button
          variant="ghost"
          onClick={() => navigate(deckId ? { name: 'quiz-deck', deckId } : { name: 'quiz' })}
        >
          Cancel
        </Button>
      </div>
      {!ready && (
        <p className="mt-3 text-sm font-bold text-slate-400">
          A deck needs a name and at least two complete cards.
        </p>
      )}
    </div>
  )
}

function isFilled(card: QuizCard): boolean {
  return card.term.trim().length > 0 && card.definition.trim().length > 0
}

function IconButton({
  children,
  onClick,
  label,
  disabled,
}: {
  children: string
  onClick: () => void
  label: string
  disabled?: boolean
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-7 rounded-lg bg-purple-50 font-extrabold text-grape transition-colors hover:bg-purple-100 disabled:opacity-30"
    >
      {children}
    </button>
  )
}

const TERM_OPTIONS: Array<{ id: TermSeparator; label: string }> = [
  { id: 'auto', label: 'Detect' },
  { id: 'tab', label: 'Tab' },
  { id: 'comma', label: 'Comma' },
  { id: 'dash', label: 'Dash' },
  { id: 'colon', label: 'Colon' },
]

const ROW_OPTIONS: Array<{ id: CardSeparator; label: string }> = [
  { id: 'auto', label: 'Detect' },
  { id: 'newline', label: 'New line' },
  { id: 'blank-line', label: 'Blank line' },
  { id: 'semicolon', label: 'Semicolon' },
]

function ImportPanel({
  onImport,
  onCancel,
}: {
  onImport: (cards: QuizCard[], replace: boolean) => void
  onCancel: () => void
}) {
  const [text, setText] = useState('')
  const [between, setBetween] = useState<TermSeparator>('auto')
  const [rows, setRows] = useState<CardSeparator>('auto')

  // Parsing on every keystroke is cheap and gives a live preview, which is the
  // only reliable way to tell someone their separator guess is wrong.
  const preview = useMemo(() => parseImport(text, { between, rows }), [text, between, rows])

  return (
    <Card className="mb-4">
      <h3 className="mb-1 text-xl font-extrabold text-grape">Paste a list 📥</h3>
      <p className="mb-3 font-bold text-slate-500">
        One card per line, with the two sides separated. Copying straight out of a spreadsheet or a
        table already works — that pastes as tabs.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        placeholder={'photosynthesis\tHow plants make food from sunlight\nmitochondria\tThe part of a cell that makes energy'}
        className="mb-3 w-full rounded-xl border-2 border-purple-200 px-4 py-3 font-mono text-sm font-bold text-grape focus:border-grape focus:outline-none"
      />

      <div className="mb-3 flex flex-wrap gap-4">
        <SeparatorPicker
          label="Between the two sides"
          options={TERM_OPTIONS}
          value={between}
          onChange={setBetween}
        />
        <SeparatorPicker label="Between cards" options={ROW_OPTIONS} value={rows} onChange={setRows} />
      </div>

      {text.trim() && (
        <div className="mb-3 rounded-2xl bg-slate-50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Pill className="bg-emerald-100 text-emerald-700">
              {preview.cards.length} {preview.cards.length === 1 ? 'card' : 'cards'} found
            </Pill>
            {preview.skipped.length > 0 && (
              <Pill className="bg-amber-100 text-amber-700">
                {preview.skipped.length} {preview.skipped.length === 1 ? 'line' : 'lines'} skipped
              </Pill>
            )}
            <span className="text-xs font-bold text-slate-400">
              split on {preview.separator}
            </span>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {preview.cards.slice(0, 8).map((c) => (
              <div key={c.id} className="flex gap-2 text-sm">
                <span className="min-w-[8rem] font-extrabold text-grape">{c.term}</span>
                <span className="font-bold text-slate-500">{c.definition}</span>
              </div>
            ))}
            {preview.cards.length > 8 && (
              <p className="text-xs font-bold text-slate-400">
                …and {preview.cards.length - 8} more
              </p>
            )}
          </div>
          {preview.skipped.length > 0 && (
            <p className="mt-2 text-xs font-bold text-amber-700">
              Skipped because there was nothing on the far side of the separator:{' '}
              {preview.skipped.slice(0, 3).join(' · ')}
              {preview.skipped.length > 3 && ` · +${preview.skipped.length - 3} more`}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            onImport(preview.cards, true)
            onCancel()
          }}
          disabled={preview.cards.length === 0}
        >
          Use these {preview.cards.length || ''} cards
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            onImport(preview.cards, false)
            onCancel()
          }}
          disabled={preview.cards.length === 0}
        >
          Add to what I have
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}

function SeparatorPicker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ id: T; label: string }>
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="flex flex-wrap gap-1 rounded-2xl bg-white/70 p-1 ring-1 ring-purple-200">
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={`rounded-xl px-2.5 py-1 text-sm font-extrabold transition-colors ${
              value === o.id ? 'bg-grape text-white' : 'text-grape hover:bg-purple-50'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
