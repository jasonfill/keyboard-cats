// Where content sits, and which ability pool the work belongs to.
//
// `SkillState` is keyed by subject, and every study deck in the app shares the
// subject `quiz` — so a learner has one "quiz ability" averaging Spanish
// vocabulary, cell biology and state capitals. That number is an average of
// unrelated things, and every planning decision that reads it is running on
// noise.
//
// The fix is *not* to open up `Subject`. `Subject` picks the engine, routes
// assignments, and namespaces mastery keys as `quiz:deckId:cardId` — changing
// it would mean either rewriting `attempts`, which is append-only by design, or
// detaching every learner's history from the cards it belongs to. So `Subject`
// is untouched and this is added alongside it.
//
// See docs/content-structure-spec.md.

export type TrackId = string

/** Navigation only. Nothing computes off an area. */
export interface Area {
  id: string
  name: string
  emoji: string
}

export interface Track {
  id: TrackId
  areaId: string
  name: string
  /**
   * Skill tracks have an ordered curriculum and an absolute scale that means
   * something outside the app — a grade level, a words-per-minute. Content
   * tracks have arbitrary material and difficulty relative to the track, so
   * they report mastery and retention and never claim a grade, because they
   * cannot support one honestly.
   */
  kind: 'skill' | 'content'
}

/** Where unfiled content lives. Filing is an upgrade, never a gate. */
export const GENERAL_TRACK: TrackId = 'general'

export const AREAS: Area[] = [
  { id: 'general', name: 'Anything else', emoji: '🗂️' },
  { id: 'language', name: 'Language & Literacy', emoji: '📖' },
  { id: 'math', name: 'Math', emoji: '🔢' },
  { id: 'science', name: 'Science', emoji: '🔬' },
  { id: 'social', name: 'Social Studies', emoji: '🌍' },
  { id: 'world', name: 'World Languages', emoji: '🗣️' },
  { id: 'life', name: 'Life Skills', emoji: '🧭' },
]

/**
 * Deliberately short.
 *
 * A track is an ability pool, so the vocabulary is closed and curated — a pool
 * anyone can mint is not a pool. The long tail lives in *units*, which anyone
 * can make and which file into one of these. Adding a track is a considered
 * act, not a side effect of somebody naming a deck.
 */
export const TRACKS: Track[] = [
  { id: 'general', areaId: 'general', name: 'General', kind: 'content' },

  { id: 'language.spelling', areaId: 'language', name: 'Spelling', kind: 'skill' },
  { id: 'language.vocabulary', areaId: 'language', name: 'Vocabulary', kind: 'content' },
  { id: 'language.reading', areaId: 'language', name: 'Reading', kind: 'content' },
  { id: 'language.grammar', areaId: 'language', name: 'Grammar', kind: 'content' },
  { id: 'language.typing', areaId: 'language', name: 'Typing', kind: 'skill' },

  { id: 'math.facts', areaId: 'math', name: 'Math Facts', kind: 'skill' },
  { id: 'math.arithmetic', areaId: 'math', name: 'Arithmetic', kind: 'content' },
  { id: 'math.fractions', areaId: 'math', name: 'Fractions & Decimals', kind: 'content' },
  { id: 'math.geometry', areaId: 'math', name: 'Geometry', kind: 'content' },
  { id: 'math.algebra', areaId: 'math', name: 'Algebra', kind: 'content' },

  { id: 'science.biology', areaId: 'science', name: 'Biology', kind: 'content' },
  { id: 'science.chemistry', areaId: 'science', name: 'Chemistry', kind: 'content' },
  { id: 'science.physics', areaId: 'science', name: 'Physics', kind: 'content' },
  { id: 'science.earth', areaId: 'science', name: 'Earth & Space', kind: 'content' },

  { id: 'social.history', areaId: 'social', name: 'History', kind: 'content' },
  { id: 'social.geography', areaId: 'social', name: 'Geography', kind: 'content' },
  { id: 'social.civics', areaId: 'social', name: 'Civics', kind: 'content' },

  { id: 'world.spanish', areaId: 'world', name: 'Spanish', kind: 'content' },
  { id: 'world.french', areaId: 'world', name: 'French', kind: 'content' },
  { id: 'world.other', areaId: 'world', name: 'Another language', kind: 'content' },

  { id: 'life.money', areaId: 'life', name: 'Money & Finance', kind: 'content' },
  { id: 'life.health', areaId: 'life', name: 'Health', kind: 'content' },
]

const TRACK_BY_ID = new Map(TRACKS.map((t) => [t.id, t]))
const AREA_BY_ID = new Map(AREAS.map((a) => [a.id, a]))

/**
 * The pool a piece of content belongs to.
 *
 * Null, empty and unknown all resolve to General rather than throwing or
 * disappearing. Content filed under a track that was later removed is still
 * content, and a learner should never lose a deck because a registry changed.
 */
export function trackOf(track: string | null | undefined): Track {
  if (!track) return TRACK_BY_ID.get(GENERAL_TRACK)!
  return TRACK_BY_ID.get(track) ?? TRACK_BY_ID.get(GENERAL_TRACK)!
}

export function areaOf(track: string | null | undefined): Area {
  return AREA_BY_ID.get(trackOf(track).areaId) ?? AREA_BY_ID.get('general')!
}

export function tracksInArea(areaId: string): Track[] {
  return TRACKS.filter((t) => t.areaId === areaId)
}

/** Whether a track reports a level that means something outside the app. */
export function hasAbsoluteLevel(track: string | null | undefined): boolean {
  return trackOf(track).kind === 'skill'
}

/**
 * Below this a track has too little evidence for an ability estimate to mean
 * anything, and a number derived from a dozen answers is noise wearing a
 * decimal point. Mastery counts are still perfectly honest at any size.
 */
export const ABILITY_FLOOR_ITEMS = 30

export function showsAbility(track: string | null | undefined, answeredItems: number): boolean {
  return hasAbsoluteLevel(track) || answeredItems >= ABILITY_FLOOR_ITEMS
}
