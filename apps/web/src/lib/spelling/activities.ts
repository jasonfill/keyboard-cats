// Puzzle generators and answer checking for the spelling activities.
//
// The misspelling generator matters more than it looks: proofreading only
// teaches anything if the wrong choices are the mistakes learners actually
// make. Each rule below mirrors a real, common spelling error.

export type ActivityId =
  | 'study'
  | 'listen-spell'
  | 'missing-letters'
  | 'scramble'
  | 'proofread'
  | 'test'

export interface ActivityDef {
  id: ActivityId
  name: string
  emoji: string
  blurb: string
  /** Graded activities feed the ability estimate; practice ones do not. */
  isTest: boolean
  /** Requires the learner to produce the whole word from memory. */
  unaided: boolean
}

export const ACTIVITIES: ActivityDef[] = [
  {
    id: 'study',
    name: 'Study the List',
    emoji: '📖',
    blurb: 'See it, hear it, type it along with the word in front of you.',
    isTest: false,
    unaided: false,
  },
  {
    id: 'listen-spell',
    name: 'Listen & Spell',
    emoji: '🎧',
    blurb: 'Hear the word in a sentence, then spell it from memory.',
    isTest: true,
    unaided: true,
  },
  {
    id: 'missing-letters',
    name: 'Missing Letters',
    emoji: '🧩',
    blurb: 'Fill in the letters that fell out of the word.',
    isTest: false,
    unaided: false,
  },
  {
    id: 'scramble',
    name: 'Word Scramble',
    emoji: '🔀',
    blurb: 'Untangle the letters to rebuild the word.',
    isTest: false,
    unaided: false,
  },
  {
    id: 'proofread',
    name: 'Proofread',
    emoji: '🔍',
    blurb: 'Spot the correctly spelled word among the impostors.',
    isTest: false,
    unaided: false,
  },
  {
    id: 'test',
    name: 'Spelling Test',
    emoji: '📝',
    blurb: 'No hints, no second chances. This is the one that counts.',
    isTest: true,
    unaided: true,
  },
]

export function activity(id: ActivityId): ActivityDef {
  return ACTIVITIES.find((a) => a.id === id) ?? ACTIVITIES[1]
}

// --- Answer checking -----------------------------------------------------

/** Spelling is case-insensitive here, but every other character must match. */
export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/’/g, "'")
}

export function isCorrect(given: string, word: string): boolean {
  return normalizeAnswer(given) === normalizeAnswer(word)
}

export interface LetterDiff {
  char: string
  status: 'correct' | 'wrong' | 'missing' | 'extra'
}

/**
 * Character-by-character comparison for the feedback panel. Simple alignment is
 * enough: after a length mismatch we mark the tail as missing or extra, which
 * reads more clearly to a child than a full edit-distance alignment would.
 */
export function diffAnswer(given: string, word: string): LetterDiff[] {
  const g = normalizeAnswer(given)
  const w = normalizeAnswer(word)
  const out: LetterDiff[] = []
  const len = Math.max(g.length, w.length)
  for (let i = 0; i < len; i++) {
    if (i >= g.length) out.push({ char: w[i], status: 'missing' })
    else if (i >= w.length) out.push({ char: g[i], status: 'extra' })
    else out.push({ char: g[i], status: g[i] === w[i] ? 'correct' : 'wrong' })
  }
  return out
}

/**
 * Blank the target word out of its own example sentence. Anything that shows
 * the sentence while asking for the word has to do this, or the prompt hands
 * over the answer. Matching is whole-word and the word is escaped, so an
 * apostrophe in a contraction cannot break the pattern.
 */
export function maskWordInSentence(sentence: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return sentence.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '_____')
}

// --- Missing letters -----------------------------------------------------

export interface MissingLetterPuzzle {
  /** The word with blanks, e.g. 'b_c_use'. */
  masked: string
  /** Indexes that were blanked out, in order. */
  blanks: number[]
}

/**
 * Blank out the letters most likely to be the hard part. Vowels and doubled
 * consonants are where spelling errors cluster, so they get blanked first.
 */
export function buildMissingLetters(word: string, difficulty: number): MissingLetterPuzzle {
  const chars = [...word]
  const share = difficulty >= 6 ? 0.45 : difficulty >= 4 ? 0.35 : 0.28
  const count = Math.max(1, Math.min(chars.length - 1, Math.round(chars.length * share)))

  const scored = chars.map((c, i) => {
    let score = 0
    if (/[aeiou]/i.test(c)) score += 3
    if (i > 0 && chars[i - 1].toLowerCase() === c.toLowerCase()) score += 4 // doubled
    if (i > 0 && i < chars.length - 1) score += 1 // interior letters are harder
    if (/[^a-z]/i.test(c)) score = -10 // never blank an apostrophe
    return { i, score }
  })

  const blanks = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, count)
    .map((s) => s.i)
    .sort((a, b) => a - b)

  const masked = chars.map((c, i) => (blanks.includes(i) ? '_' : c)).join('')
  return { masked, blanks }
}

// --- Scramble ------------------------------------------------------------

/** Shuffle the letters, guaranteeing the result is not the original word. */
export function scramble(word: string, rng: () => number = Math.random): string {
  const letters = [...word.toLowerCase()]
  if (letters.length < 2) return word
  for (let attempt = 0; attempt < 8; attempt++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[letters[i], letters[j]] = [letters[j], letters[i]]
    }
    const candidate = letters.join('')
    if (candidate !== word.toLowerCase()) return candidate
  }
  // Degenerate case (e.g. 'aaa') — reversing is the best we can do.
  return [...word.toLowerCase()].reverse().join('')
}

