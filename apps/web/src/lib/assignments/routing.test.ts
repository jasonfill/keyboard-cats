// Where a task's "Start" button goes.
//
// The failure that matters is silent: a task pointing at something deleted
// since it was set must return null so the caller can say so, rather than
// navigating a child into an empty round.

import { describe, expect, it } from 'vitest'
import { ASSIGNABLE, assignableFor, routeForAssignment, targetName } from './routing'
import { GRADES } from '../../data/spelling'
import { CURRICULUM } from '../../data/lessons'
import type { Assignment } from '../progress/types'

function task(over: Partial<Assignment> = {}): Assignment {
  return {
    id: 'a1',
    setId: 's1',
    learnerId: 'l1',
    subject: 'spelling',
    activity: 'test',
    targetId: null,
    size: null,
    title: 'Friday spelling',
    note: null,
    minAccuracy: null,
    dueOn: null,
    status: 'open',
    completedAt: null,
    sessionId: null,
    sortOrder: 0,
    createdAt: 0,
    ...over,
  } as Assignment
}

describe('assignableFor', () => {
  it('finds every activity the picker offers', () => {
    for (const a of ASSIGNABLE) {
      expect(assignableFor(a.subject, a.activity)).toBeDefined()
    }
  })

  it('does not invent one for an unknown activity', () => {
    expect(assignableFor('spelling', 'telepathy')).toBeUndefined()
  })

  it('does not confuse two subjects that share an activity name', () => {
    // Both spelling and quiz have an activity called 'test'.
    const spelling = assignableFor('spelling', 'test')
    const quiz = assignableFor('quiz', 'test')
    if (spelling && quiz) expect(spelling).not.toBe(quiz)
  })
})

describe('routeForAssignment', () => {
  it('sends a spelling task pinned to a list into that list', () => {
    const listId = GRADES[0]!.lists[0]!.id
    const route = routeForAssignment(task({ targetId: listId }))
    expect(route).toMatchObject({ name: 'spell-play', mode: 'list', listId })
  })

  it('sends an unpinned spelling task into the adaptive mix', () => {
    // "Just do some spelling" means whatever is due, not a fixed list.
    expect(routeForAssignment(task({ targetId: null }))).toMatchObject({
      name: 'spell-play',
      mode: 'adaptive',
    })
  })

  it('carries the size a grown-up asked for', () => {
    expect(routeForAssignment(task({ size: 20 }))).toMatchObject({ size: 20 })
  })

  it('sends a quiz task to the deck in the mode it was set in', () => {
    const route = routeForAssignment(
      task({ subject: 'quiz', activity: 'test', targetId: 'deck-1' }),
    )
    expect(route).toMatchObject({ name: 'quiz-play', deckId: 'deck-1' })
  })

  it('sends a typing task to its lesson', () => {
    const id = CURRICULUM[0]!.id
    expect(routeForAssignment(task({ subject: 'typing', activity: 'lesson', targetId: id })))
      .toMatchObject({ name: 'lesson', id })
  })

  it('returns null for an activity that no longer exists', () => {
    expect(routeForAssignment(task({ activity: 'telepathy' }))).toBeNull()
    expect(routeForAssignment(task({ subject: 'quiz', activity: 'telepathy' }))).toBeNull()
  })

  it('returns null for a typing task with nothing to open', () => {
    expect(routeForAssignment(task({ subject: 'typing', activity: 'lesson', targetId: null })))
      .toBeNull()
  })

  it('produces a startable route for every assignable activity', () => {
    for (const a of ASSIGNABLE) {
      const route = routeForAssignment(
        task({ subject: a.subject, activity: a.activity, targetId: a.subject === 'typing' ? CURRICULUM[0]!.id : null }),
      )
      expect(route, `${a.subject}/${a.activity}`).not.toBeNull()
    }
  })
})

describe('targetName', () => {
  const noDecks = new Map<string, string>()

  it('names the spelling list a task points at', () => {
    const list = GRADES[0]!.lists[0]!
    expect(targetName(task({ targetId: list.id }), noDecks)).toBe(list.title)
  })

  it('says what an unpinned task means rather than leaving it blank', () => {
    expect(targetName(task({ targetId: null }), noDecks)).toBe('whatever is due')
  })

  it('names a deck from the titles it was given', () => {
    const decks = new Map([['d1', 'Capital cities']])
    expect(targetName(task({ subject: 'quiz', targetId: 'd1' }), decks)).toBe('Capital cities')
  })

  it('says plainly when the deck has been deleted since', () => {
    // A parent seeing this needs to know why the task will not start.
    expect(targetName(task({ subject: 'quiz', targetId: 'gone' }), noDecks)).toMatch(/deleted/)
  })

  it('falls back to a readable phrase for a missing spelling list', () => {
    expect(targetName(task({ targetId: 'no-such-list' }), noDecks)).toBe('a word list')
  })

  it('never returns an empty string', () => {
    for (const subject of ['spelling', 'typing', 'quiz'] as const) {
      for (const targetId of [null, 'missing']) {
        expect(targetName(task({ subject, targetId }), noDecks)).toBeTruthy()
      }
    }
  })
})
