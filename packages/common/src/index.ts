/**
 * @file index.ts
 * @description Public API for @schemaroute/common.
 *
 * This package has zero runtime dependencies — it is types only.
 * All other @schemaroute packages import their shared types from here.
 *
 * Types are split across focused files:
 *   http.ts      — HttpMethod, MiddlewareFn, RateLimitOption, PaginationMode, SearchMode
 *   hooks.ts     — RequestContext, Hooks
 *   schema.ts    — FieldType, ParsedField, ParsedSchema
 *   response.ts  — TransformFn, ResponseMeta, ResponseShapeFn, DefaultResponse, ErrorResponse
 *   config.ts    — PopulateOption, ScopeFn, SoftDeleteOption, ValidationError, all RouteConfigs, ResourceConfig
 *   instance.ts  — RouteDefinition, SchemaRouteInstance
 */

export type * from './http'
export type * from './hooks'
export type * from './schema'
export type * from './response'
export type * from './config'
export type * from './instance'
