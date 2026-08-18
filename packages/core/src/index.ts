/**
 * @file index.ts
 * @description Public API for @schemaroute/core.
 *
 * Core is framework-agnostic — it parses Mongoose schemas, builds route
 * descriptors, validates request bodies, and resolves query parameters.
 * Framework adapters (e.g. @schemaroute/express) consume the output of
 * `createSchemaRoute` to register actual HTTP routes.
 */

import type { Schema } from 'mongoose'
import { parseSchema } from './schema-parser'
import { buildRoutes }  from './route-builder'
import type { ResourceConfig, SchemaRouteInstance } from './types'

/**
 * Parses a Mongoose schema and builds the framework-agnostic route descriptors
 * for a resource. The returned `SchemaRouteInstance` is consumed by adapters
 * such as `@schemaroute/express` to register routes on a real HTTP server.
 *
 * @param schema       - The Mongoose schema to generate routes from.
 * @param resourceName - Plural resource name used as the URL base path (e.g. `'products'`).
 * @param config       - Optional resource-level configuration.
 * @returns            A `SchemaRouteInstance` containing routes and parsed schema.
 *
 * @example
 * import { createSchemaRoute } from '@schemaroute/core'
 * const instance = createSchemaRoute(ProductSchema, 'products', {
 *   pagination: 'page',
 *   routes: { create: { validation: true } },
 * })
 */
export function createSchemaRoute(
  schema:       Schema,
  resourceName: string,
  config:       ResourceConfig = {}
): SchemaRouteInstance {
  const parsedSchema = parseSchema(schema)
  const routes       = buildRoutes(resourceName, config)

  return { routes, parsedSchema, resourceName, schema, config }
}

export { parseSchema }           from './schema-parser'
export { buildRoutes }           from './route-builder'
export { validate }              from './validator'
export { resolveQuery, buildMeta } from './query/index'
export { deriveModelName, isValidObjectId, toMongoosePopulate, assertConnected, registerModel, makeResolveModel } from './adapter-utils'
export { resolveSoftDeleteFields, buildSoftDeleteUpdate, buildSoftDeleteFilter } from './soft-delete'
export type * from './types'
export type { QueryParams, ResolvedQuery, PagePagination, CursorPagination } from './query/index'
export type { SoftDeleteFields } from './soft-delete'
