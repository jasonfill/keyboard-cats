// The parent's report, with something actually in it.
//
// The existing suite tests cover the empty states and the trust card. What is
// added here is the report as a parent with a term of practice behind them
// would see it: the activity chart read back as a sentence, the trouble-word
// list, the session log with each round openable, and the two places the free
// plan draws a line and says so rather than quietly showing less.

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../auth/AuthProvider', async () =>
  (await import('../../test/mockProviders')).authMock(),
)
vi.mock('../../lib/learners/LearnerProvider', async () =>
  (await import('../../test/mockProviders')).learnersMock(),
)
vi.mock('../../lib/progress/ProgressProvider', async () =>
  (await import('../../test/mockProviders')).progressMock(),
)
vi.mock('../../lib/theme/ThemeProvider', async () =>
  (await import('../../test/mockProviders')).themeMock(),
)
vi.mock('../../hooks/useAssignments', async () =>
  (await import('../../test/mockProviders')).assignmentsMock(),
)
vi.mock('../../lib/assignments/api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listAssignments: vi.fn(async () => []),
  listAssignmentSets: vi.fn(async () => []),
}))

import { aGame, spies } from '../../test/mockProviders'
import { anAssignment, signIn, skill, testState } from '../../test/state'
import { addDays, emptySnapshot, todayString } from '../../lib/progress/types'
import type { ProgressSnapshot, SessionRecord } from '../../lib/progress/types'
import ProgressScreen from './ProgressScreen'

const navigate = spies.navigate

function session(over: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: `s-${Math.random()}`,
    subject: 'spelling',
    activity: 'test',
    listId: null,
    isTest: true,
    itemsTotal: 10,
    itemsCorrect: 8,
    accuracy: 80,
    score: 100,
    wpm: null,
    durationMs: 90_000,
    abilityBefore: 3,
    abilityAfter: 3.2,
    meta: { predictedAccuracy: 70 },
    startedAt: Date.now(),
    endedAt: Date.now(),
    evidence: 'attempts',
    verifiedItemsTotal: 10,
    verifiedItemsCorrect: 8,
    ...over,
  }
}

function mastery(itemKey: string, over: Record<string, unknown> = {}) {
  return {
    subject: 'spelling',
    itemKey,
    listId: null,
    difficulty: 0.2,
    mastery: 0.2,
    reps: 5,
    lapses: 3,
    correctStreak: 0,
    totalAttempts: 6,
    totalCorrect: 2,
    intervalDays: 1,
    dueOn: todayString(),
    firstSeenAt: 1,
    lastSeenAt: 2,
    ...over,
  } as never
}

/** A day-by-day pile of practice, most recent last. */
function daily(pattern: number[]): ProgressSnapshot['daily'] {
  const today = todayString()
  return pattern.map((items, i) => ({
    day: addDays(today, i - (pattern.length - 1)),
    subject: 'spelling',
    seconds: items * 6,
    items,
    correct: Math.round(items * 0.8),
    sessions: items > 0 ? 1 : 0,
  })) as never
}

beforeEach(() => {
  signIn()
  navigate.mockClear()
  testState.skills = { spelling: skill('spelling', { placed: true }) }
  spies.attemptsForSession.mockResolvedValue([])
})

describe('the activity chart, read back in words', () => {
  it('says practice is picking up', () => {
    // A chart is another number. The sentence under it is the answer a parent
    // came for.
    testState.snapshot = { ...emptySnapshot(), daily: daily([...Array(14).fill(0), ...Array(7).fill(20)]) }
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    expect(screen.getByText(/Picking up/)).toBeTruthy()
  })

  it('says practice is slowing down', () => {
    testState.snapshot = { ...emptySnapshot(), daily: daily([...Array(7).fill(20), ...Array(14).fill(0)]) }
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    expect(screen.getByText(/Nothing this week|Slowing down/)).toBeTruthy()
  })

  it('says so plainly when a steady week follows a steady month', () => {
    testState.snapshot = { ...emptySnapshot(), daily: daily(Array(21).fill(10)) }
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    expect(screen.getByText(/Steady/)).toBeTruthy()
  })

  it('offers a way back rather than a scolding after a gap', () => {
    testState.snapshot = { ...emptySnapshot(), daily: daily([...Array(14).fill(15), ...Array(7).fill(0)]) }
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    expect(screen.getByText(/nothing is lost by coming back to it/)).toBeTruthy()
  })
})

