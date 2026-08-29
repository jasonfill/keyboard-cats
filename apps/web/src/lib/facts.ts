// Small true things shown after a typing round.
//
// These replace the cat facts, which were charming and are now wrong: a
// learner on Robots or Ocean has not opted into cat trivia. Rather than write
// ten sets of themed facts — and have the quality of the facts vary by which
// world a child picked — these are about typing and writing, which is what
// every learner here has in common whatever world they are in.
//
// Deliberately not themed. The curriculum is the same in every world, and so
// is this.

export const TYPING_FACTS: string[] = [
  'The home row exists so your fingers always know the way back without looking.',
  'QWERTY was designed in the 1870s, and we still use it out of sheer habit.',
  'The space bar is pressed more than any other key — about one press in five.',
  'Touch typists are faster mostly because they stop looking down, not because they move faster.',
  'The average handwriting speed is about 20 words a minute. Typing beats it easily.',
  'Your two index fingers cover eight of the keys between them.',
  '"Stewardesses" is one of the longest words you can type with the left hand alone.',
  'Accuracy beats speed: fixing a typo costs more time than typing the letter slowly.',
  'The letter E is the most common in English, which is why it sits under a strong finger.',
  'Most people type faster in short bursts than they think — the pauses are the slow part.',
  'The Dvorak layout puts every vowel on the home row. Almost nobody switched.',
  'Looking at the screen instead of the keyboard is the single biggest speed gain there is.',
]

export function randomTypingFact(): string {
  return TYPING_FACTS[Math.floor(Math.random() * TYPING_FACTS.length)]!
}
