import type { GameState } from '../lib/storage'

export interface Achievement {
  id: string
  name: string
  emoji: string
  description: string
  // Given the latest state, is this unlocked?
  test: (s: GameState) => boolean
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-steps',
    name: 'First Pawsteps',
    emoji: '🐾',
    description: 'Finish your very first lesson.',
    test: (s) => Object.values(s.lessons).some((l) => l.plays > 0),
  },
  {
    id: 'three-stars',
    name: 'Star Kitty',
    emoji: '⭐',
    description: 'Earn 3 stars on any lesson.',
    test: (s) => Object.values(s.lessons).some((l) => l.stars >= 3),
  },
  {
    id: 'ten-stars',
    name: 'Constellation Cat',
    emoji: '🌟',
    description: 'Collect 10 stars in total.',
    test: (s) => s.totalStars >= 10,
  },
  {
    id: 'sharp-claws',
    name: 'Sharp Claws',
    emoji: '🎯',
    description: 'Finish a round with 95%+ accuracy.',
    test: (s) => Object.values(s.lessons).some((l) => l.bestAccuracy >= 95),
  },
  {
    id: 'speedy-paws',
    name: 'Speedy Paws',
    emoji: '⚡',
    description: 'Reach 20 WPM in any round.',
    test: (s) => Object.values(s.lessons).some((l) => l.bestWpm >= 20),
  },
  {
    id: 'zoomies',
    name: 'The Zoomies',
    emoji: '💨',
    description: 'Reach 35 WPM in any round.',
    test: (s) => Object.values(s.lessons).some((l) => l.bestWpm >= 35),
  },
  {
    id: 'home-master',
    name: 'Meadow Master',
    emoji: '🌼',
    description: 'Earn 3 stars on every Home Row lesson.',
    test: (s) => {
      const ids = ['home-fj', 'home-dk', 'home-sl', 'home-a-semi', 'home-gh', 'home-space', 'home-review']
      return ids.every((id) => (s.lessons[id]?.stars ?? 0) >= 3)
    },
  },
  {
    id: 'collector',
    name: 'Cat Collector',
    emoji: '📸',
    description: 'Collect 5 cat cards.',
    test: (s) => s.collectedCats.length >= 5,
  },
  {
    id: 'high-scorer',
    name: 'Top Cat',
    emoji: '🏆',
    description: 'Land a score of 1000+ in one round.',
    test: (s) =>
      Object.values(s.lessons).some((l) => l.bestScore >= 1000) ||
      s.highScores.some((h) => h.score >= 1000),
  },
]

export function newlyUnlocked(state: GameState): Achievement[] {
  return ACHIEVEMENTS.filter(
    (a) => a.test(state) && !state.achievements.includes(a.id),
  )
}
