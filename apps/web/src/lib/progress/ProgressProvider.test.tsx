// Which store a learner's progress goes to, and what happens at the moment
// they sign in.
//
// The merge is the dangerous part. A child plays as a guest, makes an account,
// and their practice has to end up in it — once, into one learner. Folding the
// same guest pile into two siblings would give the second child work they
// never did.

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgressProvider, useProgress } from './ProgressProvider'
import { defaultSkillState, emptySnapshot } from './types'
import type { ProgressSnapshot } from './types'
import type { Learner } from '../learners'

let authStatus = 'signed-out'
let active: Learner | null = null
let learnerStatus = 'unavailable'

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ status: authStatus }) }))
vi.mock('../learners/LearnerProvider', () => ({
  useLearners: () => ({ active, status: learnerStatus }),
}))

const cloudLoad = vi.fn(async () => emptySnapshot())
const pushSnapshot = vi.fn(async (_s: ProgressSnapshot) => {})
const persist = vi.fn(async () => {})

vi.mock('./apiRepo', () => ({
  ApiProgressRepo: class {
    kind = 'cloud'
    constructor(public learnerId: string) {}
    load = cloudLoad
    pushSnapshot = pushSnapshot
    persist = persist
    reset = vi.fn(async () => {})
    attemptsForSession = vi.fn(async () => [])
  },
}))

let localSnapshot = emptySnapshot()
// Clearing really empties the pile, which is the mechanism that stops a second
// child inheriting it. Mocking it as a no-op would test nothing.
const clearLocalProgress = vi.fn(() => {
  localSnapshot = emptySnapshot()
})

vi.mock('./localRepo', () => ({
  LocalProgressRepo: class {
    kind = 'local'
    load = vi.fn(async () => localSnapshot)
    persist = persist
    reset = vi.fn(async () => {})
    attemptsForSession = vi.fn(async () => [])
  },
  loadLocalSnapshot: () => localSnapshot,
  clearLocalProgress: () => clearLocalProgress(),
}))

function withPractice(attempts: number): ProgressSnapshot {
  return {
    ...emptySnapshot(),
    skills: {
      spelling: { ...defaultSkillState('spelling'), totalAttempts: attempts, totalCorrect: attempts },
    },
    mastery: { 'spelling:cat': { itemKey: 'cat' } as never },
  }
}

function Probe() {
  const { mode, ready, snapshot } = useProgress()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="ready">{String(ready)}</span>
      <span data-testid="attempts">{snapshot.skills.spelling?.totalAttempts ?? 0}</span>
    </div>
  )
}

function renderProvider() {
  return render(
    <ProgressProvider>
      <Probe />
    </ProgressProvider>,
  )
}

const learner = (id: string): Learner => ({ id, displayName: 'Ada' }) as Learner

beforeEach(() => {
  vi.clearAllMocks()
  cloudLoad.mockResolvedValue(emptySnapshot())
  localSnapshot = emptySnapshot()
  authStatus = 'signed-out'
  active = null
  learnerStatus = 'unavailable'
  localStorage.clear()
})

describe('as a guest', () => {
  it('stores progress locally', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('mode')).toHaveTextContent('local')
  })

  it('never reaches for the cloud', async () => {
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(cloudLoad).not.toHaveBeenCalled()
  })
})

describe('signed in', () => {
  beforeEach(() => {
    authStatus = 'signed-in'
    learnerStatus = 'ready'
    active = learner('l1')
  })

  it('loads the learner’s cloud snapshot', async () => {
    cloudLoad.mockResolvedValue(withPractice(12))
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('cloud'))
    expect(screen.getByTestId('attempts')).toHaveTextContent('12')
  })

  it('waits for the learner list before choosing a store', async () => {
    // Booting into local and swapping afterwards would double-count whatever
    // round was in progress.
    learnerStatus = 'loading'
    renderProvider()
    expect(screen.getByTestId('ready')).toHaveTextContent('false')
    expect(cloudLoad).not.toHaveBeenCalled()
  })

  it('falls back to local storage when the cloud will not load', async () => {
    // A flaky connection must not stop a child practising.
    cloudLoad.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('true'))
    expect(screen.getByTestId('mode')).toHaveTextContent('local')
  })
})

describe('the sign-in merge', () => {
  beforeEach(() => {
    authStatus = 'signed-in'
    learnerStatus = 'ready'
    active = learner('l1')
    localSnapshot = withPractice(5)
  })

  it('folds guest practice into the account', async () => {
    cloudLoad.mockResolvedValue(withPractice(10))
    renderProvider()
    await waitFor(() => expect(pushSnapshot).toHaveBeenCalled())
    expect(screen.getByTestId('attempts')).toHaveTextContent('15')
  })

  it('clears the guest pile once it has been folded in', async () => {
    renderProvider()
    await waitFor(() => expect(clearLocalProgress).toHaveBeenCalled())
  })

  it('never folds the same guest pile into a second child', async () => {
    // A parent with two children must not have one pile of guest practice
    // appear under both. Two things stop it: the pile is cleared once it has
    // been folded in, and a per-learner marker records that it happened.
    const first = renderProvider()
    await waitFor(() => expect(pushSnapshot).toHaveBeenCalledTimes(1))
    first.unmount()

    pushSnapshot.mockClear()
    active = learner('l2')
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('cloud'))
    expect(pushSnapshot).not.toHaveBeenCalled()
  })

  it('does not merge twice into the same learner if the pile survives', async () => {
    // The marker is the belt to the clearing's braces: if clearing fails —
    // a private window, storage full — signing in again must not double the
    // learner's attempt counts.
    const first = renderProvider()
    await waitFor(() => expect(pushSnapshot).toHaveBeenCalledTimes(1))
    first.unmount()

    pushSnapshot.mockClear()
    localSnapshot = withPractice(5) // clearing "failed"
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('cloud'))
    expect(pushSnapshot).not.toHaveBeenCalled()
  })

  it('does not merge when there is no guest practice to merge', async () => {
    localSnapshot = emptySnapshot()
    renderProvider()
    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent('cloud'))
    expect(pushSnapshot).not.toHaveBeenCalled()
    expect(clearLocalProgress).not.toHaveBeenCalled()
  })
})

describe('useProgress outside a provider', () => {
  it('fails loudly rather than silently losing a round', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow(/ProgressProvider/)
  })
})
