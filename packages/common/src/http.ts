/**
 * @file http.ts
 * @description HTTP method and middleware primitive types.
 *
 * HttpMethod covers the standard REST subset used by SchemaRoute's auto-generated
 * routes plus HEAD for custom routes. MiddlewareFn is intentionally typed as
 * `any` to keep this package framework-agnostic — adapters cast to their
 * framework's specific handler type at the boundary.
 */

/**
 * HTTP methods supported by SchemaRoute.
 *
 * Standard CRUD methods (GET, POST, PUT, PATCH, DELETE) are used by the
 * auto-generated routes. HEAD is available for custom routes only — it behaves
 * like GET but the server omits the response body, useful for existence checks
 * and cache validation without transferring data.
 *
 * Not included and why:
 *   OPTIONS — Express handles CORS preflight automatically; no app-level ownership needed.
 *   CONNECT — TCP tunnel for SSL proxies; not an application-layer concern.
 *   TRACE   — Diagnostic loop-back; disabled by default in most frameworks for security.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

/**
 * Framework-agnostic middleware function signature.
 * Typed as `any` intentionally — keeps `@schemaroute/common` free of Express/Fastify
 * imports. Adapters cast to `RequestHandler` at the boundary.
 */
export type MiddlewareFn = (req: any, res: any, next: any) => void

// ─── Rate Limiting ────────────────────────────────────────────────────────────

export interface BuiltInRateLimit {
  max:    number
  window: string
}

/**
 * Rate limit option — either the built-in sliding window config object,
 * or an array of your own middleware (e.g. a Redis-backed limiter).
 */
export type RateLimitOption = BuiltInRateLimit | MiddlewareFn[]

// ─── Query Modes ──────────────────────────────────────────────────────────────

export type PaginationMode = 'page' | 'cursor' | 'both' | false
export type SearchMode = 'all-fields' | 'single-field' | false
