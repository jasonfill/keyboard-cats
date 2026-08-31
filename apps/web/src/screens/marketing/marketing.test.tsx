// The signed-out front door.
//
// The one rule this screen has to keep: nothing on it leads into an activity.
// A visitor has no learner, and practice that is not attributed to a learner
// moves no level and lands on no report — so every exit here is a door in.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/theme/ThemeProvider', async () =>
  (await import('../../test/mockProviders')).themeMock(),
)

import MarketingScreen from './MarketingScreen'
import { PLANS } from '../../lib/plans'

const navigate = vi.fn()

describe('the marketing site', () => {
  it('says what the thing is before it asks for anything', () => {
    render(<MarketingScreen navigate={navigate} />)
    expect(screen.getByText('Practice that knows what your child can actually do.')).toBeTruthy()
    expect(screen.getByText(/Only unaided spelling counts/)).toBeTruthy()
  })

  it('names the audience the product is sold to', () => {
    render(<MarketingScreen navigate={navigate} />)
    expect(screen.getByText('For parents, tutors and teachers')).toBeTruthy()
  })

  it('quotes the plans rather than restating their prices', () => {
    render(<MarketingScreen navigate={navigate} />)
    expect(screen.getByText(PLANS.free.tagline)).toBeTruthy()
    expect(screen.getByText(PLANS.pro.price)).toBeTruthy()
    // Nothing here can take money yet, and the page must not imply otherwise.
    expect(screen.getByText('Coming soon')).toBeTruthy()
  })

  it('leads everywhere to the same place: the way in', () => {
    render(<MarketingScreen navigate={navigate} />)
    const doors = screen.getAllByRole('button')
    expect(doors.length).toBeGreaterThan(3)
    for (const door of doors) {
      navigate.mockClear()
      fireEvent.click(door)
      // A disabled plan button is the one thing here that goes nowhere.
      if ((door as HTMLButtonElement).disabled) continue
      expect(navigate).toHaveBeenCalledWith({ name: 'auth' })
    }
  })
})
