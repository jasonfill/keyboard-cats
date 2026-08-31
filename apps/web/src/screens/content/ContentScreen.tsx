// Turning a document into practice material.
//
// One screen rather than three, because it is one task: a parent hands over the
// thing they already have and waits. Splitting it into pages would make the
// waiting feel like a place they had been sent rather than something happening.
//
// The rule the whole flow is built around: **nothing is spent without being
// shown first.** The link is registered, the cost comes back, and only an
// explicit tap starts the run.

import { useCallback, useEffect, useRef, useState } from 'react'
import ScreenHeader from '../../components/suite/ScreenHeader'
import { Button, Card, Pill } from '../../components/ui'
import type { Route } from '../../routes'
import {
  addLink,
  contentStatus,
  estimateFor,
  isFinished,
  jobStatus,
  pollDelay,
  startBuild,
  type ContentStatus,
  type EstimateView,
  type JobView,
} from '../../lib/content/api'

type Phase = 'idle' | 'registering' | 'quoted' | 'running' | 'finished'

export default function ContentScreen({ navigate }: { navigate: (r: Route) => void }) {
  const [status, setStatus] = useState<ContentStatus | null>(null)
  const [url, setUrl] = useState('')
  const [noRush, setNoRush] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [sourceId, setSourceId] = useState<string | null>(null)
  const [quote, setQuote] = useState<EstimateView | null>(null)
  const [job, setJob] = useState<JobView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    contentStatus(controller.signal).then(setStatus).catch(() => setStatus({ enabled: false, balance: null }))
    return () => controller.abort()
  }, [])

  // Stop polling when the screen goes away. A poll loop that outlives its
  // screen is a request every eight seconds forever.
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const watch = useCallback((jobId: string, attempt = 0) => {
    timer.current = window.setTimeout(() => {
      jobStatus(jobId)
        .then(({ job: next }) => {
          setJob(next)
          if (isFinished(next)) setPhase('finished')
          else watch(jobId, attempt + 1)
        })
        .catch(() => watch(jobId, attempt + 1))
    }, pollDelay(attempt))
  }, [])

  const submit = useCallback(async () => {
    setError(null)
    setPhase('registering')
    try {
      const { sourceId: id } = await addLink(url.trim())
      setSourceId(id)
      // The cost, before anything is spent on it.
      setQuote(await estimateFor(id, noRush))
      setPhase('quoted')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work.')
      setPhase('idle')
    }
  }, [url, noRush])

  const run = useCallback(async () => {
    if (!sourceId) return
    setError(null)
    setPhase('running')
    try {
      const { job: started } = await startBuild(sourceId, { noRush })
      setJob(started)
      watch(started.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not start.')
      setPhase('quoted')
    }
  }, [sourceId, noRush, watch])

  if (status && !status.enabled) {
    return (
      <div>
        <ScreenHeader title="Add a document" onBack={() => navigate({ name: 'library' })} />
        <Card>
          <p className="font-bold text-body">
            Turning documents into practice material is not switched on here yet.
          </p>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <ScreenHeader title="Add a document" onBack={() => navigate({ name: 'library' })} />

      {status?.balance && (
        <p className="mb-3 text-sm font-bold text-stone">
          {status.balance.total} credit{status.balance.total === 1 ? '' : 's'} left. One credit is
          about one page.
        </p>
      )}

      {phase === 'idle' || phase === 'registering' ? (
        <Card className="mb-4">
          <label className="mb-1 block text-sm font-bold text-muted" htmlFor="content-url">
            Paste a link
          </label>
          <input
            id="content-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/document/d/…"
            className="mb-3 w-full rounded-xl border-2 border-edge px-4 py-3 font-bold text-ink focus:border-ink focus:outline-none"
          />
          <label className="mb-3 flex items-center gap-2 text-sm font-bold text-body">
            <input type="checkbox" checked={noRush} onChange={(e) => setNoRush(e.target.checked)} />
            No rush — half the credits, ready within a day
          </label>
          <Button onClick={submit} disabled={!url.trim() || phase === 'registering'}>
            {phase === 'registering' ? 'Looking at it…' : 'See what it would cost'}
          </Button>
        </Card>
      ) : null}

      {/* The cost, before anything has been spent on it. This screen exists so
          that a parent chooses to spend the credits rather than discovering
          that they did. */}
      {phase === 'quoted' && quote && (
        <Card className="mb-4">
          <p className="mb-1 text-xl font-extrabold text-ink">
            {quote.estimate.pages} page{quote.estimate.pages === 1 ? '' : 's'}, about{' '}
            {quote.estimate.credits} credit{quote.estimate.credits === 1 ? '' : 's'}
          </p>
          <p className="mb-3 text-sm font-bold text-stone">
            You have {quote.balance.total}.
          </p>
          {quote.allowed ? (
            <Button onClick={run}>Make the cards</Button>
          ) : (
            <p className="font-bold text-rose-600">{quote.reason}</p>
          )}
        </Card>
      )}

      {(phase === 'running' || phase === 'finished') && job && (
        <Card className="mb-4">
          <p className="text-xl font-extrabold text-ink">{job.stage}</p>
          {phase === 'running' && (
            <p className="mt-1 text-sm font-bold text-stone">
              This takes a minute or two. You can leave this page — it keeps going.
            </p>
          )}
          {job.status === 'done' && (
            <div className="mt-3">
              <Pill className="bg-quiet text-body">
                {job.result?.setsLanded ?? 0} set{job.result?.setsLanded === 1 ? '' : 's'} ready
              </Pill>
              <p className="mt-3 mb-3 text-sm font-bold text-stone">
                Look them over before setting them as work — they are drafts until you do.
              </p>
              <Button onClick={() => navigate({ name: 'library' })}>Go and look</Button>
            </div>
          )}
          {job.status === 'failed' && (
            <p className="mt-2 font-bold text-rose-600">{job.error ?? 'That did not finish.'}</p>
          )}
        </Card>
      )}

      {error && <p className="font-bold text-rose-600">{error}</p>}
    </div>
  )
}
