// Read-only selectors over a progress snapshot. Screens use these instead of
// poking at the snapshot directly, so "what counts as mastered" is defined once.

import { ALL_WORDS, gradeAt, wordsInGrade, wordsInList, type CurriculumWord } from '../../data/spelling'
import { isDue, masteryBand, type MasteryBand } from '../adaptive'
import { masteryKey, todayString, type ItemMastery, type ProgressSnapshot } from '../progress/types'

export interface MasteryBreakdown {
  total: number
  mastered: number
  practiced: number
  learning: number
  unseen: number
}

export function breakdown(snapshot: ProgressSnapshot, words: CurriculumWord[]): MasteryBreakdown {
  const counts: Record<MasteryBand, number> = { new: 0, learning: 0, practiced: 0, mastered: 0 }
  for (const w of words) {
    counts[masteryBand(snapshot.mastery[masteryKey('spelling', w.w)])] += 1
  }
  return {
    total: words.length,
    mastered: counts.mastered,
    practiced: counts.practiced,
    learning: counts.learning,
    unseen: counts.new,
  }
}

export function gradeBreakdown(snapshot: ProgressSnapshot, grade: number): MasteryBreakdown {
  return breakdown(snapshot, wordsInGrade(grade))
}

export function listBreakdown(snapshot: ProgressSnapshot, listId: string): MasteryBreakdown {
  return breakdown(snapshot, wordsInList(listId))
}

/** Words scheduled for review today or earlier. */
export function dueWords(snapshot: ProgressSnapshot, today = todayString()): ItemMastery[] {
  return Object.values(snapshot.mastery).filter((m) => m.subject === 'spelling' && isDue(m, today))
}

/** The words this learner gets wrong most — the heart of the parent report. */
export function troubleWords(snapshot: ProgressSnapshot, limit = 12): ItemMastery[] {
  return Object.values(snapshot.mastery)
    .filter((m) => m.subject === 'spelling' && m.totalAttempts >= 2 && m.mastery < 0.8)
    .sort((a, b) => {
      const byMastery = a.mastery - b.mastery
      if (Math.abs(byMastery) > 0.01) return byMastery
      return b.lapses - a.lapses
    })
    .slice(0, limit)
}

/** Words that went from missed to mastered — the encouraging half of the report. */
export function turnaroundWords(snapshot: ProgressSnapshot, limit = 12): ItemMastery[] {
  return Object.values(snapshot.mastery)
    .filter((m) => m.subject === 'spelling' && m.lapses >= 1 && m.mastery >= 0.8)
    .sort((a, b) => b.lapses - a.lapses)
    .slice(0, limit)
}

export interface LevelSnapshot {
  grade: number
  name: string
  emoji: string
  color: string
  blurb: string
  breakdown: MasteryBreakdown
  /** Share of the level's words at mastered band, 0..1. */
  progress: number
}

export function levelSnapshot(snapshot: ProgressSnapshot, levelIndex: number): LevelSnapshot {
  const grade = gradeAt(levelIndex)
  const b = gradeBreakdown(snapshot, grade.grade)
  return {
    grade: grade.grade,
    name: grade.name,
    emoji: grade.emoji,
    color: grade.color,
    blurb: grade.blurb,
    breakdown: b,
    progress: b.total > 0 ? b.mastered / b.total : 0,
  }
}

/** Every word the learner has ever attempted, newest first. Powers the Pro report. */
export function attemptedWords(snapshot: ProgressSnapshot): ItemMastery[] {
  return Object.values(snapshot.mastery)
    .filter((m) => m.subject === 'spelling')
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

export function totalCurriculumWords(): number {
  return ALL_WORDS.length
}
