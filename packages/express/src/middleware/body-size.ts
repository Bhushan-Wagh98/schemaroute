/**
 * @file middleware/body-size.ts
 * @description Request body size guard middleware factory.
 *
 * Two-path strategy:
 *   1. Fast path — checks `Content-Length` header before the body is read.
 *      Rejects immediately with 413 if the declared size exceeds the limit.
 *   2. Slow path — fallback for chunked transfers that omit `Content-Length`.
 *      When `req.body` is already set by the app-level `express.json()` parser,
 *      the serialised byte length of the parsed body is used as a proxy.
 *
 * A second `express.json({ limit })` parser would not work here because Express
 * skips re-parsing if `req.body` is already set by the app-level parser.
 */

import type { RequestHandler } from 'express'

/**
 * Returns a middleware that rejects requests whose body exceeds `maxBodySize`.
 * Only applied to write routes (POST, PUT, PATCH) — GET and DELETE are unaffected.
 */
export function makeBodySizeGuard(maxBodySize: string | number): RequestHandler {
  const maxBytes = typeof maxBodySize === 'number' ? maxBodySize : parseSize(maxBodySize)

  return (req, res, next) => {
    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10)
    if (contentLength > maxBytes) {
      res.status(413).json({ success: false, error: `Request body too large — limit is ${maxBodySize}` })
      return
    }

    if (req.body !== undefined) {
      const bodyBytes = Buffer.byteLength(JSON.stringify(req.body), 'utf8')
      if (bodyBytes > maxBytes) {
        res.status(413).json({ success: false, error: `Request body too large — limit is ${maxBodySize}` })
        return
      }
    }

    next()
  }
}

/** Parses size strings like `'10kb'`, `'1mb'` into bytes. Defaults to 100kb on invalid input. */
export function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i)
  if (!match) return 102400
  const value = parseFloat(match[1]!)
  const unit  = (match[2] ?? 'b').toLowerCase()
  const multipliers: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }
  return Math.floor(value * (multipliers[unit] ?? 1))
}
