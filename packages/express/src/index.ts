/**
 * @file index.ts
 * @description Express adapter entry point for SchemaRoute.
 *
 * `createAPI` is the single public function — it registers all CRUD routes and
 * any user-defined custom routes on an Express application instance.
 *
 * Route registration order (critical for Express path matching):
 *   1. Custom routes — registered first to prevent `/:id` catching named paths
 *      (e.g. `/products/active` must not match `/products/:id`)
 *   2. CRUD routes   — getAll, getOne, create, update, patch, delete
 *
 * Model registration:
 *   Models are registered on both the global Mongoose instance and the active
 *   connection so that `populate` works correctly with Atlas connections.
 *   Always call `createAPI` inside the `.then()` callback of `mongoose.connect`.
 *
 * Body size limiting (`maxBodySize`):
 *   When set, a `Content-Length` header guard is injected before POST/PUT/PATCH
 *   handlers. It has two paths:
 *     1. Fast path — rejects via Content-Length header before the body is read.
 *     2. Slow path — fallback for chunked transfers that omit Content-Length;
 *        checks the byte length of the already-parsed body.
 *   GET and DELETE routes are never affected.
 */

import type { Application, RequestHandler } from 'express'
import type { Schema, Mongoose } from 'mongoose'
import { createSchemaRoute, deriveModelName, assertConnected, registerModel, makeResolveModel } from '@schemaroute/core'
import type {
  ResourceConfig,
  SchemaRouteInstance,
  BuiltInRateLimit,
  RateLimitOption,
  GetAllRouteConfig,
  GetOneRouteConfig,
  CreateRouteConfig,
  UpdateRouteConfig,
  PatchRouteConfig,
  DeleteRouteConfig,
} from '@schemaroute/core'
import { createRateLimiter } from './rate-limiter'
import { createLogger } from './logger'
import {
  makeGetAllHandler,
  makeGetOneHandler,
  makeCreateHandler,
  makeUpdateHandler,
  makePatchHandler,
  makeDeleteHandler,
} from './handlers/index'

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Returns a middleware that rejects requests whose body exceeds `maxBodySize`.
 *
 * Two-path strategy:
 *   1. Fast path — checks `Content-Length` header before the body is read.
 *      Rejects immediately with 413 if the declared size exceeds the limit.
 *   2. Slow path — fallback for chunked transfers that omit `Content-Length`.
 *      When `req.body` is already set by the app-level `express.json()` parser,
 *      the serialised byte length of the parsed body is used as a proxy.
 *
 * This approach works even when an app-level `express.json()` has already run,
 * because Express body parsers skip re-parsing if `req.body` is already set —
 * so injecting a second size-limited parser would have no effect.
 */
function makeBodySizeGuard(maxBodySize: string | number): RequestHandler {
  const maxBytes = typeof maxBodySize === 'number'
    ? maxBodySize
    : parseSize(maxBodySize)

  return (req, res, next) => {
    // Fast path: Content-Length header present — reject before reading body
    const contentLength = parseInt(req.headers['content-length'] ?? '0', 10)
    if (contentLength > maxBytes) {
      res.status(413).json({ success: false, error: `Request body too large — limit is ${maxBodySize}` })
      return
    }

    // Slow path: chunked transfer without Content-Length — count bytes as they arrive
    // req.body is already set by app-level express.json(), so we check the raw
    // JSON string length as a proxy for the original byte count
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

/** Parses size strings like '10kb', '1mb' into bytes. */
function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i)
  if (!match) return 102400 // default 100kb
  const value = parseFloat(match[1]!)
  const unit  = (match[2] ?? 'b').toLowerCase()
  const multipliers: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }
  return Math.floor(value * (multipliers[unit] ?? 1))
}

/** Type guard — returns `true` when the rate limit option is the built-in config object. */
function isBuiltInRateLimitConfig(rateLimitOption: RateLimitOption): rateLimitOption is BuiltInRateLimit {
  return !Array.isArray(rateLimitOption) && 'max' in rateLimitOption && 'window' in rateLimitOption
}

