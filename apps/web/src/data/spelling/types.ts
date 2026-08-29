// Shared shape for every spelling list in the curriculum.

export interface WordEntry {
  /** The word the learner has to spell. Always lowercase unless it's a proper noun. */
  w: string
  /** A sentence that uses the word — read aloud so the learner hears it in context. */
  s: string
}

export interface SpellingList {
  id: string
  title: string
  /** The phonics or morphology rule the list teaches, shown on the study screen. */
  focus: string
  words: WordEntry[]
}

export interface GradeLevel {
  /** School grade this band targets. The curriculum starts at 2. */
  grade: number
  /**
   * What this band teaches. Curriculum, so it is the same in every world —
   * what the band is *called* comes from the theme instead.
   */
  blurb: string
  lists: SpellingList[]
}
