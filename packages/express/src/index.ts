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
 * Internal modules:
 *   body-size.ts       — makeBodySizeGuard, parseSize
 *   resolve-mongoose.ts — resolveMongoose (Schema vs Model detection)
 *   rate-limiter.ts    — createRateLimiter
 *   logger.ts          — createLogger
 *   handlers/          — one file per CRUD operation
 */

import type { Application, RequestHandler } from 'express'
import type { Schema, Model as MongooseModel, Mongoose } from 'mongoose'
import { createSchemaRoute, assertConnected, registerModel, makeResolveModel, deriveModelName } from '@schemaroute/core'
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
  RestoreRouteConfig,
  PurgeRouteConfig,
} from '@schemaroute/core'
import { makeBodySizeGuard } from './middleware/body-size'
import { resolveMongoose } from './utils/resolve-mongoose'
import { createRateLimiter } from './middleware/rate-limiter'
import { createLogger } from './utils/logger'
import {
  makeGetAllHandler,
  makeGetOneHandler,
  makeCreateHandler,
  makeUpdateHandler,
  makePatchHandler,
  makeDeleteHandler,
  makeRestoreHandler,
  makePurgeHandler,
} from './handlers/index'

// ─── Rate Limit Helpers ───────────────────────────────────────────────────────

function isBuiltInRateLimitConfig(opt: RateLimitOption): opt is BuiltInRateLimit {
  return !Array.isArray(opt) && 'max' in opt && 'window' in opt
}

function resolveRateLimitMiddleware(opt?: RateLimitOption): RequestHandler[] {
  if (!opt) return []
  if (isBuiltInRateLimitConfig(opt)) return [createRateLimiter(opt) as RequestHandler]
  return opt as RequestHandler[]
}

// ─── JSON Error Handler ───────────────────────────────────────────────────────

/** Tracks which Express app instances have already had the JSON error handler registered. */
const appsWithJsonErrorHandler = new WeakSet<Application>()

/**
 * Registers SchemaRoute's JSON parse error handler on an Express app.
 * Returns `{ success: false, error: 'Invalid JSON body' }` instead of
 * Express's default HTML page when a request body cannot be parsed.
 *
 * Called automatically by `createAPI` on first use. Safe to call multiple
 * times — registers only once per app instance.
 */
export function registerErrorHandlers(expressApp: Application): void {
  if (appsWithJsonErrorHandler.has(expressApp)) return
  appsWithJsonErrorHandler.add(expressApp)

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

// ─── createAPI ────────────────────────────────────────────────────────────────

/**
 * Registers auto-generated CRUD routes for a Mongoose schema or Model on an Express app.
 *
 * @param expressApp       - Express application instance.
 * @param mongooseSchema   - Mongoose Schema **or** an already-registered Model.
 *                          When a Model is passed, schema and connection are extracted
 *                          automatically — no need to pass `mongoose` as the 5th argument.
 * @param resourceName     - Plural resource name used as the URL base path (e.g. `'products'`).
 * @param resourceConfig   - Optional resource-level configuration.
 * @param mongooseInstance - Your mongoose instance. Required when passing a Schema.
 *                          Optional when passing a Model — the Model's connection is used.
 *
 * @throws {Error} If called before `mongoose.connect()` has resolved.
 */
export function createAPI(
  expressApp:        Application,
  mongooseSchema:    Schema | MongooseModel<unknown>,
  resourceName:      string,
  resourceConfig:    ResourceConfig = {},
  mongooseInstance?: Mongoose
): SchemaRouteInstance {
  const logger = createLogger(resourceName, resourceConfig.debug ?? false)

  const { schema, mongooseRef, modelName: resolvedModelName, isModel } =
    resolveMongoose(mongooseSchema, mongooseInstance)

  assertConnected(resourceName, mongooseRef)

  const schemaRouteInstance      = createSchemaRoute(schema, resourceName, resourceConfig)
  const { parsedSchema, routes } = schemaRouteInstance
  const modelName                = resolvedModelName ?? deriveModelName(resourceName)

  if (!isModel) {
    registerModel(mongooseRef, modelName, schema)
  }

  logger.log(`registered model: ${modelName} — active models: [${Object.keys(mongooseRef.connection?.models ?? {}).join(', ')}]`)

  const resolveModel  = makeResolveModel(mongooseRef, modelName)
  const bodySizeGuard = resourceConfig.maxBodySize ? makeBodySizeGuard(resourceConfig.maxBodySize) : null

  registerErrorHandlers(expressApp)

  // ── Pass 1: Custom routes first ───────────────────────────────────────────
  for (const route of routes) {
    if (route.operation !== 'custom') continue
    const chain = [
      ...resolveRateLimitMiddleware(route.rateLimit),
      ...(route.middleware as RequestHandler[]),
    ]
    expressApp[route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete'](route.path, ...chain)
  }

  // ── Pass 2: CRUD routes ───────────────────────────────────────────────────
  for (const route of routes) {
    if (route.operation === 'custom') continue
    const chain = [
      ...resolveRateLimitMiddleware(route.rateLimit),
      ...(route.middleware as RequestHandler[]),
    ]

    switch (route.operation) {
      case 'getAll':
        expressApp.get(route.path, ...chain,
          makeGetAllHandler(resolveModel, parsedSchema, route.config as GetAllRouteConfig, resourceConfig, logger) as RequestHandler)
        break
      case 'getOne':
        expressApp.get(route.path, ...chain,
          makeGetOneHandler(resolveModel, parsedSchema, route.config as GetOneRouteConfig, resourceConfig, logger) as RequestHandler)
        break
      case 'create':
        expressApp.post(route.path, ...chain,
          ...(bodySizeGuard ? [bodySizeGuard] : []),
          makeCreateHandler(resolveModel, parsedSchema, route.config as CreateRouteConfig, resourceConfig, logger) as RequestHandler)
        break
      case 'update':
        expressApp.put(route.path, ...chain,
          ...(bodySizeGuard ? [bodySizeGuard] : []),
          makeUpdateHandler(resolveModel, parsedSchema, route.config as UpdateRouteConfig, resourceConfig, logger) as RequestHandler)
        break
      case 'patch':
        expressApp.patch(route.path, ...chain,
          ...(bodySizeGuard ? [bodySizeGuard] : []),
          makePatchHandler(resolveModel, parsedSchema, route.config as PatchRouteConfig, resourceConfig, logger) as RequestHandler)
        break
      case 'delete':
        expressApp.delete(route.path, ...chain,
          makeDeleteHandler(resolveModel, parsedSchema, route.config as DeleteRouteConfig, resourceConfig, logger) as RequestHandler)
        break
      case 'restore':
        expressApp.post(route.path, ...chain,
          makeRestoreHandler(resolveModel, parsedSchema, route.config as RestoreRouteConfig, resourceConfig, logger) as RequestHandler)
        break
      case 'purge':
        expressApp.delete(route.path, ...chain,
          makePurgeHandler(resolveModel, parsedSchema, route.config as PurgeRouteConfig, resourceConfig, logger) as RequestHandler)
        break
    }
  }

  return schemaRouteInstance
}