/**
 * Resolves a `RateLimitOption` into an array of Express middleware.
 * Returns an empty array when no rate limit is configured.
 */
function resolveRateLimitMiddleware(rateLimitOption?: RateLimitOption): RequestHandler[] {
  if (!rateLimitOption) return []
  if (isBuiltInRateLimitConfig(rateLimitOption)) {
    return [createRateLimiter(rateLimitOption) as RequestHandler]
  }
  return rateLimitOption as RequestHandler[]
}

/** Tracks which Express app instances have already had the JSON error handler registered. */
const appsWithJsonErrorHandler = new WeakSet<Application>()

/**
 * Registers SchemaRoute's JSON parse error handler on an Express app.
 * Returns JSON `{ success: false, error: 'Invalid JSON body' }` instead of
 * Express's default HTML page when a request body cannot be parsed.
 *
 * Called automatically by `createAPI` on first use, but can be called
 * explicitly during app setup to control registration order.
 * Safe to call multiple times — registers only once per app instance.
 *
 * @param expressApp - Express application instance.
 */
export function registerErrorHandlers(expressApp: Application): void {
  if (appsWithJsonErrorHandler.has(expressApp)) return
  appsWithJsonErrorHandler.add(expressApp)

  // Must be a 4-argument function so Express recognises it as an error-handling
  // middleware. Using typed imports avoids the `unknown` cast and makes the
  // intent explicit to both Express and TypeScript.
  expressApp.use((
    err:  Error & { type?: string },
    _req: import('express').Request,
    res:  import('express').Response,
    next: import('express').NextFunction
  ) => {
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ success: false, error: 'Invalid JSON body' })
      return
    }
    next(err)
  })
}

/**
 * Registers auto-generated CRUD routes for a Mongoose schema on an Express app.
 *
 * **DB connection is your responsibility** — SchemaRoute does not connect to
 * MongoDB. You must call `mongoose.connect()` before calling `createAPI`.
 * SchemaRoute uses the already-open connection on the mongoose instance you pass in.
 *
 * **Always pass your mongoose instance** as the 5th argument. If you omit it,
 * SchemaRoute falls back to `require('mongoose')` which may be a different
 * instance than the one you connected with, causing silent query failures.
 *
 * @param expressApp       - Express application instance.
 * @param mongooseSchema   - Mongoose schema to generate routes from.
 * @param resourceName     - Plural resource name used as the URL base path (e.g. `'products'`).
 * @param resourceConfig   - Optional resource-level configuration (middleware, hooks, validation, etc.).
 * @param mongooseInstance - **Required in practice.** Your mongoose instance — must already
 *                          be connected via `mongoose.connect()` before this is called.
 *
 * @throws {Error} If called before `mongoose.connect()` has resolved (readyState !== 1).
 *
 * @example
 * import mongoose from 'mongoose'
 * import express  from 'express'
 * import { createAPI } from '@schemaroute/express'
 *
 * const ProductSchema = new mongoose.Schema({ name: String, price: Number })
 * const app = express()
 * app.use(express.json())
 *
 * // ✅ correct — createAPI called AFTER connect resolves, mongoose instance passed
 * mongoose.connect(process.env.MONGO_URI).then(() => {
 *   createAPI(app, ProductSchema, 'products', {
 *     routes: {
 *       create: { validation: true, middleware: [requireAuth] },
 *       patch:  { middleware: [requireAuth] },          // partial update
 *       delete: { middleware: [requireAuth, requireAdmin] },
 *     },
 *   }, mongoose)  // ← always pass your mongoose instance
 *   app.listen(3000)
 * })
 *
 * // ❌ wrong — will throw: mongoose connection is "disconnected"
 * createAPI(app, ProductSchema, 'products', {}, mongoose)
 * mongoose.connect(process.env.MONGO_URI)
 */
