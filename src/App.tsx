import { useEffect, useState } from 'react'
import { useGameState } from './hooks/useGameState'
import { setSoundEnabled } from './lib/sound'
import Background from './components/Background'
import HomeScreen from './screens/HomeScreen'
import WorldMap from './screens/WorldMap'
import LessonScreen from './screens/LessonScreen'
import PracticeScreen from './screens/PracticeScreen'
import CatRainScreen from './screens/CatRainScreen'
import TrophyRoom from './screens/TrophyRoom'
import SettingsScreen from './screens/SettingsScreen'

export type Route =
  | { name: 'home' }
  | { name: 'map' }
  | { name: 'lesson'; id: string }
  | { name: 'practice' }
  | { name: 'rain' }
  | { name: 'trophies' }
  | { name: 'settings' }

export default function App() {
  const game = useGameState()
  const [route, setRoute] = useState<Route>({ name: 'home' })

  // Keep the sound engine in sync with the saved setting.
  useEffect(() => {
    setSoundEnabled(game.state.settings.sound)
  }, [game.state.settings.sound])

  const navigate = (r: Route) => {
    setRoute(r)
    // Scroll back to top on navigation for small screens.
    window.scrollTo({ top: 0 })
  }

  return (
    <>
      <Background />
      <main className="min-h-full px-3 pb-10 pt-4 md:px-6">
        {route.name === 'home' && <HomeScreen game={game} navigate={navigate} />}
        {route.name === 'map' && <WorldMap game={game} navigate={navigate} />}
        {route.name === 'lesson' && (
          <LessonScreen game={game} lessonId={route.id} navigate={navigate} />
        )}
        {route.name === 'practice' && <PracticeScreen game={game} navigate={navigate} />}
        {route.name === 'rain' && <CatRainScreen game={game} navigate={navigate} />}
        {route.name === 'trophies' && <TrophyRoom game={game} navigate={navigate} />}
        {route.name === 'settings' && <SettingsScreen game={game} navigate={navigate} />}
      </main>
    </>
  )
}
