// Talking to the model, without talking to the model.
//
// The client is injected, so every path here is exercised against a fake — and
// the paths worth exercising are the ones that go wrong quietly: a refusal that
// arrives as a success, a cache that stopped working, and the usage record
// that has to be written even when the call failed.

import { describe, expect, it, vi } from 'vitest'
import {
  buildTopic,
  cacheHealthy,
  estimateCost,
  MODEL,
  RATES,
  readSource,
  RefusedError,
  toJsonSchema,
  type CallUsage,
} from './content/model.js'
import { generatedSetSchema, sourceMapSchema } from './content/schemas.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
function fakeClient(reply: any) {
  const create = vi.fn(async (_request: any) => reply)
  return { client: { messages: { create } } as any, create }
}

/** The request the fake was handed, without a cast at every call site. */
function requestOf(create: ReturnType<typeof vi.fn>, index = 0): any {
  return create.mock.calls[index]![0]
}

function textReply(payload: unknown, over: Record<string, unknown> = {}) {
  return {
    model: MODEL,
    stop_reason: 'end_turn',
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0 },
    ...over,
  }
}

const A_MAP = {
  title: 'Chapter 7',
  subject: 'Biology',
  track: 'science.biology',
  gradeLow: 6,
  gradeHigh: 8,
  note: 'A chapter on cells.',
  topics: [{ id: 't1', title: 'Organelles', summary: 'Parts of a cell.', pages: [4, 5], estimatedCards: 12 }],
}

const A_SET = {
  title: 'Organelles',
  track: 'science.biology',
  objectives: [],
  cards: [
    {
      term: 'What makes ATP?',
      definition: 'The mitochondrion',
      hint: null,
      category: null,
      example: null,
      explanation: null,
      answerKind: 'text',
      tolerance: null,
      altAnswers: [],
      sourcePages: [4],
    },
  ],
}

describe('reading a document', () => {
  it('returns what the model said, validated', async () => {
    const { client } = fakeClient(textReply(A_MAP))
    const { map } = await readSource({ client }, 'file_1')
    expect(map.topics[0]!.title).toBe('Organelles')
  })

  it('asks the model we meant to ask', async () => {
    const { client, create } = fakeClient(textReply(A_MAP))
    await readSource({ client }, 'file_1')
    const request = requestOf(create)
    expect(request.model).toBe('claude-opus-5')
    // Adaptive thinking, never a token budget — budget_tokens is rejected on
    // this model family.
    expect(request.thinking).toEqual({ type: 'adaptive' })
    expect(request).not.toHaveProperty('budget_tokens')
  })

  it('refuses to accept a shape it did not ask for', async () => {
    const { client } = fakeClient(textReply({ nonsense: true }))
    await expect(readSource({ client }, 'f')).rejects.toThrow()
  })
})

describe('a refusal arrives as a success', () => {
  it('is turned into an error rather than an empty result', async () => {
    // HTTP 200, `stop_reason: 'refusal'`, no content. Reading `content`
    // without checking gives a confusing crash three frames from the cause.
    const { client } = fakeClient({
      model: MODEL,
      stop_reason: 'refusal',
      stop_details: { category: 'cyber' },
      content: [],
      usage: { input_tokens: 500, output_tokens: 0 },
    })
    await expect(readSource({ client }, 'f')).rejects.toBeInstanceOf(RefusedError)
  })

  it('says something a parent could read', async () => {
    const { client } = fakeClient({
      model: MODEL,
      stop_reason: 'refusal',
      content: [],
      usage: {},
    })
    await expect(readSource({ client }, 'f')).rejects.toThrow(/couldn't work with that document/)
  })

  it('still records what the refused call cost', async () => {
    const onUsage = vi.fn()
    const { client } = fakeClient({
      model: MODEL,
      stop_reason: 'refusal',
      content: [],
      usage: { input_tokens: 4000, output_tokens: 0 },
    })
    await readSource({ client, onUsage }, 'f').catch(() => {})
    expect(onUsage).toHaveBeenCalledOnce()
    expect(onUsage.mock.calls[0]![0]).toMatchObject({ ok: false, inputTokens: 4000 })
  })
})

describe('usage is recorded whatever happens', () => {
  it('records a successful call', async () => {
    const onUsage = vi.fn()
    const { client } = fakeClient(textReply(A_MAP))
    await readSource({ client, onUsage }, 'f')
    expect(onUsage).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, inputTokens: 1000 }),
      'ingest.read',
    )
  })

  it('records a call that threw before returning anything', async () => {
    // The tokens may still have been spent. A cost model built only from
    // successes understates reality.
    const onUsage = vi.fn()
    const client = { messages: { create: vi.fn(async () => { throw new Error('network') }) } } as any
    await readSource({ client, onUsage }, 'f').catch(() => {})
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ ok: false }), 'ingest.read')
  })

  it('names the stage, so cost can be attributed', async () => {
    const onUsage = vi.fn()
    const { client } = fakeClient(textReply(A_SET))
    await buildTopic({ client, onUsage }, 'f', { title: 'x', summary: 'y', pages: [1] })
    expect(onUsage.mock.calls[0]![1]).toBe('ingest.build')
  })
})

