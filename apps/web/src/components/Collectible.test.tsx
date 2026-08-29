// One earned collectible.
//
// It replaced a component that fetched real kitten photographs from a
// third-party host, so the two properties worth pinning are that it reaches no
// network at all, and that the same stored seed always names the same item —
// otherwise a learner's collection would reshuffle itself on every render.

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Collectible from './Collectible'
import { slotLabels, THEMES, themeById } from '../lib/themes'

let activeTheme = THEMES[0]!
vi.mock('../lib/theme/ThemeProvider', () => ({
  useTheme: () => ({
    theme: activeTheme,
    themes: THEMES,
    setTheme: vi.fn(),
    setThemeFor: vi.fn(),
    source: 'guest',
  }),
}))

describe('what it draws', () => {
  it('names an item from the current world', () => {
    activeTheme = themeById('cats')
    render(<Collectible seed="lesson-1" showLabel />)
    const names = slotLabels(activeTheme)
    const label = screen.getByRole('img').getAttribute('aria-label')!
    expect(names.some((n) => label.includes(n))).toBe(true)
  })

  it('describes it as one of the theme’s collectibles, for a screen reader', () => {
    activeTheme = themeById('robots')
    render(<Collectible seed="lesson-1" />)
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain(activeTheme.unitOne)
  })

  it('shows the name only when asked', () => {
    activeTheme = themeById('cats')
    const { rerender } = render(<Collectible seed="lesson-1" />)
    const before = screen.queryAllByText(/Tabby|Calico|Tuxedo/).length
    rerender(<Collectible seed="lesson-1" showLabel />)
    expect(screen.queryAllByText(/./).length).toBeGreaterThanOrEqual(before)
  })
})

describe('a seed always means the same item', () => {
  it('renders the same name every time', () => {
    activeTheme = themeById('cats')
    const labels = Array.from({ length: 5 }, () => {
      const { unmount } = render(<Collectible seed="stable-seed" />)
      const label = screen.getByRole('img').getAttribute('aria-label')!
      unmount()
      return label
    })
    expect(new Set(labels).size).toBe(1)
  })

  it('gives different seeds different items', () => {
    activeTheme = themeById('cats')
    const labels = ['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => {
      const { unmount } = render(<Collectible seed={seed} />)
      const label = screen.getByRole('img').getAttribute('aria-label')!
      unmount()
      return label
    })
    expect(new Set(labels).size).toBeGreaterThan(1)
  })

  it('stays inside the theme’s own set, whichever world is on', () => {
    for (const theme of THEMES) {
      activeTheme = theme
      const names = new Set(slotLabels(theme))
      for (const seed of ['x', 'y', 'z']) {
        const { unmount } = render(<Collectible seed={seed} />)
        const label = screen.getByRole('img').getAttribute('aria-label')!
        const named = [...names].some((n) => label.startsWith(n))
        unmount()
        expect(named, `${theme.id}/${seed}: ${label}`).toBe(true)
      }
    }
  })
})

describe('it reaches no network', () => {
  it('renders no img element and no remote src', () => {
    // The component it replaced fetched kitten photographs from a third-party
    // image host, which put a network round trip in front of a child's reward.
    activeTheme = themeById('cats')
    const { container } = render(<Collectible seed="lesson-1" />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.innerHTML).not.toMatch(/https?:\/\//)
  })
})
