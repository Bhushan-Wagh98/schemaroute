/**
 * @file instance.ts
 * @description RouteDefinition and SchemaRouteInstance — the central objects
 * produced by `createSchemaRoute` and consumed by adapters, docs, and the SDK.
 *
 * `SchemaRouteInstance` is the single source of truth that keeps route
 * definitions, OpenAPI spec, and the typed SDK client in sync.
 */

import type { HttpMethod, MiddlewareFn, RateLimitOption } from './http'
import type {
  GetAllRouteConfig,
  GetOneRouteConfig,
  CreateRouteConfig,
  UpdateRouteConfig,
  PatchRouteConfig,
  DeleteRouteConfig,
  RestoreRouteConfig,
  PurgeRouteConfig,
  CustomRoute,
  ResourceConfig,
} from './config'
import type { ParsedSchema } from './schema'

/**
 * A single framework-agnostic route descriptor produced by `buildRoutes`.
 * Adapters iterate this array to register routes on their HTTP framework.
 */
export interface RouteDefinition {
  method:     HttpMethod
  path:       string
  operation:  'getAll' | 'getOne' | 'create' | 'update' | 'patch' | 'delete' | 'restore' | 'purge' | 'custom'
  middleware: MiddlewareFn[]
  rateLimit?: RateLimitOption
  config:     GetAllRouteConfig | GetOneRouteConfig | CreateRouteConfig | UpdateRouteConfig | PatchRouteConfig | DeleteRouteConfig | RestoreRouteConfig | PurgeRouteConfig | CustomRoute
}

/**
 * Return value of `createSchemaRoute` / `createAPI`.
 * Passed to `@schemaroute/docs` for OpenAPI generation and to `@schemaroute/sdk`
 * for typed client generation — both consume the same instance so they stay
 * in sync with the route config automatically.
 *
 * `schema` is typed as `unknown` here to keep this package free of a Mongoose
 * dependency — `@schemaroute/core` re-exports this with the correct `Schema` type.
 */
export interface SchemaRouteInstance {
  routes:       RouteDefinition[]
  parsedSchema: ParsedSchema
  resourceName: string
  schema:       unknown
  config:       ResourceConfig
}