describe('the cache, which fails silently', () => {
  it('puts the varying instruction after the breakpoint', async () => {
    const { client, create } = fakeClient(textReply(A_SET))
    await buildTopic({ client }, 'file_1', { title: 'Organelles', summary: 's', pages: [4] })
    const content = requestOf(create).messages[0].content
    const breakpoint = content.findIndex((b: any) => b.cache_control)
    // Everything before the breakpoint is identical for every topic in this
    // document; the instruction is last and is the only part that varies.
    expect(breakpoint).toBeGreaterThan(-1)
    expect(breakpoint).toBeLessThan(content.length - 1)
    expect(content[content.length - 1].text).toContain('Organelles')
  })

  it('caches for an hour, because a fan-out outlives five minutes', async () => {
    const { client, create } = fakeClient(textReply(A_SET))
    await buildTopic({ client }, 'f', { title: 'x', summary: 'y', pages: [] })
    const content = requestOf(create).messages[0].content
    expect(content.find((b: any) => b.cache_control).cache_control).toEqual({
      type: 'ephemeral',
      ttl: '1h',
    })
  })

  it('notices when the second call read nothing from the cache', () => {
    // Worth an alert rather than a dashboard: the failure is invisible in the
    // output and shows up only on the bill, at roughly ten times the price.
    const call = (cacheReadTokens: number): CallUsage => ({
      model: MODEL, inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0,
      cacheReadTokens, estCostUsd: 0, durationMs: 1, stopReason: null, ok: true,
    })
    expect(cacheHealthy([call(0), call(0), call(0)])).toBe(false)
    expect(cacheHealthy([call(0), call(50_000)])).toBe(true)
  })

  it('does not complain about a document with only one topic', () => {
    const only: CallUsage = {
      model: MODEL, inputTokens: 1, outputTokens: 1, cacheCreationTokens: 0,
      cacheReadTokens: 0, estCostUsd: 0, durationMs: 1, stopReason: null, ok: true,
    }
    expect(cacheHealthy([only])).toBe(true)
  })
})

describe('what a call cost', () => {
  it('prices cached reads far below fresh input', () => {
    const fresh = estimateCost({ inputTokens: 100_000, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })
    const cached = estimateCost({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 100_000 })
    expect(cached).toBeLessThan(fresh / 5)
  })

  it('is versioned, so an old row keeps the price of its day', () => {
    expect(RATES.version).toBeGreaterThanOrEqual(1)
    expect(RATES.model).toBe(MODEL)
  })

  it('costs nothing for nothing', () => {
    expect(estimateCost({ inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0 })).toBe(0)
  })
})

describe('the schema we send matches the one we enforce', () => {
  it('describes the card shape as an object with no extra properties', () => {
    const schema = toJsonSchema(generatedSetSchema) as any
    expect(schema.type).toBe('object')
    expect(schema.additionalProperties).toBe(false)
    expect(schema.properties.cards.type).toBe('array')
  })

  it('allows the nullable fields to actually be null', () => {
    const card = (toJsonSchema(generatedSetSchema) as any).properties.cards.items
    expect(card.properties.hint.anyOf).toEqual([{ type: 'string' }, { type: 'null' }])
  })

  it('constrains an enum to its values', () => {
    const card = (toJsonSchema(generatedSetSchema) as any).properties.cards.items
    expect(card.properties.answerKind.enum).toEqual(['text', 'numeric', 'set'])
  })

  it('describes the source map too', () => {
    expect((toJsonSchema(sourceMapSchema) as any).properties.topics.type).toBe('array')
  })
})
