/**
 * @file types.ts
 * @description Re-exports all shared types from @schemaroute/common and
 * overrides SchemaRouteInstance with the Mongoose-typed schema field.
 *
 * All consumers of @schemaroute/core can import types from here directly —
 * they do not need to install @schemaroute/common separately.
 */

import type { Schema } from 'mongoose'
import type { SchemaRouteInstance as BaseSchemaRouteInstance } from '@schemaroute/common'

export type {
  HttpMethod,
  MiddlewareFn,
  BuiltInRateLimit,
  RateLimitOption,
  RequestContext,
  Hooks,
  PaginationMode,
  SearchMode,
  TransformFn,
  ResponseMeta,
  ResponseShapeFn,
  DefaultResponse,
  ErrorResponse,
  ValidationError,
  GetAllRouteConfig,
  GetOneRouteConfig,
  CreateRouteConfig,
  UpdateRouteConfig,
  DeleteRouteConfig,
  CustomRoute,
  ResourceConfig,
  FieldType,
  ParsedField,
  ParsedSchema,
  RouteDefinition,
} from '@schemaroute/common'

/**
 * SchemaRouteInstance with the Mongoose `Schema` type for the `schema` field.
 * Extends the base interface from @schemaroute/common which uses `unknown`
 * to keep that package free of a Mongoose dependency.
 */
export interface SchemaRouteInstance extends Omit<BaseSchemaRouteInstance, 'schema'> {
  schema: Schema
}
