import { useState } from 'react'
import MasteryBar from '../../components/suite/MasteryBar'
import ScreenHeader from '../../components/suite/ScreenHeader'
import { Button, Card, Pill, StarRow } from '../../components/ui'
import { GRADES } from '../../data/spelling'
import { masteryBand } from '../../lib/adaptive'
import { useProgress } from '../../lib/progress/ProgressProvider'
import { ACTIVITIES } from '../../lib/spelling/activities'
import { listBreakdown } from '../../lib/spelling/stats'
import { listKey, masteryKey } from '../../lib/progress/types'
import type { Navigate } from '../../routes'

const BAND_STYLE: Record<string, string> = {
  mastered: 'bg-emerald-100 text-emerald-700',
  practiced: 'bg-sky-100 text-sky-700',
  learning: 'bg-amber-100 text-amber-700',
  new: 'bg-slate-100 text-slate-400',
}

export default function SpellingLists({ navigate }: { navigate: Navigate }) {
  const { snapshot, skill } = useProgress()
  const state = skill('spelling')
  const [openGrade, setOpenGrade] = useState<number>(GRADES[state.levelIndex]?.grade ?? 2)
  const [openList, setOpenList] = useState<string | null>(null)

  return (
    <div className="mx-auto w-full max-w-4xl py-4">
      <ScreenHeader
        title="Word Lists 📚"
        subtitle="Pick any list to study — nothing here is locked."
        onBack={() => navigate({ name: 'spelling' })}
        right={
          <Button variant="secondary" onClick={() => navigate({ name: 'custom-lists' })}>
            ✏️ My lists
          </Button>
        }
      />

      <div className="space-y-4">
        {GRADES.map((g) => {
          const open = openGrade === g.grade
          return (
            <div key={g.grade} className={`rounded-3xl bg-gradient-to-r ${g.color} p-1 shadow`}>
              <div className="rounded-[22px] bg-white/92">
                <button
                  onClick={() => setOpenGrade(open ? -1 : g.grade)}
                  className="flex w-full items-center gap-3 p-5 text-left"
                >
                  <span className="text-3xl">{g.emoji}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xl font-extrabold text-grape">
                      Grade {g.grade} · {g.name}
                    </span>
                    <span className="block truncate font-bold text-slate-500">{g.blurb}</span>
                  </span>
                  {state.levelIndex === GRADES.indexOf(g) && (
                    <Pill className="bg-purple-100 text-grape">You are here</Pill>
                  )}
                  <span className="text-2xl text-slate-300">{open ? '▾' : '▸'}</span>
                </button>

                {open && (
                  <div className="space-y-3 px-5 pb-5">
                    {g.lists.map((list) => {
                      const b = listBreakdown(snapshot, list.id)
                      const progress = snapshot.lists[listKey('spelling', list.id)]
                      const expanded = openList === list.id
                      return (
                        <div key={list.id} className="rounded-2xl bg-white p-4 ring-1 ring-purple-100">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-lg font-extrabold text-grape">{list.title}</h3>
                              <p className="text-sm font-bold text-slate-500">{list.focus}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              {progress?.stars ? <StarRow stars={progress.stars} size={18} /> : null}
                              <button
                                onClick={() => setOpenList(expanded ? null : list.id)}
                                className="rounded-full bg-purple-50 px-3 py-1 text-xs font-extrabold text-grape"
                              >
                                {expanded ? 'Hide words' : `${b.total} words`}
                              </button>
                            </div>
                          </div>

                          <MasteryBar
                            className="mt-3"
                            total={b.total}
                            mastered={b.mastered}
                            practiced={b.practiced}
                            learning={b.learning}
                          />

                          {expanded && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {list.words.map((entry) => {
                                const band = masteryBand(
                                  snapshot.mastery[masteryKey('spelling', entry.w)],
                                )
                                return (
                                  <span
                                    key={entry.w}
                                    title={entry.s}
                                    className={`rounded-lg px-2.5 py-1 font-mono text-sm font-bold ${BAND_STYLE[band]}`}
                                  >
                                    {entry.w}
                                  </span>
                                )
                              })}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-2">
                            {ACTIVITIES.map((a) => (
                              <button
                                key={a.id}
                                onClick={() =>
                                  navigate({
                                    name: 'spell-play',
                                    activity: a.id,
                                    mode: 'list',
                                    listId: list.id,
                                  })
                                }
                                className="rounded-xl bg-purple-50 px-3 py-2 text-sm font-extrabold text-grape transition-colors hover:bg-purple-100"
                              >
                                {a.emoji} {a.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {snapshot.customLists.length > 0 && (
        <Card className="mt-5">
          <h2 className="mb-3 text-xl font-extrabold text-grape">Your own lists ✏️</h2>
          <div className="space-y-2">
            {snapshot.customLists.map((l) => (
              <div
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white p-3 ring-1 ring-purple-100"
              >
                <div>
                  <p className="font-extrabold text-grape">{l.title}</p>
                  <p className="text-sm font-bold text-slate-400">{l.words.length} words</p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    navigate({
                      name: 'spell-play',
                      activity: 'listen-spell',
                      mode: 'custom',
                      customListId: l.id,
                    })
                  }
                >
                  🎧 Practise
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
