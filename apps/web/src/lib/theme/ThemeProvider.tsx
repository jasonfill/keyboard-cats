// Holds the active learner's theme and publishes it two ways: as `--wz-accent`
// on the document element, which is what the Tailwind `accent` token reads, and
// as the theme object itself for the copy strings and tints that cannot be
// expressed as a class.
//
// Mounted above the progress provider and below the learner provider, because
// the theme is chosen per learner — siblings differ, and a parent switching
// from one child to another should see the app change with them.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLearners } from '../learners/LearnerProvider'
import {
  DEFAULT_THEME_ID,
  hexToRgbTriple,
  isThemeId,
  themeById,
  THEMES,
  type Theme,
  type ThemeId,
} from '../themes'

// Deliberately small. Grown-up surfaces stay theme-free by never calling
// `useTheme` at all, so there is nothing here for them to opt out of.
interface ThemeContextValue {
  theme: Theme
  themes: Theme[]
  setTheme: (id: ThemeId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Per learner, not per account.
 *
 * Guests get the anonymous slot; a signed-in learner gets one keyed by id.
 * Both live in localStorage, which means a theme does not yet follow a learner
 * to a new device. Doing that needs a column on the learner profile, which is
 * a schema and API change — deliberately out of scope for a presentation-layer
 * re-skin. Everything below the two functions here is storage-agnostic, so
 * that column is a one-function swap when it lands.
 */
const THEME_KEY = 'whizzo:theme'

function storageSlot(learnerId: string | null): string {
  return learnerId ? `${THEME_KEY}:${learnerId}` : `${THEME_KEY}:guest`
}

function readTheme(learnerId: string | null): ThemeId {
  try {
    const stored = localStorage.getItem(storageSlot(learnerId))
    return isThemeId(stored) ? stored : DEFAULT_THEME_ID
  } catch {
    return DEFAULT_THEME_ID
  }
}

function writeTheme(learnerId: string | null, id: ThemeId): void {
  try {
    localStorage.setItem(storageSlot(learnerId), id)
  } catch {
    /* a private window is not a reason to fail a lesson */
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { active } = useLearners()
  const learnerId = active?.id ?? null
  const [themeId, setThemeId] = useState<ThemeId>(() => readTheme(learnerId))

  // Follow the active learner. Switching children swaps the paint with them.
  useEffect(() => {
    setThemeId(readTheme(learnerId))
  }, [learnerId])

  // The one global side effect. Everything styled with the accent tokens reads
  // these variables, so writing them here re-paints every play surface at once
  // without a single component re-rendering on the colour.
  //
  // Four, not one: the pressed/shadow colour and the two tints are as much a
  // part of "the paint" as the accent itself, and a play surface that had to
  // reach for an inline style to get them would be a play surface the sweep
  // could not check.
  useEffect(() => {
    const theme = themeById(themeId)
    const root = document.documentElement.style
    root.setProperty('--wz-accent', theme.accentRgb)
    root.setProperty('--wz-accent-deep', hexToRgbTriple(theme.deep))
    root.setProperty('--wz-tint-a', hexToRgbTriple(theme.tintA))
    root.setProperty('--wz-tint-b', hexToRgbTriple(theme.tintB))
  }, [themeId])

  const setTheme = useCallback(
    (id: ThemeId) => {
      setThemeId(id)
      writeTheme(learnerId, id)
    },
    [learnerId],
  )

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themeById(themeId),
      themes: THEMES,
      setTheme,
    }),
    [themeId, setTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
