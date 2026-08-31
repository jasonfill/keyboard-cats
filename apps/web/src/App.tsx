import { useEffect, useRef, useState } from 'react'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import AuthScreen from './auth/AuthScreen'
import Background from './components/Background'
import Mascot from './components/Mascot'
import { useGameState } from './hooks/useGameState'
import { LearnerProvider, useLearners } from './lib/learners/LearnerProvider'
import { ProgressProvider, useProgress } from './lib/progress/ProgressProvider'
import { ThemeProvider } from './lib/theme/ThemeProvider'
import { setSoundEnabled } from './lib/sound'
import type { Navigate, Route } from './routes'
import CatRainScreen from './screens/CatRainScreen'
import LessonScreen from './screens/LessonScreen'
import MarketingScreen from './screens/marketing/MarketingScreen'
import PracticeScreen from './screens/PracticeScreen'
import DeckEditor from './screens/quiz/DeckEditor'
import DeckScreen from './screens/quiz/DeckScreen'
import QuizHome from './screens/quiz/QuizHome'
import QuizPlay from './screens/quiz/QuizPlay'
import SettingsScreen from './screens/SettingsScreen'
import SpellingHome from './screens/spelling/SpellingHome'
import SpellingLists from './screens/spelling/SpellingLists'
import SpellingPlay from './screens/spelling/SpellingPlay'
import AccountScreen from './screens/suite/AccountScreen'
import FamilyScreen from './screens/suite/FamilyScreen'
import LibraryScreen from './screens/suite/LibraryScreen'
import TasksScreen from './screens/suite/TasksScreen'
import CustomListsScreen from './screens/suite/CustomListsScreen'
import ProgressScreen from './screens/suite/ProgressScreen'
import SuiteHome from './screens/suite/SuiteHome'
import ThemePicker from './screens/theme/ThemePicker'
import WorldScreen from './screens/theme/WorldScreen'
import UpgradeScreen from './screens/suite/UpgradeScreen'
import TypingHome from './screens/TypingHome'
import TrophyRoom from './screens/TrophyRoom'
import WorldMap from './screens/WorldMap'

export type { Route } from './routes'

export default function App() {
  return (
    <AuthProvider>
      <LearnerProvider>
        {/* Above progress, below learners: the theme is chosen per learner, so
            it has to see who is active, and everything below it paints in the
            colour it publishes. */}
        <ThemeProvider>
          <ProgressProvider>
            <Background />
            <main className="min-h-full px-3 pb-10 pt-4 md:px-6">
              <Router />
            </main>
          </ProgressProvider>
        </ThemeProvider>
      </LearnerProvider>
    </AuthProvider>
  )
}

