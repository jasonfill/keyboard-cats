import type { GameApi } from '../hooks/useGameState'
import { WORLDS, CURRICULUM } from '../data/lessons'
import { Button, StarRow } from '../components/ui'
import CatPhoto from '../components/CatPhoto'
import type { Route } from '../App'

interface Props {
  game: GameApi
  navigate: (r: Route) => void
}

export default function WorldMap({ game, navigate }: Props) {
  const { state } = game

  // A lesson is unlocked if it's the first, or the previous one has been played.
  const isUnlocked = (globalIndex: number): boolean => {
    if (globalIndex === 0) return true
    const prev = CURRICULUM[globalIndex - 1]
    return (state.lessons[prev.id]?.plays ?? 0) > 0
  }

  return (
    <div className="mx-auto w-full max-w-4xl py-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-grape">Choose a Level 🗺️</h1>
        <Button variant="ghost" onClick={() => navigate({ name: 'typing' })}>
          ← Home
        </Button>
      </div>

      <div className="space-y-6">
        {WORLDS.map((world) => (
          <div
            key={world.id}
            className={`rounded-3xl bg-gradient-to-r ${world.color} p-1 shadow-lg`}
          >
            <div className="rounded-[22px] bg-white/90 p-5">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-3xl">{world.emoji}</span>
                <div>
                  <h2 className="text-xl font-extrabold text-slate-700">{world.name}</h2>
                  <p className="text-sm text-slate-500">{world.blurb}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {world.lessons.map((lesson) => {
                  const c = CURRICULUM.find((x) => x.id === lesson.id)!
                  const unlocked = isUnlocked(c.index)
                  const progress = state.lessons[lesson.id]
                  return (
                    <button
                      key={lesson.id}
                      disabled={!unlocked}
                      onClick={() => navigate({ name: 'lesson', id: lesson.id })}
                      className={`group flex items-center gap-3 rounded-2xl p-3 text-left transition-all ${
                        unlocked
                          ? 'bg-white shadow ring-1 ring-purple-100 hover:-translate-y-0.5 hover:shadow-md'
                          : 'cursor-not-allowed bg-slate-100 opacity-70'
                      }`}
                    >
                      <div className="relative h-14 w-14 shrink-0">
                        {unlocked ? (
                          <CatPhoto seed={lesson.catSeed} className="h-14 w-14" rounded="rounded-xl" />
                        ) : (
                          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-slate-200 text-2xl">
                            🔒
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-extrabold text-slate-700">
                          {lesson.title}
                        </div>
                        <div className="truncate text-xs text-slate-400">{lesson.blurb}</div>
                        <div className="mt-1">
                          <StarRow stars={progress?.stars ?? 0} size={16} />
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
