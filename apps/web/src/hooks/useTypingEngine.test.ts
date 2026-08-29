// The typing engine.
//
// A learner types one character at a time and the engine decides what that
// meant. The rule that shapes everything else: a wrong key does not advance
// the cursor, so the learner has to actually produce the right character
// before moving on — which is why `cursor` and `correct` can diverge from the
// number of keys pressed.

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTypingEngine } from './useTypingEngine'

function type(result: { current: ReturnType<typeof useTypingEngine> }, keys: string) {
  for (const key of keys) {
    act(() => result.current.handleChar(key))
  }
}

beforeEach(() => {
  vi.useRealTimers()
})

describe('starting out', () => {
  it('begins with nothing typed and the clock stopped', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    expect(result.current.snapshot).toMatchObject({
      cursor: 0,
      correct: 0,
      incorrect: 0,
      combo: 0,
      started: false,
      finished: false,
      elapsedMs: 0,
    })
  })

  it('points at the first character', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    expect(result.current.snapshot.nextChar).toBe('c')
  })

  it('reports full accuracy before anything is typed, not zero', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    expect(result.current.snapshot.accuracy).toBe(100)
  })
})

describe('a correct keystroke', () => {
  it('advances the cursor and counts', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'c')
    expect(result.current.snapshot).toMatchObject({ cursor: 1, correct: 1, combo: 1 })
    expect(result.current.snapshot.nextChar).toBe('a')
  })

  it('starts the clock on the first real keystroke', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    expect(result.current.snapshot.started).toBe(false)
    type(result, 'c')
    expect(result.current.snapshot.started).toBe(true)
  })

  it('builds a combo and remembers the best one', () => {
    const { result } = renderHook(() => useTypingEngine('cats'))
    type(result, 'cat')
    expect(result.current.snapshot.combo).toBe(3)
    type(result, 'x') // wrong, breaks it
    expect(result.current.snapshot.combo).toBe(0)
    expect(result.current.snapshot.maxCombo).toBe(3)
  })

  it('announces each correct character with the running combo', () => {
    const onCorrect = vi.fn()
    const { result } = renderHook(() => useTypingEngine('cat', { onCorrect }))
    type(result, 'ca')
    expect(onCorrect).toHaveBeenNthCalledWith(1, 'c', 1)
    expect(onCorrect).toHaveBeenNthCalledWith(2, 'a', 2)
  })
})

describe('a wrong keystroke', () => {
  it('does not advance the cursor', () => {
    // The learner has to produce the right character before moving on.
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'x')
    expect(result.current.snapshot.cursor).toBe(0)
    expect(result.current.snapshot.nextChar).toBe('c')
  })

  it('counts the mistake and breaks the combo', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'c')
    type(result, 'x')
    expect(result.current.snapshot).toMatchObject({ incorrect: 1, combo: 0, correct: 1 })
  })

  it('records the mistake against the character that was expected', () => {
    // Spaced repetition for keys reads this, so it has to blame the key the
    // learner failed to hit, not the one they hit by accident.
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'x')
    expect(result.current.snapshot.errorsByChar).toEqual({ c: 1 })
    expect(result.current.snapshot.lastWrong).toBe('c')
  })

  it('accumulates repeated mistakes on the same key', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'xxx')
    expect(result.current.snapshot.errorsByChar.c).toBe(3)
  })

  it('announces what was expected and what arrived', () => {
    const onWrong = vi.fn()
    const { result } = renderHook(() => useTypingEngine('cat', { onWrong }))
    type(result, 'x')
    expect(onWrong).toHaveBeenCalledWith('c', 'x')
  })

  it('clears lastWrong once the learner recovers', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'x')
    type(result, 'c')
    expect(result.current.snapshot.lastWrong).toBeNull()
  })

  it('starts the clock even when the first keystroke is wrong', () => {
    // Time spent getting it wrong is still time spent.
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'x')
    expect(result.current.snapshot.started).toBe(true)
  })
})

