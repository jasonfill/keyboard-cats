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
  | { name: 'upgrade' }
  | { name: 'progress' }
  | { name: 'custom-lists' }
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

export type Navigate = (route: Route) => void
