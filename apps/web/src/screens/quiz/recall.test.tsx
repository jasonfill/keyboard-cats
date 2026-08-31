// Everything you know.
//
// The strongest retrieval format there is, and one most flashcard apps cannot
// offer — it only works because the answer key is closed. Two rules are being
// defended: writing something wrong costs nothing, and a card nobody could
// bring to mind is a real miss that goes back into the schedule.

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RecallRound from './RecallRound'
import type { PlannedCard } from '../../lib/quiz/session'

const plan: PlannedCard[] = ['Paris', 'Berlin', 'Madrid'].map((capital, i) => ({
  card: { id: `c${i}`, term: `Country ${i}`, definition: capital, hint: null, difficulty: 2 },
  deckId: 'd1',
  deckTitle: 'Capitals',
  reason: 'new',
  mastery: undefined,
  kind: 'written',
  direction: 'term-first',
})) as PlannedCard[]

function play(onFinish = vi.fn()) {
  render(<RecallRound plan={plan} deckTitle="Capitals" onFinish={onFinish} />)
  return onFinish
}

function write(text: string) {
  fireEvent.change(screen.getByLabelText('Everything you remember'), { target: { value: text } })
  fireEvent.click(screen.getByText('Check what I got'))
}

describe('before they write anything', () => {
  it('asks for the whole set at once', () => {
    play()
    expect(screen.getByText(/Write down everything you remember from Capitals/)).toBeTruthy()
  })

  it('says the format does not matter and a wrong guess is free', () => {
    // Guessing widely should not be expensive, and saying so up front is what
    // makes somebody actually empty their memory.
    play()
    expect(screen.getByText(/getting one wrong costs you nothing/)).toBeTruthy()
  })

  it('will not check an empty box', () => {
    play()
    expect(screen.getByText('Check what I got').closest('button')!.disabled).toBe(true)
  })

  it('says how many there are to remember', () => {
    play()
    expect(screen.getByText('3 to remember')).toBeTruthy()
  })
})

describe('grading what came out', () => {
  it('says how many they got', () => {
    play()
    write('Paris, Berlin')
    expect(screen.getByText('2 of 3 from memory')).toBeTruthy()
  })

  it('shows what they missed, and says it will come back', () => {
    // Not remembering something is the signal the review queue exists for.
    play()
    write('Paris')
    expect(screen.getByText('Not this time')).toBeTruthy()
    expect(screen.getByText(/come back soon/)).toBeTruthy()
  })

  it('separates what was written but was not on the list', () => {
    play()
    write('Paris, Atlantis')
    expect(screen.getByText('These were not on the list')).toBeTruthy()
    expect(screen.getByText('Atlantis')).toBeTruthy()
  })

  it('does not count a wrong guess as a miss', () => {
    play()
    write('Paris, Berlin, Madrid, Atlantis')
    expect(screen.getByText('3 of 3 from memory')).toBeTruthy()
    expect(screen.queryByText('Not this time')).toBeNull()
  })

  it('accepts a list written any way they like', () => {
    play()
    write('- Paris\n- Berlin\n- Madrid')
    expect(screen.getByText('3 of 3 from memory')).toBeTruthy()
  })

  it('hands the result back so the misses reach the schedule', () => {
    const onFinish = play()
    write('Paris')
    fireEvent.click(screen.getByText('Done'))
    expect(onFinish).toHaveBeenCalledOnce()
    const result = onFinish.mock.calls[0]![0]
    expect(result.matched).toHaveLength(1)
    expect(result.missed).toHaveLength(2)
  })
})
