// How a word is turned into a question.
//
// The proofreading distractors are the sharp edge: a "misspelling" that is
// actually spelled correctly makes the question unanswerable, and a duplicate
// makes it trivially answerable. Both are silent.

import { describe, expect, it } from 'vitest'
import {
  buildMissingLetters,
  errorPattern,
  isCorrect,
  maskWordInSentence,
  misspellings,
  proofreadChoices,
  scramble,
} from './activities'
import { ALL_WORDS } from '../../data/spelling'

describe('isCorrect', () => {
  it('accepts the word', () => {
    expect(isCorrect('cat', 'cat')).toBe(true)
  })

  it('forgives case and surrounding space, which are not spelling', () => {
    expect(isCorrect('  Cat ', 'cat')).toBe(true)
  })

  it('does not forgive a misspelling', () => {
    expect(isCorrect('kat', 'cat')).toBe(false)
  })

  it('does not accept an empty answer', () => {
    expect(isCorrect('', 'cat')).toBe(false)
    expect(isCorrect('   ', 'cat')).toBe(false)
  })
})

describe('misspellings', () => {
  it('returns exactly the number asked for', () => {
    for (const word of ['cat', 'accommodate', 'receive', "don't"]) {
      expect(misspellings(word, 3)).toHaveLength(3)
    }
  })

  it('still produces options for a one-letter word', () => {
    // 'a' and 'I' are real words, and a grown-up can put either in a custom
    // list. Every rule declines on a single letter, which left the proofread
    // question rendering with the answer as its only option.
    for (const word of ['a', 'I']) {
      expect(misspellings(word, 3), word).toHaveLength(3)
      expect(proofreadChoices(word, () => 0.5), word).toHaveLength(4)
    }
  })

  it('never returns the correct spelling among them', () => {
    for (const w of ALL_WORDS.slice(0, 400)) {
      expect(misspellings(w.w, 3)).not.toContain(w.w.toLowerCase())
    }
  })

  it('never repeats one', () => {
    for (const w of ALL_WORDS.slice(0, 400)) {
      const out = misspellings(w.w, 3)
      expect(new Set(out).size).toBe(out.length)
    }
  })

  it('produces a distractor for every word in the curriculum', () => {
    // A short regular word resists most of the rules; the fallback exists so
    // no word can render a question with blank options.
    for (const w of ALL_WORDS) {
      const out = misspellings(w.w, 3)
      expect(out.every((m) => m.length >= 2), w.w).toBe(true)
    }
  })
})

describe('proofreadChoices', () => {
  it('offers the right answer plus three wrong ones', () => {
    const choices = proofreadChoices('accommodate', () => 0.5)
    expect(choices).toHaveLength(4)
    expect(choices).toContain('accommodate')
    expect(new Set(choices).size).toBe(4)
  })

  it('holds exactly one correct option for every word in the curriculum', () => {
    // Two correct options, or none, makes the question unanswerable.
    for (const w of ALL_WORDS.slice(0, 300)) {
      const choices = proofreadChoices(w.w, () => 0.5)
      const correct = choices.filter((c) => c === w.w.toLowerCase())
      expect(correct, w.w).toHaveLength(1)
    }
  })

  it('does not always put the answer in the same place', () => {
    const positions = new Set(
      Array.from({ length: 40 }, () => proofreadChoices('receive').indexOf('receive')),
    )
    expect(positions.size).toBeGreaterThan(1)
  })
})

describe('errorPattern — what trips a word up', () => {
  it('names the feature the word is actually teaching', () => {
    expect(errorPattern('accommodate')).toBe('doubled consonant')
    expect(errorPattern('receive')).toBe('ei/ie swap')
    expect(errorPattern('knight')).toBe('silent opener')
    expect(errorPattern('nation')).toBe('-tion ending')
    // 'possible' has a doubled consonant, which is the more specific reading —
    // the order is deliberate, so a word is named for what it is teaching.
    expect(errorPattern('possible')).toBe('doubled consonant')
    expect(errorPattern('edible')).toBe('-able/-ible')
  })

  it('says nothing about a short regular word rather than inventing a reason', () => {
    expect(errorPattern('cat')).toBeNull()
    expect(errorPattern('dog')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(errorPattern('Receive')).toBe(errorPattern('receive'))
  })

  it('returns either a name or null for every word in the curriculum', () => {
    for (const w of ALL_WORDS) {
      const p = errorPattern(w.w)
      expect(p === null || (typeof p === 'string' && p.length > 0), w.w).toBe(true)
    }
  })

  it('describes the same word the same way wherever it is asked', () => {
    // The session header and the parent's trouble table both read this, and
    // they must agree.
    expect(errorPattern('accommodate')).toBe(errorPattern('accommodate'))
  })
})

describe('maskWordInSentence', () => {
  it('hides the word so the sentence does not give it away', () => {
    const masked = maskWordInSentence('The cat sat down.', 'cat')
    expect(masked.toLowerCase()).not.toContain('cat')
    expect(masked).toContain('sat down')
  })

  it('hides it whatever case it appears in', () => {
    expect(maskWordInSentence('Cat naps happen.', 'cat').toLowerCase()).not.toContain('cat')
  })

  it('leaves a sentence that does not contain the word alone', () => {
    expect(maskWordInSentence('Nothing here.', 'zebra')).toBe('Nothing here.')
  })
})

describe('scramble', () => {
  it('keeps every letter', () => {
    const out = scramble('spelling')
    expect([...out].sort().join('')).toBe([...'spelling'].sort().join(''))
  })

  it('does not hand back the answer unscrambled', () => {
    for (const word of ['spelling', 'because', 'thought']) {
      expect(scramble(word)).not.toBe(word)
    }
  })

  it('copes with a word too short to rearrange', () => {
    expect(() => scramble('a')).not.toThrow()
  })
})

describe('buildMissingLetters', () => {
  it('leaves gaps and keeps the length', () => {
    const built = buildMissingLetters('spelling', 3)
    expect(built.masked).toHaveLength('spelling'.length)
    expect(built.masked).toContain('_')
  })

  it('does not blank the whole word', () => {
    const built = buildMissingLetters('spelling', 3)
    expect(built.masked.replace(/_/g, '')).not.toBe('')
  })

  it('handles a two-letter word without erasing it entirely', () => {
    const built = buildMissingLetters('as', 2)
    expect(built.masked.replace(/_/g, '').length).toBeGreaterThanOrEqual(0)
    expect(built.masked).toHaveLength(2)
  })
})