describe('finishing', () => {
  it('is finished once the last character lands', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'cat')
    expect(result.current.snapshot.finished).toBe(true)
    expect(result.current.snapshot.nextChar).toBeNull()
  })

  it('calls onFinish exactly once', () => {
    const onFinish = vi.fn()
    const { result } = renderHook(() => useTypingEngine('cat', { onFinish }))
    type(result, 'cat')
    expect(onFinish).toHaveBeenCalledTimes(1)
  })

  it('hands the round summary to onFinish', () => {
    const onFinish = vi.fn()
    const { result } = renderHook(() => useTypingEngine('cat', { onFinish }))
    type(result, 'cxat')
    const snap = onFinish.mock.calls[0]![0]
    expect(snap).toMatchObject({ correct: 3, incorrect: 1, finished: true })
    expect(snap.accuracy).toBe(75)
    expect(Number.isFinite(snap.wpm)).toBe(true)
  })

  it('ignores further keystrokes after the end', () => {
    const onCorrect = vi.fn()
    const { result } = renderHook(() => useTypingEngine('cat', { onCorrect }))
    type(result, 'cat')
    const after = result.current.snapshot.correct
    type(result, 'xyz')
    expect(result.current.snapshot.correct).toBe(after)
    expect(onCorrect).toHaveBeenCalledTimes(3)
  })

  it('stops the clock, so elapsed time does not creep after the round', async () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'cat')
    const settled = result.current.snapshot.elapsedMs
    await new Promise((r) => setTimeout(r, 60))
    expect(result.current.snapshot.elapsedMs).toBe(settled)
  })
})

describe('accuracy', () => {
  it('is measured over every keystroke, not over the characters completed', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'cxxat')
    expect(result.current.snapshot).toMatchObject({ correct: 3, incorrect: 2 })
    expect(result.current.snapshot.accuracy).toBe(60)
  })
})

describe('reset', () => {
  it('clears the round', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    type(result, 'cx')
    act(() => result.current.reset())
    expect(result.current.snapshot).toMatchObject({
      cursor: 0,
      correct: 0,
      incorrect: 0,
      started: false,
      finished: false,
    })
    expect(result.current.snapshot.errorsByChar).toEqual({})
  })

  it('can be pointed at new text', () => {
    const { result } = renderHook(() => useTypingEngine('cat'))
    act(() => result.current.reset('dog'))
    expect(result.current.snapshot.target).toBe('dog')
    expect(result.current.snapshot.nextChar).toBe('d')
  })

  it('lets onFinish fire again on the next round', () => {
    const onFinish = vi.fn()
    const { result } = renderHook(() => useTypingEngine('ab', { onFinish }))
    type(result, 'ab')
    act(() => result.current.reset())
    type(result, 'ab')
    expect(onFinish).toHaveBeenCalledTimes(2)
  })
})

describe('changing the target', () => {
  it('starts a fresh round rather than carrying the old one over', () => {
    const { result, rerender } = renderHook(({ text }) => useTypingEngine(text), {
      initialProps: { text: 'cat' },
    })
    type(result, 'ca')
    rerender({ text: 'dog' })
    expect(result.current.snapshot).toMatchObject({ target: 'dog', cursor: 0, correct: 0 })
  })
})

describe('edge cases', () => {
  it('does not crash on empty text', () => {
    const { result } = renderHook(() => useTypingEngine(''))
    expect(() => type(result, 'x')).not.toThrow()
    expect(result.current.snapshot.nextChar).toBeNull()
  })

  it('handles a space as an ordinary character', () => {
    const { result } = renderHook(() => useTypingEngine('a b'))
    type(result, 'a b')
    expect(result.current.snapshot.finished).toBe(true)
    expect(result.current.snapshot.correct).toBe(3)
  })

  it('is case-sensitive, because the keyboard is', () => {
    const { result } = renderHook(() => useTypingEngine('Cat'))
    type(result, 'c')
    expect(result.current.snapshot.incorrect).toBe(1)
    expect(result.current.snapshot.cursor).toBe(0)
  })
})
