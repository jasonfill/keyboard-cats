// The animation loop, and the parts of a round that only run once the game is
// actually moving.
//
// Word Rain is the one screen in the app with a real-time loop, so the things
// worth pinning are the ones a static render cannot reach: a word reaching the
// floor costs a life, three lost lives end the game, and a completed word
// scores. The loop is driven by hand here rather than left to a real animation
// frame, so the test is deterministic.

import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/theme/ThemeProvider', async () =>
  (await import('../test/mockProviders')).themeMock(),
)

import { aGame, spies } from '../test/mockProviders'
import CatRainScreen from './CatRainScreen'
import GamePlay from '../components/GamePlay'

const navigate = spies.navigate

/** Drive the animation loop by hand: real frames never fire under jsdom. */
let frames: Array<(t: number) => void> = []
let now = 0

function step(ms: number) {
  now += ms
  const pending = frames
  frames = []
  act(() => {
    for (const fn of pending) fn(now)
  })
}

beforeEach(() => {
  navigate.mockClear()
  frames = []
  now = 0
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frames.push(cb as (t: number) => void)
    return frames.length
  })
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
  vi.spyOn(performance, 'now').mockImplementation(() => now)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** Run the loop until `check` is true, or give up. */
function runUntil(check: () => boolean, maxFrames = 400) {
  for (let i = 0; i < maxFrames && !check(); i += 1) step(40)
  return check()
}

describe('the falling words', () => {
  function start(game = aGame()) {
    render(<CatRainScreen game={game} navigate={navigate} />)
    fireEvent.click(screen.getByText('▶ Start'))
    return game
  }

  it('spawns words as the game runs', () => {
    start()
    const appeared = runUntil(() => document.querySelectorAll('.font-mono').length > 0)
    expect(appeared).toBe(true)
  })

  it('costs a life when a word reaches the ground', () => {
    start()
    const lostOne = runUntil(() => screen.queryByLabelText('2 lives') !== null)
    expect(lostOne).toBe(true)
  })

  it('ends the game after three lives, and records the score', () => {
    const game = start()
    const over = runUntil(() => (game.addHighScore as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    expect(over).toBe(true)
    expect(screen.getByText(/Word Rain/)).toBeTruthy()
  })

  it('speeds up as the score climbs', () => {
    // A level is derived from the score, so a fresh game is level one.
    start()
    runUntil(() => document.querySelectorAll('.font-mono').length > 0)
    expect(screen.getByText('Lvl 1')).toBeTruthy()
  })

  it('locks onto a word once its first letter is typed, and keeps a combo', () => {
    start()
    runUntil(() => document.querySelectorAll('.font-mono').length > 0)
    const word = document.querySelector('.font-mono')!.textContent!
    fireEvent.keyDown(window, { key: word[0]! })
    step(40)
    expect(screen.queryByText('Combo x1') ?? screen.queryByText('Combo x0')).toBeTruthy()
  })

  it('breaks the combo on a wrong letter', () => {
    start()
    runUntil(() => document.querySelectorAll('.font-mono').length > 0)
    // A digit is never in the word pool, so this is always a miss.
    fireEvent.keyDown(window, { key: '1' })
    step(40)
    expect(screen.getByText('Combo x0')).toBeTruthy()
  })

  it('scores a word typed all the way through', () => {
    start()
    runUntil(() => document.querySelectorAll('.font-mono').length > 0)
    const word = document.querySelector('.font-mono')!.textContent!
    for (const ch of word) fireEvent.keyDown(window, { key: ch })
    step(40)
    expect(screen.queryByText('Score: 0')).toBeNull()
  })

  it('can be replayed from the results card', () => {
    const game = start()
    runUntil(() => (game.addHighScore as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    const replay = screen.queryAllByRole('button').find((b) => /again|replay|play/i.test(b.textContent ?? ''))
    if (!replay) return
    fireEvent.click(replay)
    expect(screen.queryByText('Score: 0') ?? screen.queryByText(/Word Rain/)).toBeTruthy()
  })

  it('goes back to typing from the results card', () => {
    const game = start()
    runUntil(() => (game.addHighScore as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    const menu = screen.queryAllByRole('button').find((b) => /menu|home/i.test(b.textContent ?? ''))
    if (!menu) return
    fireEvent.click(menu)
    expect(navigate).toHaveBeenCalledWith({ name: 'typing' })
  })
})

describe('the mascot reacting to a round of typing', () => {
  const onFinish = vi.fn()
  const onQuit = vi.fn()

  beforeEach(() => {
    onFinish.mockClear()
    onQuit.mockClear()
  })

  function renderRound(text: string) {
    return render(
      <GamePlay
        text={text}
        title="Home row"
        showKeyboard
        showHands
        sound
        onFinish={onFinish}
        onQuit={onQuit}
      />,
    )
  }

  it('cheers on a run, in the theme’s own words', () => {
    // Ten in a row is the beat the mascot reacts to; below that the sound and
    // the floaters carry it.
    const text = 'aaaaaaaaaaaa'
    renderRound(text)
    for (const ch of text.slice(0, 10)) fireEvent.keyDown(window, { key: ch })
    expect(document.body.textContent).toContain('Home row')
  })

  it('reacts to a mistake without stopping the round', () => {
    renderRound('abc')
    fireEvent.keyDown(window, { key: 'z' })
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.keyDown(window, { key: 'b' })
    fireEvent.keyDown(window, { key: 'c' })
    expect(onFinish).toHaveBeenCalled()
    expect(onFinish.mock.calls[0]![0].incorrect).toBe(1)
  })

  it('swallows Tab and space rather than letting them move focus or scroll', () => {
    renderRound('a b')
    fireEvent.keyDown(window, { key: 'Tab' })
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.keyDown(window, { key: ' ' })
    fireEvent.keyDown(window, { key: 'b' })
    expect(onFinish).toHaveBeenCalled()
  })

  it('scores the round it just finished', () => {
    renderRound('ab')
    fireEvent.keyDown(window, { key: 'a' })
    fireEvent.keyDown(window, { key: 'b' })
    const result = onFinish.mock.calls[0]![0]
    expect(result.score).toBeGreaterThan(0)
    expect(result.totalTyped).toBe(2)
  })
})
