// A library, grouped the way it was made.
//
// A twenty-page chapter comes back from ingestion as six sets. Dropped into an
// alphabetical list of thirty decks they are six unrelated rows, and the one
// fact the upload established — that these belong together, in this order — is
// thrown away at exactly the moment it would save the parent work.
//
// This does not invent structure. It reports the structure that is already in
// the data: a shared `sourceId` means one document, and the order the pipeline
// wrote them in is the order the document had.

import type { QuizDeck } from '@whizzo/shared'

export interface DeckGroup {
  /** The document these came from, or null for sets made by hand. */
  sourceId: string | null
  title: string
  decks: QuizDeck[]
  /** Cards across the whole group — what "set all of this" is actually worth. */
  cards: number
}

/**
 * Sets grouped by the document they came from.
 *
 * Loose sets — typed by hand, copied in, or from a source since deleted — end
 * up in one trailing group with a null id, because they are a list and not a
 * chapter. That group is last: a parent who has just uploaded something is
 * looking for it, not for the deck they typed in March.
 *
 * Within a group the pipeline's order is kept (oldest first, which is the
 * order the topics appeared in the document). Between groups, the most
 * recently touched document comes first.
 */
export function groupBySource(decks: readonly QuizDeck[]): DeckGroup[] {
  const bySource = new Map<string, QuizDeck[]>()
  const loose: QuizDeck[] = []

  for (const deck of decks) {
    if (!deck.sourceId) {
      loose.push(deck)
      continue
    }
    const bucket = bySource.get(deck.sourceId)
    if (bucket) bucket.push(deck)
    else bySource.set(deck.sourceId, [deck])
  }

  const groups: DeckGroup[] = []
  for (const [sourceId, group] of bySource) {
    // A single set from a document is not a chapter — grouping it under its own
    // filename adds a heading and says nothing.
    if (group.length < 2) {
      loose.push(...group)
      continue
    }
    const ordered = [...group].sort((a, b) => a.createdAt - b.createdAt)
    groups.push({
      sourceId,
      // Every set from one document carries the same title; the first that has
      // one wins, and a document whose title never made it through is named by
      // nothing rather than by a guess.
      title: ordered.find((d) => d.sourceTitle)?.sourceTitle ?? 'From a document',
      decks: ordered,
      cards: ordered.reduce((n, d) => n + d.cards.length, 0),
    })
  }

  groups.sort((a, b) => lastTouched(b.decks) - lastTouched(a.decks))

  if (loose.length > 0) {
    groups.push({
      sourceId: null,
      title: 'Everything else',
      decks: loose,
      cards: loose.reduce((n, d) => n + d.cards.length, 0),
    })
  }

  return groups
}

function lastTouched(decks: readonly QuizDeck[]): number {
  return decks.reduce((n, d) => Math.max(n, d.updatedAt), 0)
}
