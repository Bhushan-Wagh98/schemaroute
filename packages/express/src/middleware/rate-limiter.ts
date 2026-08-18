/**
 * @file middleware/rate-limiter.ts
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
 * a Redis-backed solution (e.g. `rate-limiter-flexible`) using the array syntax:
 * `rateLimit: [myRedisMiddleware]`
 */

import type { Request, Response, NextFunction } from 'express'
import type { BuiltInRateLimit } from '@schemaroute/core'

interface RateLimitEntry {
  count:     number
  resetTime: number
}

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
 * Each call creates an isolated in-memory store so different routes have
 * independent rate limit counters.
 */
export function createRateLimiter(options: BuiltInRateLimit) {
  const store    = new Map<string, RateLimitEntry>()
  const windowMs = parseWindowToMs(options.window)

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientKey = req.ip ?? 'unknown'
    const now       = Date.now()
    const entry     = store.get(clientKey)

    if (!entry || now > entry.resetTime) {
      store.set(clientKey, { count: 1, resetTime: now + windowMs })
      return next()
    }

    if (entry.count >= options.max) {
      res.status(429).json({ success: false, error: 'Too many requests, please try again later' })
      return
    }

    entry.count++
    next()
  }
}
