// Handing over a document.
//
// The property every test here defends: **nothing is spent without being shown
// first.** Registering a link asks what it would cost; only an explicit tap
// starts the run. A screen that quietly began the job on submit would be the
// same feature and a much worse product.

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const contentApi = vi.hoisted(() => ({
  contentStatus: vi.fn(),
  addLink: vi.fn(),
  estimateFor: vi.fn(),
  startBuild: vi.fn(),
  jobStatus: vi.fn(),
  acceptDeck: vi.fn(),
}))

vi.mock('../../lib/content/api', async () => {
  const real = await vi.importActual<typeof import('../../lib/content/api')>(
    '../../lib/content/api',
  )
  return { ...real, ...contentApi }
})

import ContentScreen from './ContentScreen'

const navigate = vi.fn()

const job = (over: Record<string, unknown> = {}) => ({
  id: 'j1',
  status: 'queued',
  stage: 'Waiting to start',
  error: null,
  result: null,
  ...over,
})

beforeEach(() => {
  navigate.mockClear()
  for (const fn of Object.values(contentApi)) fn.mockReset()
  contentApi.contentStatus.mockResolvedValue({
    enabled: true,
    balance: { included: 30, purchased: 0, total: 30 },
  })
  contentApi.addLink.mockResolvedValue({ sourceId: 's1', job: job() })
  contentApi.estimateFor.mockResolvedValue({
    estimate: { pages: 24, credits: 24, noRush: false },
    balance: { included: 30, purchased: 0, total: 30 },
    allowed: true,
    reason: null,
  })
  contentApi.startBuild.mockResolvedValue({ job: job({ status: 'reading', stage: 'Reading the document' }) })
  contentApi.jobStatus.mockResolvedValue({
    job: job({ status: 'done', stage: 'Ready to look over', result: { setsLanded: 3 } }),
  })
})

describe('when the feature is not switched on', () => {
  it('says so instead of offering something that cannot work', async () => {
    contentApi.contentStatus.mockResolvedValue({ enabled: false, balance: null })
    render(<ContentScreen navigate={navigate} />)
    expect(await screen.findByText(/not switched on here/i)).toBeTruthy()
  })
})

describe('asking what it would cost', () => {
  it('shows the balance before anything is typed', async () => {
    render(<ContentScreen navigate={navigate} />)
    expect(await screen.findByText(/30 credits left/i)).toBeTruthy()
  })

  it('will not submit an empty link', async () => {
    render(<ContentScreen navigate={navigate} />)
    await screen.findByLabelText(/Paste a link/i)
    expect(screen.getByText(/See what it would cost/i).closest('button')!.disabled).toBe(true)
  })

  it('quotes the cost without starting anything', async () => {
    // The whole reason the estimate is its own call.
    render(<ContentScreen navigate={navigate} />)
    fireEvent.change(await screen.findByLabelText(/Paste a link/i), {
      target: { value: 'https://docs.google.com/document/d/abc/edit' },
    })
    fireEvent.click(screen.getByText(/See what it would cost/i))

    expect(await screen.findByText(/24 pages, about 24 credits/i)).toBeTruthy()
    expect(contentApi.startBuild).not.toHaveBeenCalled()
  })

  it('says why not when it cannot be afforded, and offers no way to start', async () => {
    contentApi.estimateFor.mockResolvedValue({
      estimate: { pages: 60, credits: 60, noRush: false },
      balance: { included: 5, purchased: 0, total: 5 },
      allowed: false,
      reason: 'This needs 60 credits and there are 5 left.',
    })
    render(<ContentScreen navigate={navigate} />)
    fireEvent.change(await screen.findByLabelText(/Paste a link/i), {
      target: { value: 'https://example.com/a.pdf' },
    })
    fireEvent.click(screen.getByText(/See what it would cost/i))

    expect(await screen.findByText(/60 credits and there are 5 left/)).toBeTruthy()
    expect(screen.queryByText(/Make the cards/i)).toBeNull()
  })

  it('surfaces a refused link rather than failing silently', async () => {
    contentApi.addLink.mockRejectedValue(new Error('Links have to start with https://'))
    render(<ContentScreen navigate={navigate} />)
    fireEvent.change(await screen.findByLabelText(/Paste a link/i), {
      target: { value: 'http://example.com' },
    })
    fireEvent.click(screen.getByText(/See what it would cost/i))
    expect(await screen.findByText(/have to start with https/i)).toBeTruthy()
  })

  it('asks for the half-price quote when no rush is chosen', async () => {
    render(<ContentScreen navigate={navigate} />)
    fireEvent.click(await screen.findByLabelText(/No rush/i))
    fireEvent.change(screen.getByLabelText(/Paste a link/i), {
      target: { value: 'https://example.com/a.pdf' },
    })
    fireEvent.click(screen.getByText(/See what it would cost/i))
    await waitFor(() => expect(contentApi.estimateFor).toHaveBeenCalledWith('s1', true))
  })
})

describe('running it', () => {
  async function quoteThenRun() {
    render(<ContentScreen navigate={navigate} />)
    fireEvent.change(await screen.findByLabelText(/Paste a link/i), {
      target: { value: 'https://example.com/a.pdf' },
    })
    fireEvent.click(screen.getByText(/See what it would cost/i))
    fireEvent.click(await screen.findByText(/Make the cards/i))
  }

  it('starts only when told to', async () => {
    await quoteThenRun()
    await waitFor(() => expect(contentApi.startBuild).toHaveBeenCalledOnce())
  })

  it('says what it is doing, in words', async () => {
    await quoteThenRun()
    expect(await screen.findByText('Reading the document')).toBeTruthy()
  })

  it('says the run survives leaving the page', async () => {
    await quoteThenRun()
    expect(await screen.findByText(/keeps going/i)).toBeTruthy()
  })

  it('reports what landed, and that it is a draft', async () => {
    await quoteThenRun()
    expect(await screen.findByText(/3 sets ready/i)).toBeTruthy()
    // A parent must not set a draft as work believing somebody checked it.
    expect(screen.getByText(/drafts until you do/i)).toBeTruthy()
  })

  it('shows a failure in words rather than leaving a spinner', async () => {
    contentApi.jobStatus.mockResolvedValue({
      job: job({
        status: 'failed',
        stage: 'Could not finish',
        error: 'We could not read that document.',
      }),
    })
    await quoteThenRun()
    expect(await screen.findByText(/could not read that document/i)).toBeTruthy()
  })

  it('keeps the quote on screen when starting fails', async () => {
    contentApi.startBuild.mockRejectedValue(new Error('Out of credits'))
    await quoteThenRun()
    expect(await screen.findByText(/Out of credits/)).toBeTruthy()
    expect(screen.getByText(/Make the cards/i)).toBeTruthy()
  })
})
