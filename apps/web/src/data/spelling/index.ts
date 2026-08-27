import type { GradeLevel, SpellingList, WordEntry } from './types'
import { GRADE_2 } from './grade2'
import { GRADE_3 } from './grade3'
import { GRADE_4 } from './grade4'
import { GRADE_5 } from './grade5'
import { GRADE_6 } from './grade6'
import { GRADE_7 } from './grade7'
import { GRADE_8 } from './grade8'

export type { GradeLevel, SpellingList, WordEntry } from './types'

/** The curriculum, easiest first. Level index 0 is second grade. */
export const GRADES: GradeLevel[] = [GRADE_2, GRADE_3, GRADE_4, GRADE_5, GRADE_6, GRADE_7, GRADE_8]

export const FIRST_GRADE = GRADES[0].grade
export const LAST_GRADE = GRADES[GRADES.length - 1].grade

/** A word plus everything the engine needs to schedule it. */
export interface CurriculumWord extends WordEntry {
  listId: string
  listTitle: string
  grade: number
  /** Estimated difficulty on the same scale as learner ability (roughly grade level). */
  difficulty: number
}

// ---------------------------------------------------------------------------
// Difficulty model
//
// Ability and difficulty share one scale so the two can be compared directly
// (see lib/spelling/adaptive.ts). Grade placement carries most of the signal;
// length and irregular spelling patterns nudge a word up or down within its
// grade so that "cat" and "grass" are not treated as equally hard.
// ---------------------------------------------------------------------------

/** Spelling patterns that reliably trip learners up, worth a difficulty bump. */
const IRREGULAR_PATTERNS: Array<[RegExp, number]> = [
  [/(ough|augh)/, 0.5], // through, caught
  [/^(kn|wr|gn|pn)/, 0.35], // silent openers
  [/(mb|bt|mn)$/, 0.3], // thumb, debt, column
  [/(cei|ie)/, 0.25], // i-before-e territory
  [/([bcdfglmnprstz])\1/, 0.25], // doubled consonant
  [/(tion|sion|cian)$/, 0.2],
  [/(ance|ence|ant|ent)$/, 0.25],
  [/(able|ible)$/, 0.25],
  [/(ary|ery|ory)$/, 0.3],
  [/(eau|eur|oir|ois)/, 0.45], // borrowed from French
  [/'/, 0.2], // contractions
  [/ph/, 0.2],
  [/(ei|eo|ua|uo)/, 0.15], // uncommon vowel pairs
]

function syllableEstimate(word: string): number {
  const groups = word.toLowerCase().replace(/[^a-z]/g, '').match(/[aeiouy]+/g)
  if (!groups) return 1
  let count = groups.length
  if (/[^aeiouy]e$/.test(word) && count > 1) count -= 1 // silent final e
  return Math.max(1, count)
}

export function wordDifficulty(word: string, grade: number): number {
  const w = word.toLowerCase()
  const letters = w.replace(/[^a-z]/g, '').length

  // Base: the grade band this word was taught in.
  let d = grade

  // Length, measured against what is typical for the grade.
  const expectedLength = 3.5 + grade * 0.85
  d += Math.max(-0.6, Math.min(0.9, (letters - expectedLength) * 0.14))

  // Syllables beyond two add load.
  d += Math.max(0, syllableEstimate(w) - 2) * 0.12

  for (const [pattern, weight] of IRREGULAR_PATTERNS) {
    if (pattern.test(w)) d += weight
  }

  // Keep everything inside the curriculum's range so a single hard word cannot
  // drag a learner's ability estimate off the scale.
  return Math.round(Math.max(1.2, Math.min(LAST_GRADE + 1.5, d)) * 100) / 100
}

// ---------------------------------------------------------------------------
// Flattened lookups, built once at module load.
// ---------------------------------------------------------------------------

export const ALL_WORDS: CurriculumWord[] = GRADES.flatMap((g) =>
  g.lists.flatMap((list) =>
    list.words.map((entry) => ({
      ...entry,
      listId: list.id,
      listTitle: list.title,
      grade: g.grade,
      difficulty: wordDifficulty(entry.w, g.grade),
    })),
  ),
)

const WORD_INDEX = new Map(ALL_WORDS.map((w) => [w.w, w]))
const LIST_INDEX = new Map<string, { list: SpellingList; grade: number }>(
  GRADES.flatMap((g) => g.lists.map((list) => [list.id, { list, grade: g.grade }] as const)),
)

export function lookupWord(word: string): CurriculumWord | undefined {
  return WORD_INDEX.get(word)
}

export function lookupList(listId: string): { list: SpellingList; grade: number } | undefined {
  return LIST_INDEX.get(listId)
}

export function gradeAt(levelIndex: number): GradeLevel {
  return GRADES[Math.max(0, Math.min(GRADES.length - 1, levelIndex))]
}

export function levelIndexForGrade(grade: number): number {
  const idx = GRADES.findIndex((g) => g.grade === grade)
  return idx === -1 ? 0 : idx
}

export function wordsInList(listId: string): CurriculumWord[] {
  return ALL_WORDS.filter((w) => w.listId === listId)
}

export function wordsInGrade(grade: number): CurriculumWord[] {
  return ALL_WORDS.filter((w) => w.grade === grade)
}

export const TOTAL_WORDS = ALL_WORDS.length
export const TOTAL_LISTS = GRADES.reduce((n, g) => n + g.lists.length, 0)
