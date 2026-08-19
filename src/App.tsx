import { useEffect, useState } from 'react'
import { AuthProvider } from './auth/AuthProvider'
import AuthScreen from './auth/AuthScreen'
import Background from './components/Background'
import CatMascot from './components/CatMascot'
import { useGameState } from './hooks/useGameState'
import { ProgressProvider, useProgress } from './lib/progress/ProgressProvider'
import { setSoundEnabled } from './lib/sound'
import type { Navigate, Route } from './routes'
import CatRainScreen from './screens/CatRainScreen'
import LessonScreen from './screens/LessonScreen'
import PracticeScreen from './screens/PracticeScreen'
import SettingsScreen from './screens/SettingsScreen'
import SpellingHome from './screens/spelling/SpellingHome'
import SpellingLists from './screens/spelling/SpellingLists'
import SpellingPlay from './screens/spelling/SpellingPlay'
import AccountScreen from './screens/suite/AccountScreen'
import CustomListsScreen from './screens/suite/CustomListsScreen'
import ProgressScreen from './screens/suite/ProgressScreen'
import SuiteHome from './screens/suite/SuiteHome'
import UpgradeScreen from './screens/suite/UpgradeScreen'
import TypingHome from './screens/TypingHome'
import TrophyRoom from './screens/TrophyRoom'
import WorldMap from './screens/WorldMap'

export type { Route } from './routes'

export default function App() {
  return (
    <AuthProvider>
      <ProgressProvider>
        <Background />
        <main className="min-h-full px-3 pb-10 pt-4 md:px-6">
          <Router />
        </main>
      </ProgressProvider>
    </AuthProvider>
  )
}

function Router() {
  const game = useGameState()
  const { ready } = useProgress()
  const [route, setRoute] = useState<Route>({ name: 'home' })

  // Keep the sound engine in sync with the saved setting.
  useEffect(() => {
    setSoundEnabled(game.state.settings.sound)
  }, [game.state.settings.sound])

  const navigate: Navigate = (r) => {
    setRoute(r)
    // Scroll back to top on navigation for small screens.
    window.scrollTo({ top: 0 })
  }

  if (!ready) return <Loading />

  switch (route.name) {
    // Suite
    case 'home':
      return <SuiteHome game={game} navigate={navigate} />
    case 'auth':
      return (
        <AuthScreen
          onDone={() => navigate({ name: 'home' })}
          onGuest={() => navigate({ name: 'home' })}
        />
      )
    case 'account':
      return <AccountScreen navigate={navigate} />
    case 'upgrade':
      return <UpgradeScreen navigate={navigate} />
    case 'progress':
      return <ProgressScreen game={game} navigate={navigate} />
    case 'custom-lists':
      return <CustomListsScreen navigate={navigate} />

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
  }
}

function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <CatMascot mood="sleepy" size={120} className="animate-floaty" />
      <p className="text-lg font-bold text-slate-500">Fetching your progress…</p>
    </div>
  )
}
