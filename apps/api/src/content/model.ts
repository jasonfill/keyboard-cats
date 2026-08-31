// Talking to the model.
//
// Two things here are worth more than the rest of the file put together.
//
// **Caching.** The document, the system prompt and the card grammar are
// identical across every topic call for one document, so they go in front of a
// cache breakpoint and only the topic instruction varies. The first call writes
// the cache at 1.25×; the rest read it at 0.1×. On a twenty-page PDF that is
// the difference between paying for 50k input tokens six times and paying for
// it once — and it fails *silently*, which is why `cacheHealthy` below exists.
//
// **Usage is recorded on every call, success or failure.** A refused or errored
// call still spent tokens, and a cost model built only from successes
// understates reality. The numbers in the billing spec are estimates meant to
// be replaced; nothing can replace them if nobody was measuring.

import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { generatedSetSchema, sourceMapSchema, type GeneratedSet, type SourceMap } from './schemas.js'
import { BUILD_SYSTEM, CARD_GRAMMAR, buildInstruction, READ_SYSTEM } from './prompts.js'

export const MODEL = 'claude-opus-5'

/** Per million tokens, versioned so historical rows keep the price of their day. */
export const RATES = {
  version: 1,
  model: MODEL,
  inputPerM: 5,
  outputPerM: 25,
  /** Writing the cache costs a little more than reading fresh input. */
  cacheWritePerM: 6.25,
  cacheReadPerM: 0.5,
} as const

export interface CallUsage {
  model: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  estCostUsd: number
  durationMs: number
  stopReason: string | null
  ok: boolean
}

