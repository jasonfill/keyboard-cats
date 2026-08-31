// Settings, the trophy room, and the account screen.
//
// Three screens that mostly say what is already true, with two exceptions worth
// pinning: erasing progress clears both stores (the typing game's own save and
// the shared record behind the whole suite), and the library card shows a dash
// rather than a zero when it could not be read — "none" and "could not ask"
// are different answers.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../auth/AuthProvider', async () => (await import('../test/mockProviders')).authMock())
vi.mock('../lib/learners/LearnerProvider', async () =>
  (await import('../test/mockProviders')).learnersMock(),
)
vi.mock('../lib/progress/ProgressProvider', async () =>
  (await import('../test/mockProviders')).progressMock(),
)
vi.mock('../lib/theme/ThemeProvider', async () =>
  (await import('../test/mockProviders')).themeMock(),
)

const lib = vi.hoisted(() => ({
  loadLibrary: vi.fn(async () => ({ decks: [], customLists: [] })),
}))
vi.mock('../lib/assignments/library', () => lib)

const codes = vi.hoisted(() => ({ listConnectionCodes: vi.fn(async () => []) }))
vi.mock('../lib/learners/api', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...codes,
}))

import { aGame, spies } from '../test/mockProviders'
import { goPro, signIn, testState } from '../test/state'
import { emptySnapshot } from '../lib/progress/types'
import AccountScreen from './suite/AccountScreen'
import SettingsScreen from './SettingsScreen'
import TrophyRoom from './TrophyRoom'

const navigate = spies.navigate

beforeEach(() => {
  signIn()
  navigate.mockClear()
  lib.loadLibrary.mockResolvedValue({ decks: [], customLists: [] })
  codes.listConnectionCodes.mockResolvedValue([])
})

describe('settings', () => {
  it('shows the three switches with their current state', () => {
    const game = aGame({ state: { settings: { sound: true, showHands: false, showKeyboard: true } } })
    render(<SettingsScreen game={game} navigate={navigate} />)
    const toggles = screen.getAllByRole('button', { pressed: true })
    expect(toggles.length).toBe(2)
  })

  it('turns sound off and on', () => {
    const game = aGame()
    render(<SettingsScreen game={game} navigate={navigate} />)
    fireEvent.click(screen.getByText('🔊 Sound effects').parentElement!.querySelector('button')!)
    expect(game.setSetting).toHaveBeenCalledWith('sound', false)
  })

  it('turns the keyboard and hand guide off', () => {
    const game = aGame()
    render(<SettingsScreen game={game} navigate={navigate} />)
    for (const [label, key] of [
      ['⌨️ Show on-screen keyboard', 'showKeyboard'],
      ['🖐️ Show hand guide', 'showHands'],
    ] as const) {
      fireEvent.click(screen.getByText(label).parentElement!.querySelector('button')!)
      expect(game.setSetting).toHaveBeenCalledWith(key, false)
    }
  })

  it('asks twice before erasing anything', () => {
    const game = aGame()
    render(<SettingsScreen game={game} navigate={navigate} />)
    fireEvent.click(screen.getByText('🗑️ Reset all progress'))
    expect(screen.getByText(/Are you sure\?/)).toBeTruthy()
    fireEvent.click(screen.getByText('Cancel'))
    expect(game.reset).not.toHaveBeenCalled()
  })

  it('erases both stores when confirmed', () => {
    // The typing game keeps its own save; the suite keeps the shared record.
    // Clearing one and not the other leaves a half-erased account.
    const game = aGame()
    render(<SettingsScreen game={game} navigate={navigate} />)
    fireEvent.click(screen.getByText('🗑️ Reset all progress'))
    fireEvent.click(screen.getByText('Yes, reset'))
    expect(game.reset).toHaveBeenCalled()
    expect(spies.reset).toHaveBeenCalled()
  })

  it('says where progress is being kept', () => {
    testState.progressMode = 'cloud'
    render(<SettingsScreen game={aGame()} navigate={navigate} />)
    expect(screen.getByText(/to your account/)).toBeTruthy()
  })

  it('says so when it is only in this browser', () => {
    testState.progressMode = 'local'
    render(<SettingsScreen game={aGame()} navigate={navigate} />)
    expect(screen.getByText(/on this device/)).toBeTruthy()
  })

  it('goes home', () => {
    render(<SettingsScreen game={aGame()} navigate={navigate} />)
    fireEvent.click(screen.getByText('← Home'))
    expect(navigate).toHaveBeenCalledWith({ name: 'home' })
  })
})

