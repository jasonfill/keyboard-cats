// Who the app is currently showing.
//
// Before the learner inversion this question did not exist — the signed-in
// user was the learner. Now one session may hold several, and every read and
// write downstream is scoped to this selection, so getting it wrong shows one
// child another child's progress.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LearnerProvider, useLearners } from './LearnerProvider'
import type { Learner } from './api'

let authStatus = 'signed-out'
let user: { id: string } | null = null

vi.mock('../../auth/AuthProvider', () => ({
  useAuth: () => ({ status: authStatus, user }),
}))

const listLearners = vi.fn(async () => [] as Learner[])
const createLearner = vi.fn(async (l: { displayName: string }) => learner('new', l.displayName))

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  return {
    ...actual,
    listLearners: (...a: unknown[]) => listLearners(...(a as [])),
    createLearner: (...a: unknown[]) => createLearner(...(a as [{ displayName: string }])),
  }
})

function learner(id: string, displayName = 'Ada', ownerId = 'u1'): Learner {
  return {
    id,
    ownerId,
    displayName,
    avatarEmoji: '🦊',
    gradeHint: null,
    birthYear: null,
    authKind: 'none',
    authUserId: null,
    createdAt: 0,
    theme: null,
  } as Learner
}

function Probe() {
  const { learners, active, status, isOwner, select } = useLearners()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="active">{active?.id ?? 'none'}</span>
      <span data-testid="count">{learners.length}</span>
      <span data-testid="owner">{String(isOwner)}</span>
      {learners.map((l) => (
        <button key={l.id} onClick={() => select(l.id)}>
          pick-{l.id}
        </button>
      ))}
    </div>
  )
}

function renderProvider() {
  return render(
    <LearnerProvider>
      <Probe />
    </LearnerProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listLearners.mockResolvedValue([])
  authStatus = 'signed-out'
  user = null
  localStorage.clear()
})

describe('signed out', () => {
  it('has no learners and says so', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'))
    expect(screen.getByTestId('active')).toHaveTextContent('none')
    expect(listLearners).not.toHaveBeenCalled()
  })
})

describe('signed in', () => {
  beforeEach(() => {
    authStatus = 'signed-in'
    user = { id: 'u1' }
  })

  it('loads the learners this session can see', async () => {
    listLearners.mockResolvedValue([learner('l1'), learner('l2', 'Bo')])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  it('shows the first child when there is no remembered choice', async () => {
    listLearners.mockResolvedValue([learner('l1'), learner('l2', 'Bo')])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('l1'))
  })

  it('shows the learner who owns the session, ahead of the first created', async () => {
    // A teenager with their own login should land on themselves, not on a
    // sibling who happens to have been created first.
    const self = { ...learner('l2', 'Teen'), authUserId: 'u1' } as Learner
    listLearners.mockResolvedValue([learner('l1'), self])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('l2'))
  })

  it('remembers the child a grown-up was last looking at', async () => {
    listLearners.mockResolvedValue([learner('l1'), learner('l2', 'Bo')])
    const first = renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('l1'))
    await userEvent.click(screen.getByText('pick-l2'))
    expect(screen.getByTestId('active')).toHaveTextContent('l2')
    first.unmount()

    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('l2'))
  })

  it('remembers that choice per grown-up, not globally', async () => {
    listLearners.mockResolvedValue([learner('l1'), learner('l2', 'Bo')])
    const first = renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('l1'))
    await userEvent.click(screen.getByText('pick-l2'))
    first.unmount()

    user = { id: 'u2' }
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('l1'))
  })

  it('reports ownership, which is what gates the manage panel', async () => {
    listLearners.mockResolvedValue([learner('l1', 'Ada', 'u1')])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('owner')).toHaveTextContent('true'))
  })

  it('does not claim ownership of a learner merely shared with you', async () => {
    listLearners.mockResolvedValue([learner('l1', 'Ada', 'someone-else')])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
    expect(screen.getByTestId('owner')).toHaveTextContent('false')
  })

  it('reports an error rather than pretending there are no children', async () => {
    // "You have no children" and "we could not reach the server" look the same
    // on screen and mean very different things.
    listLearners.mockRejectedValue(new Error('offline'))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'))
  })

  it('has no active learner when the account holds none yet', async () => {
    listLearners.mockResolvedValue([])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
    expect(screen.getByTestId('active')).toHaveTextContent('none')
  })
})

describe('useLearners outside a provider', () => {
  it('fails loudly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/LearnerProvider/)
  })
})
