// Kid-friendly word bank (6th-grade appropriate). Used to build practice lines
// that only contain the keys a learner has unlocked so far.
export const WORD_BANK: string[] = [
  // super short / home-row-ish
  'a', 'as', 'ask', 'dad', 'sad', 'lad', 'fall', 'salad', 'flask', 'glass',
  'gas', 'flag', 'hall', 'jak', 'lass', 'add', 'all', 'hag', 'gag', 'sash',
  // common little words
  'the', 'and', 'you', 'for', 'are', 'was', 'his', 'her', 'she', 'him',
  'they', 'them', 'then', 'this', 'that', 'with', 'have', 'from', 'were',
  'what', 'when', 'your', 'said', 'will', 'each', 'their', 'there', 'been',
  // fun words, spread across every world and belonging to none of them
  'paw', 'tail', 'fur', 'nap', 'mouse', 'milk', 'treat', 'cozy', 'tiger',
  'lion', 'wheel', 'engine', 'helmet', 'fossil', 'comet', 'orbit', 'reef',
  'wave', 'shell', 'saddle', 'ribbon', 'drum', 'guitar', 'circuit', 'sensor',
  // general vocabulary a 6th grader knows
  'dog', 'fish', 'bird', 'tree', 'leaf', 'rain', 'snow', 'wind', 'star',
  'moon', 'sun', 'sky', 'cloud', 'river', 'ocean', 'beach', 'sand', 'rock',
  'house', 'school', 'friend', 'family', 'pizza', 'apple', 'grape', 'lemon',
  'happy', 'funny', 'quick', 'jump', 'run', 'walk', 'play', 'game', 'score',
  'book', 'read', 'write', 'learn', 'smart', 'brave', 'kind', 'super', 'cool',
  'music', 'dance', 'paint', 'draw', 'build', 'dream', 'magic', 'space',
  'planet', 'robot', 'dragon', 'castle', 'wizard', 'puzzle', 'garden',
  'orange', 'purple', 'yellow', 'green', 'silver', 'golden', 'bright',
  'water', 'light', 'night', 'morning', 'today', 'tomorrow', 'always',
  'jungle', 'forest', 'desert', 'mountain', 'valley', 'meadow', 'bridge',
  'zebra', 'quokka', 'penguin', 'dolphin', 'rabbit', 'turtle', 'monkey',
  'seven', 'eight', 'nine', 'ten', 'twelve', 'dozen', 'number', 'level',
]

// Short, uplifting sentences for advanced lessons (accuracy under real text).
//
// Deliberately not themed. These are what a learner actually types, and the
// letters in them are the point — a sentence is picked for its key coverage,
// not its subject. Ten themed sets would mean the practice text differed in
// difficulty depending on which world a child picked, which is exactly what a
// theme is not allowed to do.
export const SENTENCES: string[] = [
  'a quick brown fox jumps over the lazy dog.',
  'keep your fingers on the home row keys.',
  'practice a little every day and you will grow.',
  'you can type faster if you do not look down.',
  'reach for each key and return to home.',
  'good typists care about accuracy before speed.',
  'take a deep breath and try your very best.',
  'stars shine bright over the sleeping town.',
  'the river runs quietly past the old stone bridge.',
  'every expert was once a complete beginner.',
  'six brave zebras jogged past my quiet farm.',
  'the museum opens early on a foggy autumn morning.',
  'pack my box with five dozen liquid jugs.',
  'she built a small robot out of wheels and wire.',
  'we watched the waves until the sky turned gold.',
]