describe('the trophy room', () => {
  it('opens on high scores, and says how to set one', () => {
    render(<TrophyRoom game={aGame()} navigate={navigate} />)
    expect(screen.getByText(/No scores yet/)).toBeTruthy()
  })

  it('lists the scores that have been set', () => {
    const game = aGame({
      state: {
        highScores: [
          { name: 'Ada', score: 1200, wpm: 30, accuracy: 95, mode: 'Cat Rain', date: 0 },
          { name: 'Ada', score: 800, wpm: 0, accuracy: 90, mode: 'Practice', date: 0 },
        ],
      },
    })
    render(<TrophyRoom game={game} navigate={navigate} />)
    expect(screen.getByText('1,200')).toBeTruthy()
    expect(screen.getByText('30 wpm')).toBeTruthy()
    // A zero-WPM arcade score shows no speed rather than "0 wpm".
    expect(screen.queryByText('0 wpm')).toBeNull()
  })

  it('names badges only once they are earned', () => {
    // An unearned badge shows its description but not its name — there is
    // something to find out, rather than a list already read.
    render(<TrophyRoom game={aGame()} navigate={navigate} />)
    fireEvent.click(screen.getByText('🎖️ Badges'))
    expect(screen.getAllByText('???').length).toBeGreaterThan(0)
  })

  it('names one that has been earned', () => {
    testState.snapshot = {
      ...emptySnapshot(),
      achievements: [{ achievementId: 'first-test', subject: 'spelling', unlockedAt: 1 } as never],
    }
    render(<TrophyRoom game={aGame()} navigate={navigate} />)
    fireEvent.click(screen.getByText('🎖️ Badges'))
    expect(screen.getByText(/Typing ⌨️/)).toBeTruthy()
  })

  it('calls the collection tab whatever the theme calls it', () => {
    render(<TrophyRoom game={aGame()} navigate={navigate} />)
    expect(screen.getByText(testState.theme.unit)).toBeTruthy()
  })

  it('says how to start collecting, in the theme’s own words', () => {
    render(<TrophyRoom game={aGame()} navigate={navigate} />)
    fireEvent.click(screen.getByText(testState.theme.unit))
    expect(screen.getByText(new RegExp(`No ${testState.theme.unit} yet`))).toBeTruthy()
  })

  it('shows what has been collected', () => {
    const game = aGame({ state: { collectedCats: ['seed-1', 'seed-2'] } })
    render(<TrophyRoom game={game} navigate={navigate} />)
    fireEvent.click(screen.getByText(testState.theme.unit))
    expect(screen.queryByText(/yet — finish lessons/)).toBeNull()
  })

  it('goes home', () => {
    render(<TrophyRoom game={aGame()} navigate={navigate} />)
    fireEvent.click(screen.getByText('← Home'))
    expect(navigate).toHaveBeenCalledWith({ name: 'home' })
  })
})

