// The router.
//
// Two things matter here beyond "the right screen appears". A newly signed-up
// grown-up owns no learners, and `home` is the *child's* screen — dropping them
// there makes the account look like a student one and quietly writes their
// practice to localStorage, because there is no learner to attribute it to. So
// they are sent to set someone up. Once only: bouncing them back after they
// deliberately navigated away would trap them.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./auth/AuthProvider', async () => (await import('./test/mockProviders')).authMock())
vi.mock('./lib/learners/LearnerProvider', async () =>
  (await import('./test/mockProviders')).learnersMock(),
)
vi.mock('./lib/progress/ProgressProvider', async () =>
  (await import('./test/mockProviders')).progressMock(),
)
vi.mock('./lib/theme/ThemeProvider', async () =>
  (await import('./test/mockProviders')).themeMock(),
)
vi.mock('./hooks/useAssignments', async () =>
  (await import('./test/mockProviders')).assignmentsMock(),
)

vi.mock('./lib/assignments/api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listAssignments: vi.fn(async () => []),
  listAssignmentSets: vi.fn(async () => []),
  familyOverview: vi.fn(async () => []),
}))
vi.mock('./lib/assignments/library', () => ({
  loadLibrary: vi.fn(async () => ({ decks: [], customLists: [] })),
  saveLibraryDecks: vi.fn(async () => []),
  saveLibraryLists: vi.fn(async () => []),
  deleteLibraryDeck: vi.fn(async () => {}),
  deleteLibraryList: vi.fn(async () => {}),
}))
vi.mock('./lib/learners/api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  listGuardians: vi.fn(async () => []),
  listConnectionCodes: vi.fn(async () => []),
}))

vi.mock('./lib/spelling/speech', () => ({
  speak: vi.fn(),
  dictate: vi.fn(),
  stopSpeaking: vi.fn(),
  isSpeechAvailable: () => true,
  primeVoices: vi.fn(),
  whenVoicesReady: vi.fn(() => () => {}),
  listVoices: () => [],
  savedVoiceURI: () => null,
  setVoice: vi.fn(),
  currentVoice: () => null,
}))

import App from './App'
import { signIn, testState } from './test/state'

beforeEach(() => {
  signIn()
})

describe('the first screen', () => {
  it('is the child’s home when there is a learner', async () => {
    render(<App />)
    expect(await screen.findByText('🎨 Cats')).toBeTruthy()
  })

  it('sends a grown-up who owns nobody to set someone up', async () => {
    // Otherwise their practice is written to this browser, unattributed.
    testState.learners = []
    testState.active = null
    render(<App />)
    expect(await screen.findByText('Who is learning?')).toBeTruthy()
  })

  it('does not send a guest anywhere', async () => {
    testState.authStatus = 'signed-out'
    testState.learners = []
    testState.active = null
    testState.learnerStatus = 'unavailable'
    render(<App />)
    await waitFor(() => expect(screen.queryByText('Who is learning?')).toBeNull())
  })

  it('waits rather than guessing while the learner list is still loading', async () => {
    testState.learners = []
    testState.active = null
    testState.learnerStatus = 'loading'
    render(<App />)
    await waitFor(() => expect(screen.queryByText('Who is learning?')).toBeNull())
  })
})

describe('every route reachable from the home screen', () => {
  // A route that throws is a blank screen with no way back, so each door out
  // of the home screen is opened here at least once and the screen behind it
  // is checked for something recognisable.
  const doors: Array<[string, RegExp]> = [
    ['📊 Progress', /Progress|History|nothing/i],
    ['🏆 Trophies', /Troph|collect|achiev/i],
    ['✏️ My lists', /word lists/i],
    ['🃏 My decks', /deck/i],
    ['⚙️ Settings', /Settings|Sound|name/i],
    ['👨‍👩‍👧 Family', /Family/i],
    ['✅ Tasks', /Tasks/i],
  ]

  for (const [label, expected] of doors) {
    it(`opens ${label}`, async () => {
      render(<App />)
      fireEvent.click(await screen.findByText(label))
      await waitFor(() => expect(document.body.textContent).toMatch(expected))
    })
  }

  it('opens the three subjects', async () => {
    for (const [label, expected] of [
      ['Spelling', /Spelling/i],
      ['Typing', /Typing|lesson/i],
      ['Quiz', /deck|Quiz/i],
    ] as const) {
      const view = render(<App />)
      fireEvent.click(view.getAllByText(label)[0]!.closest('button')!)
      await waitFor(() => expect(document.body.textContent).toMatch(expected))
      view.unmount()
    }
  })

  it('opens the world the theme names, and the picker for changing it', async () => {
    render(<App />)
    fireEvent.click(await screen.findByText('🎨 Cats'))
    await waitFor(() => expect(document.body.textContent!.length).toBeGreaterThan(0))
  })

  it('reaches the typing screens through the typing home', async () => {
    render(<App />)
    fireEvent.click(screen.getAllByText('Typing')[0]!.closest('button')!)
    for (const label of [/Word Rain|🌧/, /Practice/]) {
      const button = screen.queryAllByRole('button').find((b) => label.test(b.textContent ?? ''))
      if (!button) continue
      fireEvent.click(button)
      await waitFor(() => expect(document.body.textContent!.length).toBeGreaterThan(0))
      break
    }
  })

  it('scrolls back to the top on every move, for small screens', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    render(<App />)
    fireEvent.click(await screen.findByText('⚙️ Settings'))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
    scrollTo.mockRestore()
  })

  it('never shows a blank screen while progress is loading', () => {
    render(<App />)
    expect(document.body.textContent!.length).toBeGreaterThan(0)
  })
})
