export type LessonKind = 'keys' | 'words' | 'sentence'

export interface LessonDef {
  id: string
  title: string
  blurb: string
  newKeys: string[] // characters introduced in this lesson ('' means space)
  kind: LessonKind
  /** Stable id for the collectible this lesson awards. The theme decides
   *  which of its items that id names. */
  catSeed: string
}

export interface WorldDef {
  id: string
  /**
   * Which keys this world teaches. Curriculum, so it is the same in every
   * theme — what the world is *called* comes from the theme, and the blurb is
   * what guarantees a themed name never leaves a learner unsure which row
   * they are on.
   */
  blurb: string
  lessons: LessonDef[]
}

// Ordered curriculum. Each lesson's *allowed* key set is the union of every
// newKeys[] up to and including it (see buildCurriculum). This mirrors how
// touch-typing is taught: home row first, then reaches, then the rest.
export const WORLDS: WorldDef[] = [
  {
    id: 'home',
    blurb: 'The home row — where every finger comes back to rest.',
    lessons: [
      { id: 'home-fj', title: 'F & J — the bumps', blurb: 'Your index fingers live here.', newKeys: ['f', 'j'], kind: 'keys', catSeed: 'homefj' },
      { id: 'home-dk', title: 'D & K', blurb: 'Middle fingers join the party.', newKeys: ['d', 'k'], kind: 'keys', catSeed: 'homedk' },
      { id: 'home-sl', title: 'S & L', blurb: 'Ring fingers reach out.', newKeys: ['s', 'l'], kind: 'keys', catSeed: 'homesl' },
      { id: 'home-a-semi', title: 'A & ;', blurb: 'Pinkies to the edges.', newKeys: ['a', ';'], kind: 'keys', catSeed: 'homeasemi' },
      { id: 'home-gh', title: 'G & H', blurb: 'Index fingers reach inward.', newKeys: ['g', 'h'], kind: 'keys', catSeed: 'homegh' },
      { id: 'home-space', title: 'The Space Bar', blurb: 'Thumbs make the words breathe.', newKeys: [' '], kind: 'words', catSeed: 'homespace' },
      { id: 'home-review', title: 'Home Row Review', blurb: 'Real home-row words!', newKeys: [], kind: 'words', catSeed: 'homereview' },
    ],
  },
  {
    id: 'top',
    blurb: 'The top row, one reach at a time.',
    lessons: [
      { id: 'top-ei', title: 'E & I', blurb: 'Middle fingers reach up.', newKeys: ['e', 'i'], kind: 'words', catSeed: 'topei' },
      { id: 'top-ru', title: 'R & U', blurb: 'Index fingers reach up.', newKeys: ['r', 'u'], kind: 'words', catSeed: 'topru' },
      { id: 'top-ty', title: 'T & Y', blurb: 'The tricky inside reach.', newKeys: ['t', 'y'], kind: 'words', catSeed: 'topty' },
      { id: 'top-wo', title: 'W & O', blurb: 'Ring fingers up top.', newKeys: ['w', 'o'], kind: 'words', catSeed: 'topwo' },
      { id: 'top-qp', title: 'Q & P', blurb: 'Pinkies to the top corners.', newKeys: ['q', 'p'], kind: 'words', catSeed: 'topqp' },
      { id: 'top-review', title: 'Top Row Review', blurb: 'Longer, faster words.', newKeys: [], kind: 'words', catSeed: 'topreview' },
    ],
  },
  {
    id: 'bottom',
    blurb: 'The bottom row, down under your fingers.',
    lessons: [
      { id: 'bot-cm', title: 'C & Comma', blurb: 'Middle fingers dig down.', newKeys: ['c', ','], kind: 'words', catSeed: 'botcm' },
      { id: 'bot-vm', title: 'V & M', blurb: 'Index fingers down low.', newKeys: ['v', 'm'], kind: 'words', catSeed: 'botvm' },
      { id: 'bot-bn', title: 'B & N', blurb: 'The inside bottom reach.', newKeys: ['b', 'n'], kind: 'words', catSeed: 'botbn' },
      { id: 'bot-xperiod', title: 'X & Period', blurb: 'Ring fingers down.', newKeys: ['x', '.'], kind: 'words', catSeed: 'botxp' },
      { id: 'bot-zslash', title: 'Z & Slash', blurb: 'Pinkies down to the corners.', newKeys: ['z', '/'], kind: 'words', catSeed: 'botzs' },
      { id: 'bot-review', title: 'Bottom Row Review', blurb: 'Every letter, real words!', newKeys: [], kind: 'words', catSeed: 'botreview' },
    ],
  },
  {
    id: 'sentences',
    blurb: 'Every letter you know, put together into real sentences.',
    lessons: [
      { id: 'sen-1', title: 'First Sentences', blurb: 'Type whole thoughts.', newKeys: [], kind: 'sentence', catSeed: 'sen1' },
      { id: 'sen-2', title: 'Cat Tales', blurb: 'Stories about cats!', newKeys: [], kind: 'sentence', catSeed: 'sen2' },
      { id: 'sen-3', title: 'Speed & Flow', blurb: 'Keep a smooth rhythm.', newKeys: [], kind: 'sentence', catSeed: 'sen3' },
    ],
  },
  {
    id: 'numbers',
    blurb: 'The number row, right at the very top.',
    lessons: [
      { id: 'num-mid', title: '4 5 6 7', blurb: 'Index fingers stretch up.', newKeys: ['4', '5', '6', '7'], kind: 'keys', catSeed: 'nummid' },
      { id: 'num-out', title: '3 8 & 2 9', blurb: 'Middle and ring reach.', newKeys: ['3', '8', '2', '9'], kind: 'keys', catSeed: 'numout' },
      { id: 'num-edge', title: '1 & 0', blurb: 'Pinkies all the way up.', newKeys: ['1', '0'], kind: 'keys', catSeed: 'numedge' },
      { id: 'num-review', title: 'Number Review', blurb: 'Mix numbers with words.', newKeys: [], kind: 'words', catSeed: 'numreview' },
    ],
  },
]

export interface CurriculumLesson extends LessonDef {
  worldId: string
  worldIndex: number
  index: number // global order index
  allowedKeys: string[] // cumulative set available at this lesson
}

// Flatten worlds into an ordered list and compute cumulative allowed keys.
export function buildCurriculum(): CurriculumLesson[] {
  const out: CurriculumLesson[] = []
  const allowed = new Set<string>()
  let index = 0
  for (const world of WORLDS) {
    for (const lesson of world.lessons) {
      for (const k of lesson.newKeys) allowed.add(k)
      out.push({
        ...lesson,
        worldId: world.id,
        worldIndex: WORLDS.indexOf(world),
        index,
        allowedKeys: [...allowed],
      })
      index++
    }
  }
  return out
}

export const CURRICULUM = buildCurriculum()
export const TOTAL_LESSONS = CURRICULUM.length

export function getLesson(id: string): CurriculumLesson | undefined {
  return CURRICULUM.find((l) => l.id === id)
}
