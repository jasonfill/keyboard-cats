import { useTheme } from '../lib/theme/ThemeProvider'
import { placeholderStripe, slotLabels } from '../lib/themes'

interface Props {
  /**
   * Stable id for this collectible, stored in progress. Which slot of the
   * theme's set it maps to is derived from it, so the same earned item is the
   * same item forever — and stays the same item after a theme change, just
   * wearing the new world's name.
   */
  seed: string
  className?: string
  rounded?: string
  /** Show the item's name underneath. */
  showLabel?: boolean
}

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

/**
 * One earned collectible, in whatever the current world calls it.
 *
 * Replaces CatPhoto, which fetched real kitten photographs from a third-party
 * image host. That was wrong twice over: it made the typing game's rewards
 * cats no matter which of the ten worlds a learner had chosen, and it put a
 * network round trip — to a service that can be down, slow, or serve something
 * unexpected — in front of a child's reward.
 *
 * Art is the theme's stripe until drawn reward art exists, the same slot the
 * world screen uses, so the two agree about what a learner owns.
 */
export default function Collectible({
  seed,
  className = '',
  rounded = 'rounded-2xl',
  showLabel = false,
}: Props) {
  const { theme } = useTheme()
  const labels = slotLabels(theme)
  const index = hashSeed(seed) % labels.length
  const name = labels[index]!

  return (
    <div className={showLabel ? '' : className}>
      <div
        role="img"
        aria-label={`${name}, a ${theme.unitOne}`}
        className={`${rounded} ${showLabel ? className : 'h-full w-full'}`}
        style={{ background: placeholderStripe(theme) }}
      />
      {showLabel && (
        <div className="mt-1 truncate text-center text-[13px] font-extrabold text-ink">{name}</div>
      )}
    </div>
  )
}
