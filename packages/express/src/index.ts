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
 *   2. CRUD routes   — getAll, getOne, create, update, delete
 *
 * Model registration:
 *   Models are registered on both the global Mongoose instance and the active
 *   connection so that `populate` works correctly with Atlas connections.
 *   Always call `createAPI` inside the `.then()` callback of `mongoose.connect`.
 */

import type { Application, RequestHandler } from 'express'
import type { Schema, Model, Mongoose } from 'mongoose'
import { createSchemaRoute } from '@schemaroute/core'
import type {
  ResourceConfig,
  SchemaRouteInstance,
  BuiltInRateLimit,
  RateLimitOption,
  GetAllRouteConfig,
  GetOneRouteConfig,
  CreateRouteConfig,
  UpdateRouteConfig,
  DeleteRouteConfig,
} from '@schemaroute/core'
import { createRateLimiter } from './rate-limiter'
import { enableDebug, log } from './logger'
import {
  makeGetAllHandler,
  makeGetOneHandler,
  makeCreateHandler,
  makeUpdateHandler,
  makeDeleteHandler,
} from './handlers/index'

// ─── Internal Helpers ─────────────────────────────────────────────────────────

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

/**
 * Derives the singular PascalCase Mongoose model name from a plural resource name.
 * Matches Mongoose's `ref` convention so cross-model `populate` works correctly.
 *
 * @example
 * deriveModelName('categories') // → 'Category'
 * deriveModelName('products')   // → 'Product'
 * deriveModelName('users')      // → 'User'
 */
function deriveModelName(pluralResourceName: string): string {
  const singularName = pluralResourceName
    .replace(/ies$/i, 'y')  // categories → category
    .replace(/s$/i,   '')   // products   → product
  return singularName.charAt(0).toUpperCase() + singularName.slice(1)
}

// ─── createAPI ────────────────────────────────────────────────────────────────

/**
 * Registers auto-generated CRUD routes for a Mongoose schema on an Express app.
 *
 * Must be called after `mongoose.connect()` resolves so that models are bound
 * to the active database connection.
 *
 * @param expressApp       - Express application instance.
 * @param mongooseSchema   - Mongoose schema to generate routes from.
 * @param resourceName     - Plural resource name used as the URL base path (e.g. `'products'`).
 * @param resourceConfig   - Optional resource-level configuration (middleware, hooks, validation, etc.).
 * @param mongooseInstance - Your mongoose instance. Required when using a custom connection
 *                          to avoid dual-instance populate failures.
 *
 * @example
 * // JavaScript (CommonJS)
 * const { createAPI } = require('@schemaroute/express')
 * const mongoose = require('mongoose')
 * const express  = require('express')
 *
 * const ProductSchema = new mongoose.Schema({ name: String, price: Number })
 * const app = express()
 * app.use(express.json())
 *
 * mongoose.connect(process.env.MONGO_URI).then(() => {
 *   createAPI(app, ProductSchema, 'products', {
 *     routes: {
 *       create: { validation: true, middleware: [requireAuth] },
 *       delete: { middleware: [requireAuth, requireAdmin] },
 *     },
 *   }, mongoose)
 *   app.listen(3000)
 * })
 */
export function createAPI(
  expressApp:        Application,
  mongooseSchema:    Schema,
  resourceName:      string,
  resourceConfig:    ResourceConfig = {},
  mongooseInstance?: Mongoose
): SchemaRouteInstance {
  if (resourceConfig.debug) enableDebug()
  const schemaRouteInstance      = createSchemaRoute(mongooseSchema, resourceName, resourceConfig)
  const { parsedSchema, routes } = schemaRouteInstance

  // Use the provided mongoose instance or fall back to the globally installed one
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mongooseRef = mongooseInstance ?? (require('mongoose') as Mongoose)
  const modelName   = deriveModelName(resourceName)

  // Register on both the global registry and the active connection so that
  // cross-model populate works correctly with Atlas connections
  if (!mongooseRef.models[modelName]) {
    mongooseRef.model(modelName, mongooseSchema)
  }
  if (mongooseRef.connection && !mongooseRef.connection.models[modelName]) {
    try {
      mongooseRef.connection.model(modelName, mongooseSchema)
    } catch {
      // Model already registered on this connection — safe to ignore
    }
  }

  log(`registered model: ${modelName} — active models: [${Object.keys(mongooseRef.connection?.models ?? {}).join(', ')}]`)

  // Lazily resolve the model at request time so it always uses the active connection
  const resolveModel = (): Model<unknown> =>
    mongooseRef.connection.models[modelName] ?? mongooseRef.models[modelName]!

  // Return JSON instead of Express's default HTML for malformed request bodies
  expressApp.use((err: Error & { type?: string }, _req: unknown, res: unknown, next: unknown) => {
    if (err.type === 'entity.parse.failed') {
      return (res as import('express').Response)
        .status(400)
        .json({ success: false, error: 'Invalid JSON body' })
    }
    ;(next as (err: unknown) => void)(err)
  })

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
          makeGetAllHandler(resolveModel, parsedSchema, routeDefinition.config as GetAllRouteConfig, resourceConfig) as RequestHandler
        )
        break

      case 'getOne':
        expressApp.get(routeDefinition.path, ...routeMiddlewareChain,
          makeGetOneHandler(resolveModel, parsedSchema, routeDefinition.config as GetOneRouteConfig, resourceConfig) as RequestHandler
        )
        break

      case 'create':
        expressApp.post(routeDefinition.path, ...routeMiddlewareChain,
          makeCreateHandler(resolveModel, parsedSchema, routeDefinition.config as CreateRouteConfig, resourceConfig) as RequestHandler
        )
        break

      case 'update':
        expressApp.put(routeDefinition.path, ...routeMiddlewareChain,
          makeUpdateHandler(resolveModel, parsedSchema, routeDefinition.config as UpdateRouteConfig, resourceConfig) as RequestHandler
        )
        break

      case 'delete':
        expressApp.delete(routeDefinition.path, ...routeMiddlewareChain,
          makeDeleteHandler(resolveModel, parsedSchema, routeDefinition.config as DeleteRouteConfig, resourceConfig) as RequestHandler
        )
        break
    }
  }

  return schemaRouteInstance
}