// --- Plausible misspellings ---------------------------------------------

/**
 * Each rule reproduces a real error pattern rather than a random typo. Order
 * matters: the earlier rules are the mistakes learners make on the exact
 * feature the word is teaching, the later ones are the general-purpose errors
 * that keep short, regular words from running out of plausible distractors.
 */
const MISSPELL_RULES: Array<(w: string) => string | null> = [
  // Drop one half of a doubled consonant: "acommodate".
  (w) => {
    const m = w.match(/([bcdfglmnprstz])\1/)
    return m ? w.replace(m[0], m[1]) : null
  },
  // Double a consonant that should stay single: "writting".
  (w) => {
    const m = w.match(/([aeiou])([bcdfglmnprst])([aeiou])/)
    return m ? w.replace(m[0], `${m[1]}${m[2]}${m[2]}${m[3]}`) : null
  },
  // Swap ie and ei: "recieve".
  (w) => (w.includes('ie') ? w.replace('ie', 'ei') : w.includes('ei') ? w.replace('ei', 'ie') : null),
  // -tion written as -sion.
  (w) => (w.endsWith('tion') ? w.replace(/tion$/, 'sion') : null),
  // -able and -ible traded.
  (w) =>
    w.endsWith('able')
      ? w.replace(/able$/, 'ible')
      : w.endsWith('ible')
        ? w.replace(/ible$/, 'able')
        : null,
  // -ance and -ence traded.
  (w) =>
    w.endsWith('ance')
      ? w.replace(/ance$/, 'ence')
      : w.endsWith('ence')
        ? w.replace(/ence$/, 'ance')
        : null,
  // Contractions: the apostrophe goes missing, or lands one letter off.
  (w) => (w.includes("'") ? w.replace("'", '') : null),
  (w) => {
    const i = w.indexOf("'")
    if (i <= 0 || i >= w.length - 1) return null
    const bare = w.replace("'", '')
    return `${bare.slice(0, i - 1)}'${bare.slice(i - 1)}`
  },
  // Silent letters dropped.
  (w) => (/^(kn|wr|gn)/.test(w) ? w.slice(1) : null),
  // Phonetic substitutions.
  (w) => (w.includes('ph') ? w.replace('ph', 'f') : null),
  (w) => (w.includes('c') ? w.replace('c', 'k') : null),
  (w) => (w.includes('k') ? w.replace('k', 'c') : null),
  (w) => (w.includes('s') ? w.replace('s', 'z') : null),
  // Schwa confusion in the second-to-last vowel — the single biggest source of
  // real spelling errors in longer words.
  (w) => {
    const vowels = w.match(/[aeiou]/g)
    if (!vowels || vowels.length < 2) return null
    const idx = w.lastIndexOf(vowels[vowels.length - 2])
    const swap: Record<string, string> = { a: 'e', e: 'a', i: 'e', o: 'u', u: 'o' }
    return idx > 0 ? w.slice(0, idx) + swap[w[idx]] + w.slice(idx + 1) : null
  },
  // Drop the silent final e, or add one that does not belong.
  (w) => (/[^aeiou]e$/.test(w) ? w.slice(0, -1) : null),
  (w) => (/[^aeiouy']$/.test(w) && !w.includes("'") ? `${w}e` : null),
  // Substitute the first vowel — how a young speller mishears a short vowel.
  (w) => {
    const idx = w.search(/[aeiou]/)
    if (idx === -1) return null
    const swap: Record<string, string> = { a: 'e', e: 'i', i: 'e', o: 'a', u: 'o' }
    return w.slice(0, idx) + swap[w[idx]] + w.slice(idx + 1)
  },
  // Double the final consonant.
  (w) => (/[bdfglmnprt]$/.test(w) && !w.includes("'") ? w + w[w.length - 1] : null),
  // Insert an extra vowel where one is often heard: "definately".
  (w) => (w.includes('ite') ? w.replace('ite', 'ate') : null),
  // Drop an interior vowel entirely: "diffrent".
  (w) => {
    const idx = w.slice(1, -1).search(/[aeiou]/)
    return idx === -1 ? null : w.slice(0, idx + 1) + w.slice(idx + 2)
  },
]

/**
 * Build distractors for the proofreading activity: `count` plausible
 * misspellings, all distinct from each other and from the real word. Always
 * returns exactly `count` entries so the question never renders short.
 */
export function misspellings(word: string, count = 3): string[] {
  const target = word.toLowerCase()
  const out: string[] = []

  const add = (candidate: string | null): void => {
    if (!candidate) return
    if (candidate === target || out.includes(candidate)) return
    if (candidate.length < 2) return
    out.push(candidate)
  }

  for (const rule of MISSPELL_RULES) {
    if (out.length >= count) break
    add(rule(target))
  }

  // Last resort for words that resisted every rule: swap adjacent letters. This
  // reads more like a typo than a misspelling, which is why it is last.
  let cursor = 1
  while (out.length < count && cursor < target.length) {
    const chars = [...target]
    ;[chars[cursor - 1], chars[cursor]] = [chars[cursor], chars[cursor - 1]]
    add(chars.join(''))
    cursor++
  }

  return out.slice(0, count)
}

/** The four options for a proofreading question, in random order. */
export function proofreadChoices(word: string, rng: () => number = Math.random): string[] {
  const options = [word.toLowerCase(), ...misspellings(word, 3)]
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return options
}
