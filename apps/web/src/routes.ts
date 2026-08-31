import type { DirectionSetting, StudyMode } from './lib/quiz/session'
import type { ActivityId } from './lib/spelling/activities'
import type { SessionMode } from './lib/spelling/session'

/**
 * Every screen in the suite.
 *
 * Screens name where they are going rather than writing a URL: this union is
 * what `navigate` takes, and `paths.ts` turns each one into the address React
 * Router puts in the bar. Keeping the two apart means a call site cannot
 * misspell a path, and a path can be renamed without touching a screen.
 */
export type Route =
  // Signed out: the only two screens a visitor can reach.
  /** The marketing site — what this is, how it works, what it costs. */
  | { name: 'marketing' }
  | { name: 'auth' }
  // Suite
  | { name: 'home' }
  | { name: 'account' }
  | { name: 'family' }
  | { name: 'upgrade' }
  | { name: 'progress' }
  | { name: 'custom-lists' }
  /** The learner's task list — what a grown-up has set them. */
  | { name: 'tasks' }
  /** A grown-up's own decks and lists, and the work they have set. */
  | { name: 'library' }
  /** Hand over a document; get practice material back. */
  | { name: 'content-new' }
  /** "Pick your world" — the ten themes. Display only; changes nothing learned. */
  | { name: 'theme' }
  /** The collectibles earned so far, in whichever shape the theme uses. */
  | { name: 'world' }
  // Typing
  | { name: 'typing' }
  | { name: 'map' }
  | { name: 'lesson'; id: string }
  | { name: 'practice' }
  | { name: 'rain' }
  | { name: 'trophies' }
  | { name: 'settings' }
  // Spelling
  | { name: 'spelling' }
  | { name: 'spell-lists' }
  | {
      name: 'spell-play'
      activity: ActivityId
      mode: SessionMode
      listId?: string
      customListId?: string
      size?: number
    }
  // Quiz
  | { name: 'quiz' }
  | { name: 'quiz-deck'; deckId: string }
  /** No deckId means "start a new deck". */
  | { name: 'quiz-edit'; deckId?: string }
  | {
      name: 'quiz-play'
      mode: StudyMode
      /** Absent in review mode, which draws from every deck at once. */
      deckId?: string
      size?: number
      direction?: DirectionSetting
    }

export type Navigate = (route: Route) => void