describe('the account screen', () => {
  it('has nothing to show when nobody is signed in, and says so', () => {
    testState.authStatus = 'signed-out'
    testState.profile = null
    render(<AccountScreen navigate={navigate} />)
    expect(screen.getByText(/Nobody is signed in/)).toBeTruthy()
    fireEvent.click(screen.getByText('Sign in'))
    expect(navigate).toHaveBeenCalledWith({ name: 'auth' })
  })

  it('says so instead when the build has no database at all', () => {
    testState.authStatus = 'signed-out'
    testState.configured = false
    render(<AccountScreen navigate={navigate} />)
    expect(screen.getByText(/no database connected/)).toBeTruthy()
  })

  it('renames the account, but not to nothing and not to what it already is', async () => {
    render(<AccountScreen navigate={navigate} />)
    const save = screen.getByText('Save') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    const input = screen.getByDisplayValue('Grown-up')
    fireEvent.change(input, { target: { value: '  ' } })
    expect(save.disabled).toBe(true)
    fireEvent.change(input, { target: { value: 'Sam' } })
    fireEvent.click(save)
    expect(spies.updateProfile).toHaveBeenCalledWith({ displayName: 'Sam' })
  })

  it('changes the avatar', () => {
    render(<AccountScreen navigate={navigate} />)
    fireEvent.click(screen.getByText('🦊'))
    expect(spies.updateProfile).toHaveBeenCalledWith({ avatarEmoji: '🦊' })
  })

  it('counts what is in the library', async () => {
    lib.loadLibrary.mockResolvedValue({
      decks: [{ id: 'd1' } as never],
      customLists: [{ id: 'l1' } as never, { id: 'l2' } as never],
    })
    render(<AccountScreen navigate={navigate} />)
    expect(await screen.findByText('🃏 1 decks')).toBeTruthy()
    expect(screen.getByText('✏️ 2 word lists')).toBeTruthy()
  })

  it('shows a dash rather than a zero when the library could not be read', async () => {
    // "None" and "could not ask" are different answers.
    lib.loadLibrary.mockRejectedValue(new Error('offline'))
    render(<AccountScreen navigate={navigate} />)
    expect(await screen.findByText('🃏 — decks')).toBeTruthy()
  })

  it('opens the library', async () => {
    render(<AccountScreen navigate={navigate} />)
    fireEvent.click(await screen.findByText('Open library'))
    expect(navigate).toHaveBeenCalledWith({ name: 'library' })
  })

  it('points a free account at what Pro adds', () => {
    render(<AccountScreen navigate={navigate} />)
    fireEvent.click(screen.getByText('✨ See what Family Pro adds'))
    expect(navigate).toHaveBeenCalledWith({ name: 'upgrade' })
  })

  it('thanks a paying account instead of selling to it again', () => {
    goPro()
    render(<AccountScreen navigate={navigate} />)
    expect(screen.getByText(/Thank you for supporting the project/)).toBeTruthy()
    expect(screen.queryByText('✨ See what Family Pro adds')).toBeNull()
  })

  it('marks the CSV export as a paid feature rather than hiding it', () => {
    render(<AccountScreen navigate={navigate} />)
    const button = screen.getByText(/Export as CSV/) as HTMLButtonElement
    expect(button.textContent).toContain('(Pro)')
    expect(button.disabled).toBe(true)
  })

  it('exports for a paying account', () => {
    goPro()
    const createObjectURL = vi.fn(() => 'blob:x')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    render(<AccountScreen navigate={navigate} />)
    fireEvent.click(screen.getByText(/Export as CSV/))
    expect(createObjectURL).toHaveBeenCalled()
    expect(revokeObjectURL).toHaveBeenCalled()
  })

  it('asks twice before erasing progress', () => {
    render(<AccountScreen navigate={navigate} />)
    fireEvent.click(screen.getByText('🗑️ Erase my progress'))
    expect(screen.getByText('Really erase everything?')).toBeTruthy()
    expect(spies.reset).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Never mind'))
    expect(screen.queryByText('Really erase everything?')).toBeNull()
  })

  it('erases when confirmed', () => {
    render(<AccountScreen navigate={navigate} />)
    fireEvent.click(screen.getByText('🗑️ Erase my progress'))
    fireEvent.click(screen.getByText('Really erase everything?'))
    expect(spies.reset).toHaveBeenCalled()
  })

  it('says when the last sync failed rather than looking fine', () => {
    testState.sync = 'error'
    render(<AccountScreen navigate={navigate} />)
    expect(screen.getByText(/the last sync failed/)).toBeTruthy()
  })

  it('signs out and goes home', async () => {
    render(<AccountScreen navigate={navigate} />)
    fireEvent.click(screen.getByText('Sign out'))
    await waitFor(() => expect(spies.signOut).toHaveBeenCalled())
    expect(navigate).toHaveBeenCalledWith({ name: 'home' })
  })
})
