import { useMemo, useState } from 'react'
import type { GameApi, LessonOutcome } from '../hooks/useGameState'
import { CURRICULUM, getLesson } from '../data/lessons'
import { generateLessonText } from '../lib/content'
import type { RoundResult } from '../lib/stats'
import GamePlay from '../components/GamePlay'
import ResultsCard from '../components/ResultsCard'
import { Button, Card } from '../components/ui'
import type { Route } from '../App'

interface Props {
  game: GameApi
  lessonId: string
  navigate: (r: Route) => void
}

export default function LessonScreen({ game, lessonId, navigate }: Props) {
  const lesson = getLesson(lessonId)
  const [attempt, setAttempt] = useState(0)
  const [outcome, setOutcome] = useState<LessonOutcome | null>(null)

  // Regenerate text each attempt so replays feel fresh (attempt bumps the memo).
  const text = useMemo(() => {
    void attempt
    return lesson ? generateLessonText(lesson) : ''
  }, [lesson, attempt])

  if (!lesson) {
    return (
      <Card className="mx-auto max-w-md text-center">
        <p className="mb-4 font-bold">Hmm, that lesson wandered off. 🐈</p>
        <Button onClick={() => navigate({ name: 'map' })}>Back to Levels</Button>
      </Card>
    )
  }

  const handleFinish = (result: RoundResult) => {
    const o = game.recordLesson(lesson.id, result, lesson.catSeed)
    setOutcome(o)
  }

  const nextLesson = CURRICULUM[lesson.index + 1]

  if (outcome) {
    return (
      <div className="py-6">
        <ResultsCard
          result={outcome}
          stars={outcome.stars}
          title={lesson.title}
          newAchievements={outcome.newAchievements}
          collectedCat={outcome.collectedCat}
          soundOn={game.state.settings.sound}
          onReplay={() => {
            setOutcome(null)
            setAttempt((a) => a + 1)
          }}
          onNext={
            nextLesson
              ? () => {
                  setOutcome(null)
                  setAttempt(0)
                  navigate({ name: 'lesson', id: nextLesson.id })
                }
              : undefined
          }
          onMenu={() => navigate({ name: 'map' })}
        />
      </div>
    )
  }

  return (
    <div className="py-4">
      <GamePlay
        key={attempt}
        text={text}
        title={`${lesson.worldEmoji} ${lesson.title}`}
        subtitle={lesson.blurb}
        showKeyboard={game.state.settings.showKeyboard}
        showHands={game.state.settings.showHands}
        sound={game.state.settings.sound}
        onFinish={handleFinish}
        onQuit={() => navigate({ name: 'map' })}
      />
    </div>
  )
}
