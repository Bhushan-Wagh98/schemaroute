/**
 * @file index.ts
 * @description Fastify adapter entry point for SchemaRoute.
 *
 * `createAPI` is the single public function — it registers all CRUD routes and
 * any user-defined custom routes on a Fastify instance.
 *
 * Route registration order (critical for Fastify path matching):
 *   1. Custom routes — registered first to prevent `/:id` catching named paths
 *   2. CRUD routes   — getAll, getOne, create, update, patch, delete
 *   3. Soft-delete   — restore, purge (only when softDelete is enabled)
 *
 * Package structure:
 *   src/
 *   ├── index.ts          ← this file — route registration only
 *   ├── handlers/         ← one handler factory per CRUD operation
 *   ├── http/
 *   │   └── response.ts   ← sendSuccess / sendError / isDisconnectedError
 *   └── utils/
 *       ├── body-size.ts      ← makeBodySizeGuard, parseSize
 *       ├── logger.ts         ← createLogger
 *       └── resolve-mongoose.ts ← Schema vs Model detection
 */

import type { FastifyInstance } from 'fastify'
import type { Schema, Model as MongooseModel, Mongoose } from 'mongoose'
import {
  createSchemaRoute,
  deriveModelName,
  assertConnected,
  registerModel,
  makeResolveModel,
} from '@schemaroute/core'
import type {
  ResourceConfig,
  SchemaRouteInstance,
  MiddlewareFn,
  GetAllRouteConfig,
  GetOneRouteConfig,
  CreateRouteConfig,
  UpdateRouteConfig,
  PatchRouteConfig,
  DeleteRouteConfig,
  RestoreRouteConfig,
  PurgeRouteConfig,
} from '@schemaroute/core'
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
import { resolveMongoose }   from './utils/resolve-mongoose'
import { makeBodySizeGuard } from './utils/body-size'

// ─── Middleware helpers ───────────────────────────────────────────────────────

/**
 * Converts an array of Express-style middleware functions into Fastify
 * preHandler hooks. Each middleware is wrapped in a Promise so Fastify's
 * async lifecycle can await it correctly.
 */
function toPreHandler(middleware: MiddlewareFn[]) {
  if (!middleware.length) return undefined
  return middleware.map(fn => async (req: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    await new Promise<void>((resolve, reject) => {
      fn(req, reply, (err?: unknown) => err ? reject(err) : resolve())
    })
  })
}

// ─── createAPI ────────────────────────────────────────────────────────────────

/**
 * Registers auto-generated CRUD routes for a Mongoose schema on a Fastify instance.
 *
 * Works identically to `@schemaroute/express`'s `createAPI` — same config,
 * same hooks, same soft delete, same scope — only the framework binding differs.
 *
 * @param fastifyApp       - Fastify instance.
 * @param mongooseSchema   - Mongoose Schema **or** an already-registered Model.
 *                          When a Model is passed, schema and connection are extracted
 *                          automatically — no need to pass `mongoose` as the 5th argument.
 * @param resourceName     - Plural resource name used as the URL base path.
 * @param resourceConfig   - Optional resource-level configuration.
 * @param mongooseInstance - Your mongoose instance. Required when passing a Schema.
 *
 * @throws {Error} If called before `mongoose.connect()` has resolved.
 */
export function createAPI(
  fastifyApp:        FastifyInstance,
  mongooseSchema:    Schema | MongooseModel<unknown>,
  resourceName:      string,
  resourceConfig:    ResourceConfig = {},
  mongooseInstance?: Mongoose
): SchemaRouteInstance {
  const { schema, mongooseRef, modelName: resolvedModelName, isModel } =
    resolveMongoose(mongooseSchema, mongooseInstance)

  assertConnected(resourceName, mongooseRef)

  const schemaRouteInstance      = createSchemaRoute(schema, resourceName, resourceConfig)
  const { parsedSchema, routes } = schemaRouteInstance
  const modelName                = resolvedModelName ?? deriveModelName(resourceName)

  if (!isModel) {
    registerModel(mongooseRef, modelName, schema)
  }

  const resolveModel  = makeResolveModel(mongooseRef, modelName)
  const prefix        = resourceConfig.prefix ? resourceConfig.prefix.replace(/\/+$/, '') : ''
  const basePath      = `${prefix}/${resourceName}`
  const bodySizeGuard = resourceConfig.maxBodySize ? makeBodySizeGuard(resourceConfig.maxBodySize) : null

  // ── Pass 1: Custom routes first ───────────────────────────────────────────
  for (const routeDef of routes) {
    if (routeDef.operation !== 'custom') continue
    const method = routeDef.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head'
    fastifyApp[method](routeDef.path, async (req, reply) => {
      const handler = routeDef.middleware[routeDef.middleware.length - 1]
      if (handler) await handler(req, reply, () => {})
    })
  }

  // ── Pass 2: CRUD routes ───────────────────────────────────────────────────
  for (const routeDef of routes) {
    if (routeDef.operation === 'custom') continue

    const preHandler = toPreHandler(routeDef.middleware)
    const baseOpts   = preHandler ? { preHandler } : {}

    switch (routeDef.operation) {
      case 'getAll':
        fastifyApp.get(basePath, baseOpts,
          makeGetAllHandler(resolveModel, parsedSchema, routeDef.config as GetAllRouteConfig, resourceConfig))
        break

      case 'getOne':
        fastifyApp.get(`${basePath}/:id`, baseOpts,
          makeGetOneHandler(resolveModel, parsedSchema, routeDef.config as GetOneRouteConfig, resourceConfig))
        break

      case 'create': {
        const writeHandlers = [...(preHandler ?? []), ...(bodySizeGuard ? [bodySizeGuard] : [])]
        fastifyApp.post(basePath, writeHandlers.length ? { preHandler: writeHandlers } : {},
          makeCreateHandler(resolveModel, parsedSchema, routeDef.config as CreateRouteConfig, resourceConfig))
        break
      }

      case 'update': {
        const writeHandlers = [...(preHandler ?? []), ...(bodySizeGuard ? [bodySizeGuard] : [])]
        fastifyApp.put(`${basePath}/:id`, writeHandlers.length ? { preHandler: writeHandlers } : {},
          makeUpdateHandler(resolveModel, parsedSchema, routeDef.config as UpdateRouteConfig, resourceConfig))
        break
      }

      case 'patch': {
        const writeHandlers = [...(preHandler ?? []), ...(bodySizeGuard ? [bodySizeGuard] : [])]
        fastifyApp.patch(`${basePath}/:id`, writeHandlers.length ? { preHandler: writeHandlers } : {},
          makePatchHandler(resolveModel, parsedSchema, routeDef.config as PatchRouteConfig, resourceConfig))
        break
      }

      case 'delete':
        fastifyApp.delete(`${basePath}/:id`, baseOpts,
          makeDeleteHandler(resolveModel, parsedSchema, routeDef.config as DeleteRouteConfig, resourceConfig))
        break

      case 'restore':
        fastifyApp.post(`${basePath}/:id/restore`, baseOpts,
          makeRestoreHandler(resolveModel, parsedSchema, routeDef.config as RestoreRouteConfig, resourceConfig))
        break

      case 'purge':
        fastifyApp.delete(`${basePath}/:id/purge`, baseOpts,
          makePurgeHandler(resolveModel, parsedSchema, routeDef.config as PurgeRouteConfig, resourceConfig))
        break
    }
  }

  return schemaRouteInstance
}
