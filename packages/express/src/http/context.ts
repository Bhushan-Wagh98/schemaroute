/**
 * @file http/context.ts
 * @description Extracts a framework-agnostic `RequestContext` snapshot from an
 * Express request object. Passed as the second argument to all lifecycle hooks
 * so hooks can read headers, query params, route params, and the authenticated
 * user without being coupled to Express types.
 */

import type { Request } from 'express'
import type { RequestContext } from '@schemaroute/core'

/**
 * Extends the Express Request type to include the optional `user` property
 * set by auth middleware (e.g. passport, jwt-express).
 */
interface AuthenticatedRequest extends Request {
  user?: Record<string, unknown>
}

/**
 * Builds a `RequestContext` from an Express `Request`.
 *
 * `user` is read from `req.user` which is populated by auth middleware before
 * the route handler runs (e.g. `req.user = jwt.verify(token, secret)`).
 * It is `undefined` when no auth middleware is applied to the route.
 *
 * @param expressRequest - The incoming Express request object.
 * @returns              A serialisable context snapshot for use in hooks.
 */
export function buildRequestContext(expressRequest: Request): RequestContext {
  const req = expressRequest as AuthenticatedRequest
  return {
    headers: req.headers as Record<string, string | string[] | undefined>,
    query:   req.query   as Record<string, unknown>,
    params:  req.params  as Record<string, string>,
    user:    req.user,
    req:     req         as unknown as Record<string, unknown>,
  }
}
