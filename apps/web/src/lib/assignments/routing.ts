// Turning a task into somewhere to go.
//
// An assignment names work in the same vocabulary the database records it in —
// subject, activity, target — because that is what lets a finished round close
// a task without anybody matching up names by hand. This is the other end of
// that: the same three fields, turned into the screen that does the work.

import { CURRICULUM } from '../../data/lessons'
import { GRADES } from '../../data/spelling'
import type { Route } from '../../routes'
import type { Assignment, Subject } from '../progress/types'
import { MODES, type StudyMode } from '../quiz/session'
import { ACTIVITIES, type ActivityId } from '../spelling/activities'

/** What a grown-up can set, described the way they think about it. */
export interface AssignableActivity {
  subject: Subject
  activity: string
  name: string
  emoji: string
  /** Whether the app checks the answers, which is what a score bar needs. */
  graded: boolean
  /** What `targetId` means here. */
  target: 'deck' | 'spelling-list' | 'typing-lesson'
}

export const ASSIGNABLE: AssignableActivity[] = [
  ...MODES.map((m) => ({
    subject: 'quiz' as const,
    activity: m.id as string,
    name: m.name,
    emoji: m.emoji,
    graded: m.isTest,
    target: 'deck' as const,
  })),
  ...ACTIVITIES.map((a) => ({
    subject: 'spelling' as const,
    activity: a.id as string,
    name: a.name,
    emoji: a.emoji,
    graded: a.isTest,
    target: 'spelling-list' as const,
  })),
  {
    subject: 'typing',
    activity: 'lesson',
    name: 'Typing lesson',
    emoji: '⌨️',
    graded: true,
    target: 'typing-lesson',
  },
]

export function assignableFor(
  subject: Subject,
  activity: string,
): AssignableActivity | undefined {
  return ASSIGNABLE.find((a) => a.subject === subject && a.activity === activity)
}

/** The human name of whatever the task points at. */
export function targetName(assignment: Assignment, deckTitles: Map<string, string>): string {
  const { subject, targetId } = assignment
  if (!targetId) return 'whatever is due'
  if (subject === 'quiz') return deckTitles.get(targetId) ?? 'a deck that has been deleted'
  if (subject === 'spelling') {
    for (const grade of GRADES) {
      const list = grade.lists.find((l) => l.id === targetId)
      if (list) return list.title
    }
    return 'a word list'
  }
  return CURRICULUM.find((l) => l.id === targetId)?.title ?? 'a lesson'
}

/**
 * Where "Start" goes.
 *
 * Null when the task cannot be started as written — a deck deleted since it was
 * set, say. The caller says so plainly rather than navigating somewhere
 * confusing.
 */
export function routeForAssignment(assignment: Assignment): Route | null {
  const { subject, activity, targetId, size } = assignment

  if (subject === 'quiz') {
    const mode = MODES.find((m) => m.id === activity)
    if (!mode) return null
    return {
      name: 'quiz-play',
      mode: mode.id as StudyMode,
      deckId: targetId ?? undefined,
      size: size ?? undefined,
    }
  }

  if (subject === 'spelling') {
    const known = ACTIVITIES.find((a) => a.id === activity)
    if (!known) return null
    return {
      name: 'spell-play',
      activity: known.id as ActivityId,
      // A task pinned to a list plays that list; one without plays the adaptive
      // mix, which is what "just do some spelling" means.
      mode: targetId ? 'list' : 'adaptive',
      listId: targetId ?? undefined,
      size: size ?? undefined,
    }
  }

  if (subject === 'typing' && targetId) return { name: 'lesson', id: targetId }
  return null
}
