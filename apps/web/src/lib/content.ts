import type { CurriculumLesson } from '../data/lessons'
import { WORD_BANK, SENTENCES } from '../data/words'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function onlyAllowed(word: string, allowed: Set<string>): boolean {
  for (const ch of word) {
    if (ch === ' ') continue
    if (!allowed.has(ch.toLowerCase())) return false
  }
  return true
}

// Drill lines for brand-new keys: repetition + combos, mixed with home row.
function generateKeyDrill(lesson: CurriculumLesson): string {
  const focus = lesson.newKeys.filter((k) => k !== ' ')
  const allowedLetters = lesson.allowedKeys.filter(
    (k) => k !== ' ' && /[a-z0-9]/.test(k),
  )
  const anchors = allowedLetters.length ? allowedLetters : focus

  const chunks: string[] = []
  // Warm up: solid repetition of each new key.
  for (const k of focus) chunks.push(k.repeat(3))
  // Alternate the new keys.
  if (focus.length >= 2) {
    chunks.push(focus[0] + focus[1] + focus[0])
    chunks.push(focus[1] + focus[0] + focus[1])
  }
  // Mix new keys with previously learned anchors.
  for (let i = 0; i < 8; i++) {
    const a = pick(focus)
    const b = pick(anchors)
    const c = pick(focus)
    chunks.push(a + b + c)
  }
  return shuffle(chunks).join(' ')
}

// Word lines drawn from the bank, restricted to unlocked keys.
function generateWords(lesson: CurriculumLesson, count = 16): string {
  const allowed = new Set(lesson.allowedKeys)
  const usable = WORD_BANK.filter((w) => onlyAllowed(w, allowed))
  // Prefer words that exercise the new keys of this lesson.
  const focus = lesson.newKeys.filter((k) => k !== ' ')
  const withFocus = usable.filter((w) =>
    focus.some((k) => w.toLowerCase().includes(k)),
  )

  const pool: string[] = []
  const source = withFocus.length >= 4 ? withFocus : usable
  if (source.length === 0) {
    // Fallback: emit simple combos of allowed letters.
    return generateKeyDrill(lesson)
  }
  while (pool.length < count) {
    pool.push(pick(source))
    // Sprinkle in general usable words so it doesn't feel repetitive.
    if (withFocus.length && Math.random() < 0.4 && usable.length) {
      pool.push(pick(usable))
    }
  }
  return pool.slice(0, count).join(' ')
}

// Real sentences (already lowercase with basic punctuation).
function generateSentence(lesson: CurriculumLesson, lines = 2): string {
  const allowed = new Set(lesson.allowedKeys)
  const usable = SENTENCES.filter((s) => onlyAllowed(s, allowed))
  const source = usable.length ? usable : SENTENCES
  const chosen: string[] = []
  const shuffled = shuffle(source)
  for (let i = 0; i < lines; i++) chosen.push(shuffled[i % shuffled.length])
  return chosen.join(' ')
}

export function generateLessonText(lesson: CurriculumLesson): string {
  switch (lesson.kind) {
    case 'keys':
      return generateKeyDrill(lesson)
    case 'words':
      return generateWords(lesson)
    case 'sentence':
      return generateSentence(lesson)
  }
}

// Free-typing practice: any pool of words the learner has unlocked (or all).
export function generatePracticeText(
  allowedKeys: string[] | 'all',
  count = 24,
): string {
  let usable: string[]
  if (allowedKeys === 'all') {
    usable = WORD_BANK
  } else {
    const allowed = new Set(allowedKeys)
    usable = WORD_BANK.filter((w) => onlyAllowed(w, allowed))
  }
  if (usable.length === 0) usable = ['cat', 'dad', 'fall']
  const pool: string[] = []
  while (pool.length < count) pool.push(pick(usable))
  return pool.join(' ')
}

// Words for the Cat Rain arcade mode, capped in length for readability.
export function rainWords(allowedKeys: string[] | 'all', max = 6): string[] {
  let usable: string[]
  if (allowedKeys === 'all') {
    usable = WORD_BANK
  } else {
    const allowed = new Set(allowedKeys)
    usable = WORD_BANK.filter((w) => onlyAllowed(w, allowed))
  }
  usable = usable.filter((w) => w.length <= max && w.length >= 2 && w !== 'a')
  if (usable.length < 5) usable = ['cat', 'meow', 'purr', 'paw', 'nap', 'milk', 'yarn']
  return usable
}
