// The theme layer.
//
// The brand is the chassis; a theme is the paint. A theme swaps exactly one
// accent colour and one mascot, plus a handful of copy strings — a verb and a
// collectible noun. Nothing else in any screen changes.
//
// Three rules this file exists to keep honest:
//
//   1. A theme never changes curriculum, difficulty, or what earns a reward.
//      A ribbon and a fossil are the same graded round underneath, so nothing
//      here is reachable from `lib/adaptive.ts`. Earn rate is fixed across all
//      ten themes; otherwise switching themes becomes a way to farm easy wins.
//   2. Progress colour is never the accent. Mastery bars, grade rows and charts
//      are `pine` in every theme, so a progress bar means the same thing to
//      every learner. The accent is for play surfaces and CTAs only.
//   3. Grown-up surfaces are theme-free. Family, Progress, Account, Library,
//      Tasks and Plans dial the accent back to `ink`. A progress report must
//      never carry a child's theme.
//
// Theme is display state. It never enters `attempts`.

export type ThemeId =
  | 'cats'
  | 'dogs'
  | 'football'
  | 'space'
  | 'dinosaurs'
  | 'ocean'
  | 'racing'
  | 'horses'
  | 'music'
  | 'robots'

/**
 * How a theme's collectibles are laid out on the world screen.
 *
 * Three archetypes, not ten screens: art and nouns differ per theme, layout
 * and logic do not. Ten bespoke reward screens is ten things to maintain.
 */
export type RewardShape = 'collection' | 'journey' | 'assembly'

export interface Theme {
  id: ThemeId
  name: string
  /** Hex, for SVG fills and inline styles that cannot take a Tailwind class. */
  accent: string
  /** '124 92 255' — written to `--wz-accent`, which drives the `accent` token. */
  accentRgb: string
  /** Pressed state, text on a tint, and the solid-button bottom shadow. */
  deep: string
  /** Hero / panel wash. */
  tintA: string
  /** Chip fill, and the stripe partner in the mascot placeholder. */
  tintB: string
  /**
   * Advisory ordering for the picker and nothing else. A grade 11 student who
   * wants Dinosaurs gets Dinosaurs — this is never a restriction.
   */
  bands: string
  /** Primary CTA verb: 'Pounce in'. */
  verb: string
  /** Plural collectible: 'cat cards'. */
  unit: string
  /** Singular collectible: 'card'. */
  unitOne: string
  /** What the world screen is called: 'Card wall'. */
  worldNoun: string
  shape: RewardShape
  /** Collectible set size. */
  total: number
  /** In-session praise. */
  cheer: string
  cheerSub: string
  /** Reward-screen headline. */
  rewardTitle: string
  /** Why this was earned — always points back at graded work. */
  because: string
  /** Collection cell labels. `collection` themes only; length equals `total`. */
  names?: string[]
  /** Journey stop labels. `journey` themes only. */
  stops?: string[]
  /** Assembly part labels. `assembly` themes only. */
  parts?: string[]
  /** Assembly stage heading, e.g. 'Stegosaurus'. `assembly` themes only. */
  assemblyOf?: string
  /** Art for the mascot slot. Absent themes fall back to the striped placeholder. */
  mascotSrc?: string
}

