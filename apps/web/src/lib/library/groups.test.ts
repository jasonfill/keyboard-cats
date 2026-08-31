// Grouping reports what the data already says; it never invents structure.

import { describe, expect, it } from 'vitest'
import type { QuizDeck } from '@whizzo/shared'
import { groupBySource } from './groups'

function aDeck(over: Partial<QuizDeck> = {}): QuizDeck {
  return {
    id: 'd1',
    title: 'A set',
    description: '',
    tags: [],
    cards: [],
    source: 'user',
    termLabel: 'Term',
    definitionLabel: 'Definition',
    createdAt: 0,
    updatedAt: 0,
    ...over,
  } as QuizDeck
}

describe('sets from one document', () => {
  it('are gathered under the document', () => {
    const groups = groupBySource([
      aDeck({ id: 'a', sourceId: 's1', sourceTitle: 'Chapter 7', createdAt: 1 }),
      aDeck({ id: 'b', sourceId: 's1', sourceTitle: 'Chapter 7', createdAt: 2 }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.title).toBe('Chapter 7')
    expect(groups[0]!.decks.map((d) => d.id)).toEqual(['a', 'b'])
  })

  it('keep the order the document had, not the order they were listed in', () => {
    // The list arrives newest-first from the server. A chapter read back to
    // front is not the chapter.
    const groups = groupBySource([
      aDeck({ id: 'third', sourceId: 's1', createdAt: 30 }),
      aDeck({ id: 'first', sourceId: 's1', createdAt: 10 }),
      aDeck({ id: 'second', sourceId: 's1', createdAt: 20 }),
    ])
    expect(groups[0]!.decks.map((d) => d.id)).toEqual(['first', 'second', 'third'])
  })

  it('count what setting the whole thing is worth', () => {
    const card = { id: 'c', term: 't', definition: 'd' } as never
    const groups = groupBySource([
      aDeck({ id: 'a', sourceId: 's1', cards: [card, card] }),
      aDeck({ id: 'b', sourceId: 's1', cards: [card] }),
    ])
    expect(groups[0]!.cards).toBe(3)
  })

  it('put the most recently touched document first', () => {
    const groups = groupBySource([
      aDeck({ id: 'a', sourceId: 'old', updatedAt: 1 }),
      aDeck({ id: 'b', sourceId: 'old', updatedAt: 2 }),
      aDeck({ id: 'c', sourceId: 'new', updatedAt: 90 }),
      aDeck({ id: 'd', sourceId: 'new', updatedAt: 91 }),
    ])
    expect(groups.map((g) => g.sourceId)).toEqual(['new', 'old'])
  })
})

describe('what is not a chapter', () => {
  it('leaves hand-made sets loose', () => {
    const groups = groupBySource([aDeck({ id: 'a' }), aDeck({ id: 'b' })])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.sourceId).toBeNull()
  })

  it('does not give a lone set from a document a heading of its own', () => {
    // One set under its own filename is a heading that says nothing twice.
    const groups = groupBySource([
      aDeck({ id: 'only', sourceId: 's1', sourceTitle: 'A page' }),
      aDeck({ id: 'typed' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]!.sourceId).toBeNull()
    expect(groups[0]!.decks.map((d) => d.id).sort()).toEqual(['only', 'typed'])
  })

  it('keeps the loose ones last, whatever they are called', () => {
    const groups = groupBySource([
      aDeck({ id: 'typed', updatedAt: 999 }),
      aDeck({ id: 'a', sourceId: 's1', updatedAt: 1 }),
      aDeck({ id: 'b', sourceId: 's1', updatedAt: 1 }),
    ])
    // Even though the hand-typed set is the most recent thing in the library:
    // "Everything else" is a bucket, not a document, and a bucket at the top
    // buries the chapter the parent just uploaded.
    expect(groups.map((g) => g.sourceId)).toEqual(['s1', null])
  })

  it('names a document whose title never arrived, without guessing', () => {
    const groups = groupBySource([
      aDeck({ id: 'a', sourceId: 's1' }),
      aDeck({ id: 'b', sourceId: 's1' }),
    ])
    expect(groups[0]!.title).toBe('From a document')
  })

  it('has nothing to say about an empty library', () => {
    expect(groupBySource([])).toEqual([])
  })
})