function Router() {
  const game = useGameState()
  const { ready } = useProgress()
  const { status: authStatus, configured } = useAuth()
  const { learners, status: learnerStatus } = useLearners()
  const [route, setRoute] = useState<Route>({ name: 'home' })
  const sentToSetup = useRef(false)

  // Keep the sound engine in sync with the saved setting.
  useEffect(() => {
    setSoundEnabled(game.state.settings.sound)
  }, [game.state.settings.sound])

  // A newly signed-up grown-up owns no learners yet, and `home` is the *child's*
  // screen — dropping them there makes the account look like a student account
  // and quietly saves their practice to localStorage, because there is no
  // learner to attribute it to. Send them to set one up first.
  //
  // Once only: if they deliberately navigate away without adding anyone, that is
  // their choice and bouncing them back would trap them.
  useEffect(() => {
    if (authStatus !== 'signed-in') {
      sentToSetup.current = false
      return
    }
    if (learnerStatus !== 'ready' || learners.length > 0 || sentToSetup.current) return
    sentToSetup.current = true
    setRoute({ name: 'family' })
  }, [authStatus, learnerStatus, learners.length])

  const navigate: Navigate = (r) => {
    setRoute(r)
    // Scroll back to top on navigation for small screens.
    window.scrollTo({ top: 0 })
  }

  // Nothing in the app is reachable while signed out. Practice only means
  // something when it is attributed to a learner — the level, the review
  // schedule and the report all hang off that one record — so a visitor gets
  // the marketing site and a door, not a round of spelling that lands nowhere.
  //
  // The exception is a build with no Supabase behind it, where signing in is
  // impossible: gating there would leave a developer with a locked door and no
  // key. Every deployed build is configured, so this is a local-only path.
  if (authStatus === 'loading') return <Loading />
  if (authStatus !== 'signed-in' && configured) {
    return route.name === 'auth' ? (
      <AuthScreen
        onDone={() => navigate({ name: 'home' })}
        onBack={() => navigate({ name: 'marketing' })}
      />
    ) : (
      <MarketingScreen navigate={navigate} />
    )
  }

  if (!ready) return <Loading />

  switch (route.name) {
    // Suite.
    //
    // `marketing` lands here too: signing in elsewhere — another tab, a
    // restored session — can leave a grown-up standing on that route, and
    // their home is the app.
    case 'marketing':
    case 'home':
      return <SuiteHome game={game} navigate={navigate} />
    case 'auth':
      return (
        <AuthScreen
          onDone={() => navigate({ name: 'home' })}
          onBack={() => navigate({ name: 'home' })}
        />
      )
    case 'family':
      return <FamilyScreen navigate={navigate} />
    case 'account':
      return <AccountScreen navigate={navigate} />
    case 'upgrade':
      return <UpgradeScreen navigate={navigate} />
    case 'progress':
      return <ProgressScreen game={game} navigate={navigate} />
    case 'custom-lists':
      return <CustomListsScreen navigate={navigate} />
    case 'tasks':
      return <TasksScreen navigate={navigate} />
    case 'library':
      return <LibraryScreen navigate={navigate} />
    case 'theme':
      return <ThemePicker navigate={navigate} />
    case 'world':
      return <WorldScreen navigate={navigate} />

    // Typing
    case 'typing':
      return <TypingHome game={game} navigate={navigate} />
    case 'map':
      return <WorldMap game={game} navigate={navigate} />
    case 'lesson':
      return <LessonScreen game={game} lessonId={route.id} navigate={navigate} />
    case 'practice':
      return <PracticeScreen game={game} navigate={navigate} />
    case 'rain':
      return <CatRainScreen game={game} navigate={navigate} />
    case 'trophies':
      return <TrophyRoom game={game} navigate={navigate} />
    case 'settings':
      return <SettingsScreen game={game} navigate={navigate} />

    // Spelling
    case 'spelling':
      return <SpellingHome navigate={navigate} />
    case 'spell-lists':
      return <SpellingLists navigate={navigate} />
    case 'spell-play':
      return (
        <SpellingPlay
          // Remounting on a parameter change guarantees a fresh round rather
          // than a half-played one inheriting the previous plan.
          key={`${route.activity}:${route.mode}:${route.listId ?? route.customListId ?? 'adaptive'}`}
          activity={route.activity}
          mode={route.mode}
          listId={route.listId}
          customListId={route.customListId}
          size={route.size}
          navigate={navigate}
        />
      )

    // Quiz
    case 'quiz':
      return <QuizHome navigate={navigate} />
    case 'quiz-deck':
      return <DeckScreen deckId={route.deckId} navigate={navigate} />
    case 'quiz-edit':
      return <DeckEditor deckId={route.deckId} navigate={navigate} />
    case 'quiz-play':
      return (
        <QuizPlay
          // Same reasoning as spelling: a parameter change starts a fresh
          // round rather than resuming a half-played one under new rules.
          key={`${route.mode}:${route.deckId ?? 'all'}:${route.direction ?? 'term-first'}`}
          mode={route.mode}
          deckId={route.deckId}
          size={route.size}
          direction={route.direction}
          navigate={navigate}
        />
      )
  }
}

function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <Mascot mood="resting" size={120} className="animate-floaty" />
      <p className="text-lg font-bold text-muted">Fetching your progress…</p>
    </div>
  )
}
