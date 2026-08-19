// Sanity checks on the spelling curriculum. Run with: npm run validate:words
//
// These are the invariants the adaptive engine relies on: item keys are unique
// (mastery is keyed by the word itself), every word appears in its own example
// sentence (the sentence is read aloud as the dictation prompt), and estimated
// difficulty rises monotonically with grade.

import { ALL_WORDS, GRADES, TOTAL_LISTS, TOTAL_WORDS } from '../src/data/spelling'

let failures = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    console.log(`  ok   ${label}`)
  } else {
    failures += 1
    console.error(`  FAIL ${label}${detail ? `\n       ${detail}` : ''}`)
  }
}

console.log(`Spelling curriculum: ${TOTAL_WORDS} words across ${TOTAL_LISTS} lists\n`)

const byWord = new Map<string, string[]>()
for (const w of ALL_WORDS) byWord.set(w.w, [...(byWord.get(w.w) ?? []), w.listId])
const duplicates = [...byWord.entries()].filter(([, lists]) => lists.length > 1)
check(
  'every word appears exactly once',
  duplicates.length === 0,
  duplicates.map(([w, lists]) => `${w}: ${lists.join(', ')}`).join('\n       '),
)

const missingInSentence = ALL_WORDS.filter((w) => !w.s.toLowerCase().includes(w.w.toLowerCase()))
check(
  'every sentence contains its word',
  missingInSentence.length === 0,
  missingInSentence.map((w) => `${w.w}: ${w.s}`).join('\n       '),
)

const emptySentences = ALL_WORDS.filter((w) => w.s.trim().length < 8)
check('every word has a usable sentence', emptySentences.length === 0)

let previousAverage = 0
for (const grade of GRADES) {
  const words = ALL_WORDS.filter((w) => w.grade === grade.grade)
  const average = words.reduce((a, w) => a + w.difficulty, 0) / words.length
  check(
    `grade ${grade.grade} is harder than grade ${grade.grade - 1} (avg ${average.toFixed(2)})`,
    average > previousAverage,
  )
  previousAverage = average
}

const shortLists = GRADES.flatMap((g) => g.lists).filter((l) => l.words.length < 8)
check('every list has at least 8 words', shortLists.length === 0, shortLists.map((l) => l.id).join(', '))

console.log('')
if (failures > 0) {
  console.error(`${failures} check(s) failed`)
  process.exit(1)
}
console.log('All curriculum checks passed.')
