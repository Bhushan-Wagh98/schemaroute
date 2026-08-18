/**
 * @file index.ts
 * @description Fastify adapter entry point for SchemaRoute.
 *
 * `createAPI` is the single public function — it registers all CRUD routes and
 * any user-defined custom routes on a Fastify instance.
 *
 * Architecture mirrors `@schemaroute/express` exactly:
 *   1. Custom routes registered first — prevents `/:id` catching named paths
 *   2. CRUD routes — each operation delegated to its own handler factory
 *
 * All shared logic (model registration, connection guard, soft delete, ObjectId
 * validation, populate normalisation) is imported from `@schemaroute/core`.
 * The only Fastify-specific code is the route registration API and the
 * request/response helpers in `./http/response.ts`.
 *
 * Package structure:
 *   src/
 *   ├── index.ts              ← this file — route registration only
 *   ├── soft-delete.ts        ← re-exports from @schemaroute/core
 *   ├── handlers/
 *   │   ├── get-all.ts        ← GET /:resource
 *   │   ├── get-one.ts        ← GET /:resource/:id
 *   │   ├── create.ts         ← POST /:resource
 *   │   ├── update.ts         ← PUT /:resource/:id
 *   │   ├── patch.ts          ← PATCH /:resource/:id
 *   │   ├── delete.ts         ← DELETE /:resource/:id
 *   │   └── index.ts          ← re-exports all handlers
 *   └── http/
 *       └── response.ts       ← sendSuccess / sendError / isDisconnectedError
 */

import type { FastifyInstance } from 'fastify'
import type { Schema, Mongoose } from 'mongoose'
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
  GetAllRouteConfig,
  GetOneRouteConfig,
  CreateRouteConfig,
  UpdateRouteConfig,
  PatchRouteConfig,
  DeleteRouteConfig,
} from '@schemaroute/core'
import {
  makeGetAllHandler,
  makeGetOneHandler,
  makeCreateHandler,
  makeUpdateHandler,
  makePatchHandler,
  makeDeleteHandler,
} from './handlers/index'

/**
 * Registers auto-generated CRUD routes for a Mongoose schema on a Fastify instance.
 *
 * Works identically to `@schemaroute/express`'s `createAPI` — same config,
 * same hooks, same soft delete, same scope — only the framework binding differs.
 *
 * @param fastifyApp       - Fastify instance.
 * @param mongooseSchema   - Mongoose schema to generate routes from.
 * @param resourceName     - Plural resource name used as the URL base path.
 * @param resourceConfig   - Optional resource-level configuration.
 * @param mongooseInstance - Your mongoose instance — must already be connected.
 *
 * @throws {Error} If called before `mongoose.connect()` has resolved.
 *
 * @example
 * import Fastify  from 'fastify'
 * import mongoose from 'mongoose'
 * import { createAPI } from '@schemaroute/fastify'
 *
 * const app = Fastify()
 * const ProductSchema = new mongoose.Schema({ name: String, price: Number })
 *
 * mongoose.connect(process.env.MONGO_URI).then(() => {
 *   createAPI(app, ProductSchema, 'products', {}, mongoose)
 *   app.listen({ port: 3000 })
 * })
 */
export function createAPI(
  fastifyApp:        FastifyInstance,
  mongooseSchema:    Schema,
  resourceName:      string,
  resourceConfig:    ResourceConfig = {},
  mongooseInstance?: Mongoose
): SchemaRouteInstance {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mongooseRef = mongooseInstance ?? (require('mongoose') as Mongoose)

  // Throws a descriptive error if called before mongoose.connect() resolves
  assertConnected(resourceName, mongooseRef)

  const schemaRouteInstance      = createSchemaRoute(mongooseSchema, resourceName, resourceConfig)
  const { parsedSchema, routes } = schemaRouteInstance
  const modelName                = deriveModelName(resourceName)

  // Register on both global and connection registries for Atlas populate support
  registerModel(mongooseRef, modelName, mongooseSchema)

  // Lazy model factory — resolves at request time, throws typed error on disconnect
  const resolveModel = makeResolveModel(mongooseRef, modelName)
  const basePath     = `/${resourceName}`

  // ── Pass 1: Custom routes first ───────────────────────────────────────────
  // Must be registered before /:id routes to prevent Fastify matching
  // named paths like /products/active as /products/:id
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

    switch (routeDef.operation) {
      case 'getAll':
        fastifyApp.get(basePath,
          makeGetAllHandler(resolveModel, parsedSchema, routeDef.config as GetAllRouteConfig, resourceConfig)
        )
        break

      case 'getOne':
        fastifyApp.get(`${basePath}/:id`,
          makeGetOneHandler(resolveModel, parsedSchema, routeDef.config as GetOneRouteConfig, resourceConfig)
        )
        break

      case 'create':
        fastifyApp.post(basePath,
          makeCreateHandler(resolveModel, parsedSchema, routeDef.config as CreateRouteConfig, resourceConfig)
        )
        break

      case 'update':
        fastifyApp.put(`${basePath}/:id`,
          makeUpdateHandler(resolveModel, parsedSchema, routeDef.config as UpdateRouteConfig, resourceConfig)
        )
        break

      case 'patch':
        fastifyApp.patch(`${basePath}/:id`,
          makePatchHandler(resolveModel, parsedSchema, routeDef.config as PatchRouteConfig, resourceConfig)
        )
        break

      case 'delete':
        fastifyApp.delete(`${basePath}/:id`,
          makeDeleteHandler(resolveModel, parsedSchema, routeDef.config as DeleteRouteConfig, resourceConfig)
        )
        break
    }
  }

  return schemaRouteInstance
}
