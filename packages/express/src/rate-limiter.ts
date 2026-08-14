/**
 * @file rate-limiter.ts
 * @description In-memory sliding-window rate limiter middleware for Express.
 *
 * Tracks request counts per IP address using a `Map`. Each entry stores a
 * request count and a reset timestamp. When the window expires the counter
 * resets automatically on the next request.
 *
 * Supported window formats: `'10s'` (seconds), `'1m'` (minutes), `'1h'` (hours).
 *
 * Note: This is an in-memory implementation suitable for single-process
 * deployments. For multi-instance or distributed environments, replace with
 * a Redis-backed solution (e.g. `rate-limiter-flexible`).
 */

import type { Request, Response, NextFunction } from 'express'
import type { BuiltInRateLimit } from '@schemaroute/core'

/** Per-IP rate limit tracking entry stored in the in-memory map. */
interface RateLimitEntry {
  /** Number of requests made within the current window. */
  count:     number
  /** Unix timestamp (ms) at which the current window expires. */
  resetTime: number
}

/**
 * Parses a human-readable window string into milliseconds.
 * Falls back to 60 seconds for unrecognised formats.
 *
 * @param window - Window string (e.g. `'30s'`, `'5m'`, `'2h'`).
 * @returns      Duration in milliseconds.
 */
function parseWindowToMs(window: string): number {
  const unit  = window.slice(-1)
  const value = parseInt(window.slice(0, -1), 10)

  switch (unit) {
    case 's': return value * 1_000
    case 'm': return value * 60 * 1_000
    case 'h': return value * 60 * 60 * 1_000
    default:  return 60 * 1_000
  }
}

/**
 * Creates an Express rate-limiter middleware from a `BuiltInRateLimit` config.
 * Each call creates an isolated in-memory store, so different routes can have
 * independent rate limit counters.
 *
 * @param options - Rate limit config (`max` requests per `window`).
 * @returns       An Express middleware function.
 *
 * @example
 * app.get('/products', createRateLimiter({ max: 100, window: '1m' }), handler)
 */
export function createRateLimiter(options: BuiltInRateLimit) {
  const store    = new Map<string, RateLimitEntry>()
  const windowMs = parseWindowToMs(options.window)

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientKey = req.ip ?? 'unknown'
    const now       = Date.now()
    const entry     = store.get(clientKey)

    // First request or window has expired — reset the counter
    if (!entry || now > entry.resetTime) {
      store.set(clientKey, { count: 1, resetTime: now + windowMs })
      return next()
    }

    // Limit exceeded — reject with 429
    if (entry.count >= options.max) {
      res.status(429).json({
        success: false,
        error:   'Too many requests, please try again later',
      })
      return
    }

    // Within limit — increment and continue
    entry.count++
    next()
  }
}