export function estimateCost(u: {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}): number {
  const m = 1_000_000
  return (
    (u.inputTokens * RATES.inputPerM) / m +
    (u.outputTokens * RATES.outputPerM) / m +
    (u.cacheCreationTokens * RATES.cacheWritePerM) / m +
    (u.cacheReadTokens * RATES.cacheReadPerM) / m
  )
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function usageOf(response: any, startedAt: number, ok: boolean): CallUsage {
  const u = response?.usage ?? {}
  const counts = {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  }
  return {
    model: response?.model ?? MODEL,
    ...counts,
    estCostUsd: estimateCost(counts),
    durationMs: Date.now() - startedAt,
    stopReason: response?.stop_reason ?? null,
    ok,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Did the cache actually work?
 *
 * If the second topic call of a fan-out reads zero cached tokens, something
 * upstream is varying and the document costs roughly ten times what it should.
 * This is worth an alert rather than a dashboard nobody remembers to open —
 * the failure is invisible in the output and only shows up on the bill.
 */
export function cacheHealthy(calls: readonly CallUsage[]): boolean {
  const afterFirst = calls.slice(1)
  if (!afterFirst.length) return true
  return afterFirst.some((c) => c.cacheReadTokens > 0)
}

export class RefusedError extends Error {
  constructor(readonly category: string | null) {
    super("We couldn't work with that document.")
    this.name = 'RefusedError'
  }
}

/** Everything a call needs, so nothing here reaches for a global. */
export interface ModelDeps {
  client: Anthropic
  /** Called for every attempt, before anything is thrown. */
  onUsage?: (usage: CallUsage, feature: string) => void | Promise<void>
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function parsed<T>(
  deps: ModelDeps,
  feature: string,
  schema: z.ZodType<T>,
  request: Record<string, unknown>,
): Promise<{ value: T; usage: CallUsage }> {
  const startedAt = Date.now()
  let response: any
  try {
    response = await (deps.client as any).messages.create(request)
  } catch (error) {
    await deps.onUsage?.(usageOf(null, startedAt, false), feature)
    throw error
  }

  const usage = usageOf(response, startedAt, response?.stop_reason !== 'refusal')
  await deps.onUsage?.(usage, feature)

  // A refusal arrives as HTTP 200 with `stop_reason: 'refusal'`. Reading
  // `content` without checking gives an empty array and a confusing crash three
  // frames away from the cause.
  if (response?.stop_reason === 'refusal') {
    throw new RefusedError(response?.stop_details?.category ?? null)
  }

  const text = (response?.content ?? [])
    .filter((b: any) => b?.type === 'text')
    .map((b: any) => b.text)
    .join('')

  return { value: schema.parse(JSON.parse(text)), usage }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const OUTPUT_CONFIG = { effort: 'high' as const }

/** Stage 2. One call: what is this, and what is learnable in it? */
export async function readSource(
  deps: ModelDeps,
  fileId: string,
): Promise<{ map: SourceMap; usage: CallUsage }> {
  const { value, usage } = await parsed(deps, 'ingest.read', sourceMapSchema, {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { ...OUTPUT_CONFIG, format: { type: 'json_schema', schema: toJsonSchema(sourceMapSchema) } },
    system: READ_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'document', source: { type: 'file', file_id: fileId }, citations: { enabled: true } },
          { type: 'text', text: 'Read this and report what is learnable in it.' },
        ],
      },
    ],
    betas: ['files-api-2025-04-14'],
  })
  return { map: value, usage }
}

/**
 * Stage 3. One call per topic, fanned out over the same cached document.
 *
 * Per topic rather than one big call because a forty-page chapter asked for in
 * one response produces a long, flat, increasingly lazy list — the last topic
 * always gets worse cards than the first. Six calls each produce their best
 * work, run in parallel, and fail independently.
 */
export async function buildTopic(
  deps: ModelDeps,
  fileId: string,
  topic: { title: string; summary: string; pages: number[] },
): Promise<{ set: GeneratedSet; usage: CallUsage }> {
  const { value, usage } = await parsed(deps, 'ingest.build', generatedSetSchema, {
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: 'adaptive' },
    output_config: { ...OUTPUT_CONFIG, format: { type: 'json_schema', schema: toJsonSchema(generatedSetSchema) } },
    system: BUILD_SYSTEM,
    messages: [
      {
        role: 'user',
        content: [
          // Everything above the breakpoint is identical for every topic in
          // this document. Order matters: the varying instruction goes last.
          { type: 'document', source: { type: 'file', file_id: fileId } },
          { type: 'text', text: CARD_GRAMMAR, cache_control: { type: 'ephemeral', ttl: '1h' } },
          { type: 'text', text: buildInstruction(topic) },
        ],
      },
    ],
    betas: ['files-api-2025-04-14'],
  })
  return { set: value, usage }
}

/**
 * A JSON schema the API will accept, from the zod schema we already validate
 * against — so the shape asked for and the shape enforced cannot drift.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function toJsonSchema(schema: z.ZodType<any>): Record<string, unknown> {
  return jsonSchemaOf(schema as any)
}

function jsonSchemaOf(schema: any): Record<string, unknown> {
  const def = schema?._def
  const name = def?.typeName

  if (name === 'ZodObject') {
    const shape = def.shape()
    const properties: Record<string, unknown> = {}
    const required: string[] = []
    for (const [key, value] of Object.entries<any>(shape)) {
      properties[key] = jsonSchemaOf(value)
      required.push(key)
    }
    return { type: 'object', properties, required, additionalProperties: false }
  }
  if (name === 'ZodArray') {
    return { type: 'array', items: jsonSchemaOf(def.type) }
  }
  if (name === 'ZodNullable') {
    return { anyOf: [jsonSchemaOf(def.innerType), { type: 'null' }] }
  }
  if (name === 'ZodOptional') return jsonSchemaOf(def.innerType)
  if (name === 'ZodEnum') return { type: 'string', enum: def.values }
  if (name === 'ZodString') return { type: 'string' }
  if (name === 'ZodNumber') return { type: 'number' }
  if (name === 'ZodBoolean') return { type: 'boolean' }
  return {}
}
/* eslint-enable @typescript-eslint/no-explicit-any */
