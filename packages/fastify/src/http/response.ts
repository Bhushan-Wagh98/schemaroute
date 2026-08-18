/**
 * @file http/response.ts
 * @description Normalised HTTP response helpers for the Fastify adapter.
 * Mirrors the shape of `@schemaroute/express`'s response helpers so both
 * adapters produce identical JSON envelopes.
 */

import type { FastifyReply } from 'fastify'
import type { ResourceConfig } from '@schemaroute/core'

/**
 * Sends a normalised success response.
 * Default envelope: `{ success: true, data, meta? }` — `meta` omitted when empty.
 * When `responseFn` is provided it takes full control of the shape.
 */
export function sendSuccess(
  reply:       FastifyReply,
  data:        unknown,
  meta:        Record<string, unknown> = {},
  responseFn?: ResourceConfig['response'],
  status       = 200
): void {
  const hasMeta = Object.keys(meta).length > 0
  const body    = responseFn
    ? responseFn(data, meta)
    : { success: true, data, ...(hasMeta ? { meta } : {}) }
  reply.status(status).send(body)
}

/**
 * Sends a normalised error response.
 * Shape: `{ success: false, error, details? }` — `details` omitted when absent.
 */
export function sendError(
  reply:    FastifyReply,
  status:   number,
  error:    string,
  details?: unknown
): void {
  reply.status(status).send({
    success: false,
    error,
    ...(details !== undefined ? { details } : {}),
  })
}

/**
 * Returns `true` when the error originated from `makeResolveModel` detecting
 * a dropped MongoDB connection. Used by handlers to return 503 instead of 500.
 */
export function isDisconnectedError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err as Error & { code?: string }).code === 'MONGOOSE_DISCONNECTED'
  )
}
