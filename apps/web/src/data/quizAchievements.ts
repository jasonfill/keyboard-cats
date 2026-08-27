import { MASTERED_THRESHOLD } from '../lib/adaptive'
import type { ProgressSnapshot, SkillState } from '../lib/progress/types'

export interface QuizAchievement {
  id: string
  name: string
  emoji: string
  description: string
  test: (snapshot: ProgressSnapshot, skill: SkillState) => boolean
}

function masteredCards(snapshot: ProgressSnapshot): number {
  return Object.values(snapshot.mastery).filter(
    (m) => m.subject === 'quiz' && m.mastery >= MASTERED_THRESHOLD,
  ).length
}

function quizSessions(snapshot: ProgressSnapshot, mode?: string) {
  return snapshot.sessions.filter(
    (s) => s.subject === 'quiz' && (mode === undefined || s.activity === mode),
  )
}

export const QUIZ_ACHIEVEMENTS: QuizAchievement[] = [
  {
    id: 'quiz-first-deck',
    name: 'Deck Builder',
    emoji: '🃏',
    description: 'Make your first deck of your own.',
    test: (s) => s.decks.some((d) => d.source === 'user'),
  },
  {
    id: 'quiz-first-round',
    name: 'Warmed Up',
    emoji: '🐾',
    description: 'Finish your first round of study.',
    test: (s) => quizSessions(s).length > 0,
  },
  {
    id: 'quiz-ten-mastered',
    name: 'Ten Down',
    emoji: '📚',
    description: 'Master 10 cards.',
    test: (s) => masteredCards(s) >= 10,
  },
  {
    id: 'quiz-fifty-mastered',
    name: 'Card Sharp',
    emoji: '🎴',
    description: 'Master 50 cards.',
    test: (s) => masteredCards(s) >= 50,
  },
  {
    id: 'quiz-two-hundred-mastered',
    name: 'Encyclopaedia Cat',
    emoji: '🧠',
    description: 'Master 200 cards.',
    test: (s) => masteredCards(s) >= 200,
  },
  {
    id: 'quiz-perfect-test',
    name: 'Clean Sheet',
    emoji: '💯',
    description: 'Score 100% on a test.',
    test: (s) => quizSessions(s, 'test').some((x) => x.itemsTotal > 0 && x.accuracy >= 100),
  },
  {
    id: 'quiz-written-master',
    name: 'From Memory',
    emoji: '✍️',
    description: 'Answer 100 cards by writing them out, no multiple choice.',
    test: (_s, skill) => skill.totalAttempts >= 100,
  },
  {
    id: 'quiz-match-speed',
    name: 'Lightning Paws',
    emoji: '⚡',
    description: 'Finish a Match game in under 30 seconds.',
    test: (s) =>
      s.sessions.some(
        (x) => x.subject === 'quiz' && x.activity === 'match' && x.durationMs > 0 && x.durationMs < 30_000,
      ),
  },
  {
    id: 'quiz-streak-week',
    name: 'Seven Day Study',
    emoji: '🔥',
    description: 'Study your decks seven days in a row.',
    test: (_s, skill) => skill.bestStreakDays >= 7,
  },
  {
    id: 'quiz-big-deck',
    name: 'Serious Business',
    emoji: '📦',
    description: 'Build a deck with 50 cards or more.',
    test: (s) => s.decks.some((d) => d.cards.length >= 50),
  },
]

/** Achievements the learner has just qualified for and does not already own. */
export function newlyUnlocked(
  snapshot: ProgressSnapshot,
  skill: SkillState,
  owned: Set<string>,
): QuizAchievement[] {
  return QUIZ_ACHIEVEMENTS.filter((a) => !owned.has(a.id) && a.test(snapshot, skill))
}