export const THEMES: Theme[] = [
  {
    id: 'cats',
    name: 'Cats',
    accent: '#7C5CFF',
    accentRgb: '124 92 255',
    deep: '#4C2FD1',
    tintA: '#F3EFFF',
    tintB: '#E9E1FF',
    bands: 'K–5',
    verb: 'Pounce in',
    unit: 'cat cards',
    unitOne: 'card',
    worldNoun: 'Card wall',
    shape: 'collection',
    total: 24,
    cheer: 'Nice one.',
    cheerSub: 'That is the word that got you last Tuesday.',
    rewardTitle: 'Three stars!',
    because: 'Earned by clearing a graded round above its predicted score.',
    names: [
      'Tabby',
      'Calico',
      'Tuxedo',
      'Ginger',
      'Siamese',
      'Maine coon',
      'Sphynx',
      'Ragdoll',
      'Bengal',
      'Persian',
      'Bombay',
      'Manx',
      'Russian blue',
      'Birman',
      'Ocicat',
      'Korat',
      'Savannah',
      'Chartreux',
      'Abyssinian',
      'Burmese',
      'Devon rex',
      'Norwegian forest',
      'Turkish van',
      'Snowshoe',
    ],
  },
  {
    id: 'dogs',
    name: 'Dogs',
    accent: '#C2410C',
    accentRgb: '194 65 12',
    deep: '#7C2D12',
    tintA: '#FDEEE6',
    tintB: '#F8E0D2',
    bands: 'K–5',
    verb: 'Fetch it',
    unit: 'tricks',
    unitOne: 'trick',
    worldNoun: 'Trick book',
    shape: 'collection',
    total: 18,
    cheer: 'Good one!',
    cheerSub: 'Two more and your pup learns something new.',
    rewardTitle: 'Three stars!',
    because: 'Tricks come from graded rounds only — practice keeps them sharp.',
    names: [
      'Sit',
      'Stay',
      'Paw',
      'Roll over',
      'Fetch',
      'Speak',
      'Spin',
      'Play dead',
      'Jump',
      'Weave',
      'Bow',
      'Heel',
      'High five',
      'Crawl',
      'Wave',
      'Beg',
      'Catch',
      'Balance',
    ],
  },
  {
    id: 'football',
    name: 'Football',
    accent: '#1F7A6B',
    accentRgb: '31 122 107',
    deep: '#10493F',
    tintA: '#E6F4EF',
    tintB: '#D6ECE4',
    bands: '3–12',
    verb: 'Kick off',
    unit: 'yards',
    unitOne: 'drive',
    worldNoun: 'The drive',
    shape: 'journey',
    total: 8,
    cheer: 'First down.',
    cheerSub: 'Four more words and you are in the red zone.',
    rewardTitle: 'Touchdown drive!',
    because: 'Yards come from graded rounds. Hints stop the clock instead.',
    stops: [
      'Kickoff',
      'Own 35',
      'Midfield',
      'Their 40',
      'Red zone',
      'Goal line',
      'Touchdown',
      'Trophy',
    ],
  },
  {
    id: 'space',
    name: 'Space',
    accent: '#4338CA',
    accentRgb: '67 56 202',
    deep: '#2A2199',
    tintA: '#ECEBFF',
    tintB: '#DEDCFB',
    bands: '2–9',
    verb: 'Launch',
    unit: 'moons',
    unitOne: 'moon',
    worldNoun: 'Flight path',
    shape: 'journey',
    total: 8,
    cheer: 'Locked on.',
    cheerSub: 'Three more and Jupiter is in range.',
    rewardTitle: 'Orbit reached!',
    because: 'Each mastered list unlocks the next body on the path.',
    stops: [
      'Launchpad',
      'The Moon',
      'Mars',
      'Asteroids',
      'Jupiter',
      'Saturn',
      'Neptune',
      'Deep field',
    ],
  },
  {
    id: 'dinosaurs',
    name: 'Dinosaurs',
    accent: '#4D7C0F',
    accentRgb: '77 124 15',
    deep: '#33520A',
    tintA: '#EFF4E2',
    tintB: '#E2EBD0',
    bands: 'K–4',
    verb: 'Start digging',
    unit: 'fossil bones',
    unitOne: 'bone',
    worldNoun: 'The dig site',
    shape: 'assembly',
    total: 8,
    cheer: 'Something’s down there.',
    cheerSub: 'Two more words and you can brush it off.',
    rewardTitle: 'Bone found!',
    because: 'Bones only come out of graded digs. Hinted words leave the ground.',
    parts: ['Skull', 'Jaw', 'Ribs', 'Spine', 'Tail', 'Claws', 'Legs', 'Plates'],
    assemblyOf: 'Stegosaurus',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    accent: '#0E7490',
    accentRgb: '14 116 144',
    deep: '#0A4E61',
    tintA: '#E4F3F7',
    tintB: '#D2EAF1',
    bands: '1–8',
    verb: 'Dive in',
    unit: 'depths',
    unitOne: 'depth',
    worldNoun: 'The descent',
    shape: 'journey',
    total: 8,
    cheer: 'Down you go.',
    cheerSub: 'The next depth has something with teeth.',
    rewardTitle: 'New depth!',
    because: 'Depth is earned on graded rounds — the light does not come back.',
    stops: [
      'Shore',
      'Reef',
      'Kelp',
      'Open water',
      'Twilight',
      'Midnight',
      'Abyss',
      'Trench',
    ],
  },
  {
    id: 'racing',
    name: 'Racing',
    accent: '#B91C1C',
    accentRgb: '185 28 28',
    deep: '#7F1313',
    tintA: '#FCEAEA',
    tintB: '#F7D9D9',
    bands: '2–10',
    verb: 'Green light',
    unit: 'car parts',
    unitOne: 'part',
    worldNoun: 'The garage',
    shape: 'assembly',
    total: 8,
    cheer: 'Clean lap.',
    cheerSub: 'Two more and you can bolt on the new wing.',
    rewardTitle: 'Part unlocked!',
    because: 'Parts come out of graded laps. A hint is a pit stop.',
    parts: [
      'Chassis',
      'Engine',
      'Tyres',
      'Front wing',
      'Brakes',
      'Exhaust',
      'Livery',
      'Nitro',
    ],
    assemblyOf: 'Your car',
  },
  {
    id: 'horses',
    name: 'Horses',
    accent: '#92400E',
    accentRgb: '146 64 14',
    deep: '#63290A',
    tintA: '#F6EEE2',
    tintB: '#EEE1CC',
    bands: '2–8',
    verb: 'Saddle up',
    unit: 'ribbons',
    unitOne: 'ribbon',
    worldNoun: 'The tack room',
    shape: 'collection',
    total: 15,
    cheer: 'Steady.',
    cheerSub: 'Ribbons only come from graded tests — this is one.',
    rewardTitle: 'Blue ribbon!',
    because: 'Ribbons are awarded for graded tests, never for practice.',
    names: [
      'First, spelling',
      'Second, vocab',
      'Show jumping',
      'Dressage',
      'Cross country',
      'Trail',
      'Barrels',
      'Reining',
      'Hunter',
      'Halter',
      'Western',
      'Endurance',
      'Vaulting',
      'Polo',
      'Grand prix',
    ],
  },
  {
    id: 'music',
    name: 'Music',
    accent: '#BE185D',
    accentRgb: '190 24 93',
    deep: '#831043',
    tintA: '#FCE9F2',
    tintB: '#F8D7E7',
    bands: '4–12',
    verb: 'Sound check',
    unit: 'set list',
    unitOne: 'track',
    worldNoun: 'The set list',
    shape: 'collection',
    total: 20,
    cheer: 'In time.',
    cheerSub: 'Two more and the next track is in the set.',
    rewardTitle: 'Track added!',
    because: 'Tracks are earned on graded rounds. The encore needs all twenty.',
    names: [
      'Opener',
      'Track 2',
      'Track 3',
      'Track 4',
      'Track 5',
      'Track 6',
      'Track 7',
      'Track 8',
      'Track 9',
      'Track 10',
      'Track 11',
      'Track 12',
      'Track 13',
      'Track 14',
      'Track 15',
      'Track 16',
      'Track 17',
      'Track 18',
      'Encore',
      'Closer',
    ],
  },
  {
    id: 'robots',
    name: 'Robots',
    accent: '#475569',
    accentRgb: '71 85 105',
    deep: '#2F3947',
    tintA: '#EDF0F3',
    tintB: '#DFE4EA',
    bands: '3–12',
    verb: 'Power up',
    unit: 'bot parts',
    unitOne: 'part',
    worldNoun: 'The workshop',
    shape: 'assembly',
    total: 8,
    cheer: 'Systems nominal.',
    cheerSub: 'Two more and the sensor array comes online.',
    rewardTitle: 'Part fabricated!',
    because: 'Parts are fabricated from graded work only.',
    parts: [
      'Head',
      'Torso',
      'Left arm',
      'Right arm',
      'Legs',
      'Power core',
      'Sensors',
      'Jetpack',
    ],
    assemblyOf: 'Your bot',
  },
]