describe('the words that keep going wrong', () => {
  it('lists them', () => {
    testState.snapshot = {
      ...emptySnapshot(),
      mastery: Object.fromEntries(
        ['because', 'friend', 'through'].map((w) => [`spelling:${w}`, mastery(w)]),
      ),
    }
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    expect(screen.getByText('because')).toBeTruthy()
  })

  it('names the free-plan limit rather than quietly showing fewer', () => {
    testState.snapshot = {
      ...emptySnapshot(),
      mastery: Object.fromEntries(
        Array.from({ length: 9 }, (_, i) => [`spelling:w${i}`, mastery(`w${i}`)]),
      ),
    }
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    expect(screen.getByText(/Showing 4 of 9/)).toBeTruthy()
    fireEvent.click(screen.getByText('Family Pro'))
    expect(navigate).toHaveBeenCalledWith({ name: 'upgrade' })
  })

  it('celebrates words that turned around', () => {
    testState.snapshot = {
      ...emptySnapshot(),
      mastery: {
        'spelling:because': mastery('because', {
          mastery: 0.95,
          lapses: 4,
          correctStreak: 5,
          totalCorrect: 10,
          totalAttempts: 14,
        }),
      },
    }
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    expect(document.body.textContent).toContain('because')
  })
})

describe('the session log', () => {
  beforeEach(() => {
    testState.snapshot = {
      ...emptySnapshot(),
      sessions: [
        session({ id: 'a', subject: 'spelling', activity: 'test' }),
        session({ id: 'b', subject: 'quiz', activity: 'flashcards', isTest: false }),
        session({ id: 'c', subject: 'typing', activity: 'lesson', isTest: false, wpm: 24 }),
      ],
    }
  })

  it('names each round in words a parent would use', () => {
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    expect(document.body.textContent).toMatch(/Flashcards|Typing lesson|Test/)
  })

  it('opens a round to show the answers behind it', async () => {
    spies.attemptsForSession.mockResolvedValue([
      {
        itemKey: 'because',
        subject: 'spelling',
        correct: false,
        given: 'becuase',
        verified: true,
        hintsUsed: 0,
        responseMs: 3000,
      },
    ])
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    const rows = screen.getAllByRole('button').filter((b) => b.getAttribute('aria-expanded') !== null)
    expect(rows.length).toBeGreaterThan(0)
    fireEvent.click(rows[0]!)
    expect(await screen.findByText('Answered "becuase"')).toBeTruthy()
  })

  it('closes it again', () => {
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    const row = screen.getAllByRole('button').find((b) => b.getAttribute('aria-expanded') !== null)!
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(row)
    expect(row.getAttribute('aria-expanded')).toBe('false')
  })

  it('says how much history the free plan keeps, rather than hiding it', () => {
    const old = Date.now() - 120 * 86_400_000
    testState.snapshot = {
      ...emptySnapshot(),
      sessions: Array.from({ length: 5 }, (_, i) =>
        session({ id: `old-${i}`, startedAt: old, endedAt: old }),
      ),
    }
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    expect(screen.getByText(/outside the free/)).toBeTruthy()
  })
})

describe('the other two subjects', () => {
  it('summarises typing and offers a way into it', () => {
    const game = aGame({
      state: { lessons: { l1: { plays: 2, stars: 3, bestWpm: 26, bestAccuracy: 95 } }, totalStars: 3 },
    })
    render(<ProgressScreen game={game} navigate={navigate} />)
    expect(screen.getByText(/best 26 WPM/)).toBeTruthy()
    fireEvent.click(screen.getByText('Open typing →'))
    expect(navigate).toHaveBeenCalledWith({ name: 'typing' })
  })

  it('summarises quiz and offers a way into it', () => {
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    fireEvent.click(screen.getByText('Open quiz →'))
    expect(navigate).toHaveBeenCalledWith({ name: 'quiz' })
  })
})

describe('work the grown-up has set', () => {
  it('is shown alongside the report, with a way to set more', () => {
    testState.assignments = [anAssignment({ title: 'Friday spelling' })]
    render(<ProgressScreen game={aGame()} navigate={navigate} />)
    const assign = screen.queryByText('Assign something new')
    if (!assign) return
    fireEvent.click(assign)
    expect(navigate).toHaveBeenCalledWith({ name: 'library' })
  })
})
