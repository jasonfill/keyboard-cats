import type { DirectionSetting, StudyMode } from './lib/quiz/session'
import type { ActivityId } from './lib/spelling/activities'
import type { SessionMode } from './lib/spelling/session'

/**
 * Every screen in the suite. The app is a single page with hand-rolled routing;
 * there is no URL router because the whole thing is one continuous session and
 * deep links to a half-finished spelling test would not be useful.
 */
export type Route =
  // Suite
  | { name: 'home' }
  | { name: 'auth' }
  | { name: 'account' }
  | { name: 'family' }
  | { name: 'upgrade' }
  | { name: 'progress' }
  | { name: 'custom-lists' }
  /** The learner's task list — what a grown-up has set them. */
  | { name: 'tasks' }
  /** A grown-up's own decks and lists, and the work they have set. */
  | { name: 'library' }
  /** "Pick your world" — the ten themes. Display only; changes nothing learned. */
  | { name: 'theme' }
  /** The collectibles earned so far, in whichever shape the theme uses. */
  | { name: 'world' }
  // Typing (Keyboard Cats)
  | { name: 'typing' }
  | { name: 'map' }
  | { name: 'lesson'; id: string }
  | { name: 'practice' }
  | { name: 'rain' }
  | { name: 'trophies' }
  | { name: 'settings' }
  // Spelling (Spelling Cats)
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
  // Quiz (Quiz Cats)
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
