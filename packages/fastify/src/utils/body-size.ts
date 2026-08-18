/**
 * @file utils/body-size.ts
 * @description Body size guard for Fastify write routes.
 * Mirrors @schemaroute/express/src/middleware/body-size.ts.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'

/** Parses size strings like `'10kb'`, `'1mb'` into bytes. Defaults to 100kb on invalid input. */
export function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i)
  if (!match) return 102400
  const value = parseFloat(match[1]!)
  const unit  = (match[2] ?? 'b').toLowerCase()
  const multipliers: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }
  return Math.floor(value * (multipliers[unit] ?? 1))
}

/**
 * Returns a Fastify preHandler that rejects requests whose body exceeds `maxBodySize`.
 * Only applied to write routes (POST, PUT, PATCH).
 */
export function makeBodySizeGuard(maxBodySize: string | number) {
  const maxBytes = typeof maxBodySize === 'number' ? maxBodySize : parseSize(maxBodySize)
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const contentLength = parseInt((req.headers as any)['content-length'] ?? '0', 10)
    if (contentLength > maxBytes) {
      reply.status(413).send({ success: false, error: `Request body too large — limit is ${maxBodySize}` })
    }
  }
}