export const DEFAULT_THEME_ID: ThemeId = 'cats'

const BY_ID = new Map<ThemeId, Theme>(THEMES.map((t) => [t.id, t]))

/** Never throws: an unknown id falls back to the default rather than blanking the app. */
export function themeById(id: string | null | undefined): Theme {
  return BY_ID.get(id as ThemeId) ?? BY_ID.get(DEFAULT_THEME_ID)!
}

export function isThemeId(id: unknown): id is ThemeId {
  return typeof id === 'string' && BY_ID.has(id as ThemeId)
}

/**
 * The labels a `collection` / `journey` / `assembly` theme uses for its slots.
 * Always `total` long, so a grid never renders a hole.
 */
export function slotLabels(theme: Theme): string[] {
  const given = theme.names ?? theme.stops ?? theme.parts ?? []
  if (given.length >= theme.total) return given.slice(0, theme.total)
  return [...given, ...Array.from({ length: theme.total - given.length }, (_, i) => `#${given.length + i + 1}`)]
}

/**
 * The stripe used wherever mascot or reward art is missing, so a theme can ship
 * art independently and drawn and primitive mascots can coexist.
 */
export function placeholderStripe(theme: Theme): string {
  return `repeating-linear-gradient(135deg, ${theme.tintB} 0 9px, ${theme.tintA} 9px 18px)`
}