export function createAPI(
  expressApp:        Application,
  mongooseSchema:    Schema,
  resourceName:      string,
  resourceConfig:    ResourceConfig = {},
  mongooseInstance?: Mongoose
): SchemaRouteInstance {
  const logger = createLogger(resourceName, resourceConfig.debug ?? false)

  // Use the provided mongoose instance or fall back to the globally installed one
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mongooseRef = mongooseInstance ?? (require('mongoose') as Mongoose)

  assertConnected(resourceName, mongooseRef)

  const schemaRouteInstance      = createSchemaRoute(mongooseSchema, resourceName, resourceConfig)
  const { parsedSchema, routes } = schemaRouteInstance
  const modelName                = deriveModelName(resourceName)

  registerModel(mongooseRef, modelName, mongooseSchema)

  logger.log(`registered model: ${modelName} — active models: [${Object.keys(mongooseRef.connection?.models ?? {}).join(', ')}]`)

  const resolveModel = makeResolveModel(mongooseRef, modelName)

  // Body size guard for write routes — rejects via Content-Length header check
  // before the body is read, so it works even when app-level express.json() runs first.
  const bodySizeGuard = resourceConfig.maxBodySize ? makeBodySizeGuard(resourceConfig.maxBodySize) : null

  // Return JSON instead of Express's default HTML for malformed request bodies.
  // Delegates to registerErrorHandlers which guards against duplicate registration.
  registerErrorHandlers(expressApp)

  // ── Pass 1: Register custom routes first ──────────────────────────────────
  // Must be registered before /:id routes to prevent Express matching
  // named paths like /products/active as /products/:id
  for (const routeDefinition of routes) {
    if (routeDefinition.operation !== 'custom') continue

    const routeMiddlewareChain = [
      ...resolveRateLimitMiddleware(routeDefinition.rateLimit),
      ...(routeDefinition.middleware as RequestHandler[]),
    ]

    expressApp[routeDefinition.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](
      routeDefinition.path,
      ...routeMiddlewareChain
    )
  }

  // ── Pass 2: Register CRUD routes ──────────────────────────────────────────
  for (const routeDefinition of routes) {
    if (routeDefinition.operation === 'custom') continue

    const routeMiddlewareChain = [
      ...resolveRateLimitMiddleware(routeDefinition.rateLimit),
      ...(routeDefinition.middleware as RequestHandler[]),
    ]

    switch (routeDefinition.operation) {
      case 'getAll':
        expressApp.get(routeDefinition.path, ...routeMiddlewareChain,
          makeGetAllHandler(resolveModel, parsedSchema, routeDefinition.config as GetAllRouteConfig, resourceConfig, logger) as RequestHandler
        )
        break

      case 'getOne':
        expressApp.get(routeDefinition.path, ...routeMiddlewareChain,
          makeGetOneHandler(resolveModel, parsedSchema, routeDefinition.config as GetOneRouteConfig, resourceConfig, logger) as RequestHandler
        )
        break

      case 'create':
        expressApp.post(routeDefinition.path, ...routeMiddlewareChain,
          ...(bodySizeGuard ? [bodySizeGuard] : []),
          makeCreateHandler(resolveModel, parsedSchema, routeDefinition.config as CreateRouteConfig, resourceConfig, logger) as RequestHandler
        )
        break

      case 'update':
        expressApp.put(routeDefinition.path, ...routeMiddlewareChain,
          ...(bodySizeGuard ? [bodySizeGuard] : []),
          makeUpdateHandler(resolveModel, parsedSchema, routeDefinition.config as UpdateRouteConfig, resourceConfig, logger) as RequestHandler
        )
        break

      case 'patch':
        expressApp.patch(routeDefinition.path, ...routeMiddlewareChain,
          ...(bodySizeGuard ? [bodySizeGuard] : []),
          makePatchHandler(resolveModel, parsedSchema, routeDefinition.config as PatchRouteConfig, resourceConfig, logger) as RequestHandler
        )
        break

      case 'delete':
        expressApp.delete(routeDefinition.path, ...routeMiddlewareChain,
          makeDeleteHandler(resolveModel, parsedSchema, routeDefinition.config as DeleteRouteConfig, resourceConfig, logger) as RequestHandler
        )
        break
    }
  }

  return schemaRouteInstance
}
