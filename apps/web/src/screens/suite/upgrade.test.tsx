// What it costs, and who is being asked to pay it.
//
// This screen replaced a plan picker that read `profiles.plan` — a flag the
// feature gates had already stopped using — and quoted a flat $4 tier that was
// not the price in the spec. Both failures were invisible: the page rendered
// fine and said the wrong thing. So what is pinned here is the arithmetic, and
// the one rule underneath the whole billing model: coverage is bought for a
// child, and the person who benefits is not always the person who pays.

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../auth/AuthProvider', async () => (await import('../../test/mockProviders')).authMock())
vi.mock('../../lib/learners/LearnerProvider', async () =>
  (await import('../../test/mockProviders')).learnersMock(),
)
vi.mock('../../lib/theme/ThemeProvider', async () =>
  (await import('../../test/mockProviders')).themeMock(),
)

import { aLearner, resetTestState, signIn, testState } from '../../test/state'
import UpgradeScreen from './UpgradeScreen'

const navigate = vi.fn()

beforeEach(() => {
  resetTestState()
  navigate.mockClear()
  signIn()
})

/** Sign in with a household of this shape. */
function household(...covered: boolean[]) {
  const learners = covered.map((c, i) =>
    aLearner({
      id: `l${i}`,
      displayName: ['Ada', 'Ben', 'Cleo'][i] ?? `Kid ${i}`,
      covered: c,
    }),
  )
  signIn(learners[0]!)
  testState.learners = learners
}

describe('the price', () => {
  it('is $4 for one child', () => {
    household(false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText('$4 a month')).toBeInTheDocument()
  })

  it('is $8 for three, which is the marketed sum', () => {
    household(false, false, false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText('$8 a month')).toBeInTheDocument()
  })

  it('shows the working when there is more than one child', () => {
    household(false, false, false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText(/\$4 for the first, \$2 each for 2 more/)).toBeInTheDocument()
  })

  it('counts children already covered towards the total', () => {
    // Adding a second child costs $2, not another $4. A parent who cannot see
    // that from the screen has to take it on trust.
    household(true, false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText('$6 a month')).toBeInTheDocument()
    expect(screen.getByText(/\$2 more a month than you pay now/)).toBeInTheDocument()
  })

  it('offers nothing when nobody is selected', () => {
    household(false)
    render(<UpgradeScreen navigate={navigate} />)
    fireEvent.click(screen.getByLabelText('Cover them'))
    expect(screen.getByText('Nothing to pay yet')).toBeInTheDocument()
  })
})

describe('who is on the screen', () => {
  it('lists the children, because that is what is being bought', () => {
    household(true, false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('Ben')).toBeInTheDocument()
  })

  it('marks a covered child as covered rather than offering to sell them again', () => {
    household(true, false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText('Covered')).toBeInTheDocument()
    // One checkbox, for the one child who does not have coverage.
    expect(screen.getAllByLabelText('Cover them')).toHaveLength(1)
  })

  it('starts with everybody uncovered selected', () => {
    // Somebody who opened this screen came to pay for their children. Making
    // them tick each one before a price appears is a toll booth in front of
    // the price.
    household(false, false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText('$6 a month')).toBeInTheDocument()
  })

  it('sends a grown-up with no children to add one first', () => {
    testState.learners = []
    render(<UpgradeScreen navigate={navigate} />)
    fireEvent.click(screen.getByText('Add a child'))
    expect(navigate).toHaveBeenCalledWith({ name: 'family' })
  })
})

// Both of the bugs below shipped green: the first because the test double
// hands over its learners synchronously and the real provider fetches them,
// the second because every learner in the fixtures happened to be owned by the
// person looking. Neither is exotic — the first is every real page load, and
// the second is every tutor.
describe('children who arrive after the first render', () => {
  it('are selected, because nobody unselected them', () => {
    // The real provider starts at `[]` and fills in from a fetch. Seeding
    // selection state from `learners` therefore seeds it from nothing, and
    // every box renders unticked over a price of "Nothing to pay yet" — the
    // exact toll booth the screen is written to avoid.
    testState.learners = []
    const { rerender } = render(<UpgradeScreen navigate={navigate} />)
    household(false, false)
    rerender(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText('$6 a month')).toBeInTheDocument()
    for (const box of screen.getAllByLabelText('Cover them')) {
      expect((box as HTMLInputElement).checked).toBe(true)
    }
  })

  it('can still be unticked once they are there', () => {
    testState.learners = []
    const { rerender } = render(<UpgradeScreen navigate={navigate} />)
    household(false, false)
    rerender(<UpgradeScreen navigate={navigate} />)
    fireEvent.click(screen.getAllByLabelText('Cover them')[0]!)
    expect(screen.getByText('$4 a month')).toBeInTheDocument()
  })
})

describe('a tutor, who is never the one paying', () => {
  /** Signed in as u1, looking at a covered child that belongs to someone else. */
  function guardingSomebodyElses() {
    signIn(aLearner({ id: 'theirs', displayName: 'Ben', ownerId: 'another-parent', covered: true }))
    testState.learners = [
      aLearner({ id: 'theirs', displayName: 'Ben', ownerId: 'another-parent', covered: true }),
    ]
  }

  it('is not billed for a child somebody else covers', () => {
    // `learners` is everyone the session can *see*, guarded children included.
    // Without an ownership test this screen offers a tutor a bill for a child
    // whose parent is already paying.
    guardingSomebodyElses()
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.queryByText('$4 a month')).not.toBeInTheDocument()
    expect(screen.queryByText('Ben')).not.toBeInTheDocument()
  })

  it('is told why there is nothing here for them', () => {
    guardingSomebodyElses()
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText(/covered by whoever added them/)).toBeInTheDocument()
  })
})

describe('what the button admits', () => {
  it('cannot charge anybody, and says so', () => {
    // A button that takes a card number and does nothing is worse than one
    // that admits it is not ready.
    household(false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText(/No payment processor is connected/)).toBeInTheDocument()
  })

  it('has nothing to do when everyone is already covered', () => {
    household(true, true)
    render(<UpgradeScreen navigate={navigate} />)
    const button = screen.getByText('Everyone is covered') as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('names the price it would charge', () => {
    household(false, false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText(/Cover 2 children — \$6 a month/)).toBeInTheDocument()
  })
})

describe('the promise the page makes', () => {
  it('never puts learning behind the price', () => {
    household(false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText(/Why is the curriculum free\?/)).toBeInTheDocument()
    expect(screen.getByText(/so does setting work/)).toBeInTheDocument()
  })

  it('says coverage follows the child, not the payer', () => {
    // The billing model in one sentence, and the reason a teacher is never
    // asked for money.
    household(false)
    render(<UpgradeScreen navigate={navigate} />)
    expect(screen.getByText(/Coverage belongs to the child/)).toBeInTheDocument()
  })

  it('offers a signed-out visitor an account before a charge', () => {
    testState.authStatus = 'signed-out'
    render(<UpgradeScreen navigate={navigate} />)
    fireEvent.click(screen.getByText('Create a free account'))
    expect(navigate).toHaveBeenCalledWith({ name: 'auth' })
  })
})
