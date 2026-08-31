// Which pool a piece of work counts toward.
//
// The rule underneath every test here: filing content is an upgrade, never a
// gate. Nothing unfiled, mis-filed or filed under a track that has since gone
// away may ever become unusable — a learner losing a deck because a registry
// changed would be the worst possible outcome of a tidying exercise.

import { describe, expect, it } from 'vitest'
import {
  ABILITY_FLOOR_ITEMS,
  AREAS,
  areaOf,
  GENERAL_TRACK,
  hasAbsoluteLevel,
  showsAbility,
  TRACKS,
  trackOf,
  tracksInArea,
} from './tracks.js'
import { defaultSkillState, skillKey } from './progress.js'

describe('the registry', () => {
  it('puts every track in an area that exists', () => {
    const areas = new Set(AREAS.map((a) => a.id))
    for (const track of TRACKS) {
      expect(areas.has(track.areaId), `${track.id} -> ${track.areaId}`).toBe(true)
    }
  })

  it('has no two tracks with the same id', () => {
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length)
  })

  it('names every track and area', () => {
    for (const t of TRACKS) expect(t.name.length, t.id).toBeGreaterThan(1)
    for (const a of AREAS) expect(a.name.length, a.id).toBeGreaterThan(1)
  })

  it('always has somewhere for unfiled content to live', () => {
    expect(trackOf(null).id).toBe(GENERAL_TRACK)
    expect(TRACKS.some((t) => t.id === GENERAL_TRACK)).toBe(true)
  })

  it('lists the tracks in an area', () => {
    expect(tracksInArea('math').length).toBeGreaterThan(1)
    expect(tracksInArea('nonsense')).toEqual([])
  })
})

describe('resolving a track', () => {
  it('takes null, undefined and empty as unfiled rather than as an error', () => {
    for (const value of [null, undefined, '']) {
      expect(trackOf(value).id, String(value)).toBe(GENERAL_TRACK)
    }
  })

  it('falls back to General for a track that no longer exists', () => {
    // A registry change must never cost a learner their deck.
    expect(trackOf('science.alchemy').id).toBe(GENERAL_TRACK)
  })

  it('resolves the area of whatever it was given', () => {
    expect(areaOf('science.biology').id).toBe('science')
    expect(areaOf(null).id).toBe('general')
    expect(areaOf('made.up').id).toBe('general')
  })
})

describe('what a track may claim', () => {
  it('lets skill tracks report a level that means something outside the app', () => {
    expect(hasAbsoluteLevel('language.spelling')).toBe(true)
    expect(hasAbsoluteLevel('math.facts')).toBe(true)
  })

  it('refuses a content track a grade it cannot support honestly', () => {
    expect(hasAbsoluteLevel('science.biology')).toBe(false)
    expect(hasAbsoluteLevel(null)).toBe(false)
  })

  it('hides an ability number until there is enough evidence for one', () => {
    // Twelve answers is noise wearing a decimal point.
    expect(showsAbility('science.biology', 12)).toBe(false)
    expect(showsAbility('science.biology', ABILITY_FLOOR_ITEMS)).toBe(true)
  })

  it('always shows a skill track, because its scale is the curriculum', () => {
    expect(showsAbility('language.spelling', 0)).toBe(true)
  })
})

describe('the ability pool key', () => {
  it('leaves spelling and typing whole, because their curriculum is the pool', () => {
    expect(skillKey('spelling')).toBe('spelling')
    expect(skillKey('typing', null)).toBe('typing')
  })

  it('splits study sets by track', () => {
    expect(skillKey('quiz', 'science.biology')).toBe('quiz:science.biology')
    expect(skillKey('quiz', 'world.spanish')).not.toBe(skillKey('quiz', 'science.biology'))
  })

  it('keeps unfiled work in one pool rather than inventing one per deck', () => {
    expect(skillKey('quiz', null)).toBe('quiz')
  })

  it('carries the track onto the state it creates', () => {
    expect(defaultSkillState('quiz', 'math.geometry')).toMatchObject({
      subject: 'quiz',
      track: 'math.geometry',
    })
  })

  it('leaves the track off when there is none, so old rows stay identical', () => {
    expect('track' in defaultSkillState('spelling')).toBe(false)
  })
})
