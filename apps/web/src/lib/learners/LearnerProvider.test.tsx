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
  const { learners, active, status, isOwner, select, create, refresh, error } = useLearners()
  return (
    <div>
      <span data-testid="error">{error ?? ''}</span>
      <button onClick={() => void create({ displayName: 'Ben' } as never).catch(() => {})}>
        add
      </button>
      <button onClick={() => void refresh()}>refresh</button>
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

describe('adding a learner', () => {
  beforeEach(() => {
    authStatus = 'signed-in'
    user = { id: 'u1' }
  })

  it('makes them the active one, because that is why they were added', async () => {
    listLearners.mockResolvedValue([learner('a')])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('a'))
    await userEvent.click(screen.getByText('add'))
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('new'))
    expect(screen.getByTestId('count')).toHaveTextContent('2')
  })

  it('does not send an owner id, because the API takes it from the token', async () => {
    listLearners.mockResolvedValue([])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
    await userEvent.click(screen.getByText('add'))
    await waitFor(() => expect(createLearner).toHaveBeenCalled())
    expect(createLearner.mock.calls[0]![0]).not.toHaveProperty('ownerId')
  })

  it('refuses before anyone is signed in', async () => {
    authStatus = 'signed-out'
    user = null
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unavailable'))
    await userEvent.click(screen.getByText('add'))
    expect(createLearner).not.toHaveBeenCalled()
  })
})

describe('refreshing the list', () => {
  beforeEach(() => {
    authStatus = 'signed-in'
    user = { id: 'u1' }
  })

  it('does not yank a child out of a lesson when a sibling is added', async () => {
    // The selection survives a refresh if the learner is still there.
    listLearners.mockResolvedValue([learner('a'), learner('b', 'Ben')])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
    await userEvent.click(screen.getByText('pick-b'))
    listLearners.mockResolvedValue([learner('a'), learner('b', 'Ben'), learner('c', 'Cal')])
    await userEvent.click(screen.getByText('refresh'))
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('3'))
    expect(screen.getByTestId('active')).toHaveTextContent('b')
  })

  it('picks again when the selected learner has gone', async () => {
    listLearners.mockResolvedValue([learner('a'), learner('b', 'Ben')])
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
    await userEvent.click(screen.getByText('pick-b'))
    listLearners.mockResolvedValue([learner('a')])
    await userEvent.click(screen.getByText('refresh'))
    await waitFor(() => expect(screen.getByTestId('active')).toHaveTextContent('a'))
  })

  it('clears the error once a retry works', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    listLearners.mockRejectedValueOnce(new Error('offline'))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'))
    listLearners.mockResolvedValue([learner('a')])
    await userEvent.click(screen.getByText('refresh'))
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'))
    expect(screen.getByTestId('error')).toHaveTextContent('')
    warn.mockRestore()
  })

  it('reports a failure that was not an Error at all', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    listLearners.mockRejectedValue('something odd')
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('error')).toHaveTextContent('Could not load learners'))
    warn.mockRestore()
  })

  it('waits rather than guessing while sign-in is still settling', async () => {
    authStatus = 'loading'
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('loading'))
    expect(listLearners).not.toHaveBeenCalled()
  })
})

describe('useLearners outside a provider', () => {
  it('fails loudly', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/LearnerProvider/)
  })
})
