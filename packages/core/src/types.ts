/**
 * @file types.ts
 * @description All shared TypeScript interfaces and types for @schemaroute/core.
 *
 * Type hierarchy:
 *   ResourceConfig
 *     └── routes: { getAll, getOne, create, update, delete }
 *           └── each extends the relevant Hooks subset + common route options
 *   RouteDefinition   — framework-agnostic route descriptor built by route-builder
 *   SchemaRouteInstance — full output of createSchemaRoute()
 */

import type { Schema } from 'mongoose'

// ─── HTTP ─────────────────────────────────────────────────────────────────────

/** Supported HTTP methods for route definitions and custom routes. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Generic middleware function signature compatible with Express, Fastify, and
 * other Node.js frameworks. Uses `any` intentionally so typed framework
 * middleware (e.g. `express.RequestHandler`) is directly assignable.
 */
export type MiddlewareFn = (req: any, res: any, next: any) => void

// ─── Rate Limiting ────────────────────────────────────────────────────────────

/**
 * Built-in sliding-window rate limiter config.
 *
 * @example
 * rateLimit: { max: 100, window: '1m' }  // 100 requests per minute
 * rateLimit: { max: 10,  window: '10s' } // 10 requests per 10 seconds
 */
export interface BuiltInRateLimit {
  /** Maximum number of requests allowed within the window. */
  max: number
  /** Time window string — supports 's' (seconds), 'm' (minutes), 'h' (hours). */
  window: string
}

/**
 * Rate limit option — either use the built-in limiter config or supply your
 * own array of middleware (e.g. express-rate-limit).
 */
export type RateLimitOption = BuiltInRateLimit | MiddlewareFn[]

// ─── Request Context ──────────────────────────────────────────────────────────

/**
 * Snapshot of the incoming HTTP request passed as the second argument to all
 * lifecycle hooks. Gives hooks read access to headers, query params, route
 * params, and the authenticated user without coupling to a specific framework.
 *
 * `user` is populated automatically when auth middleware attaches a decoded
 * token to `req.user` before the route handler runs.
 *
 * @example
 * beforeCreate: async (data, ctx) => {
 *   data.createdBy = ctx.user?.id
 *   data.source    = ctx.headers['x-source']
 *   return data
 * }
 */
export interface RequestContext {
  /** All incoming request headers. */
  headers: Record<string, string | string[] | undefined>
  /** Parsed query string parameters (e.g. `?page=2&sort=name`). */
  query:   Record<string, unknown>
  /** Route path parameters (e.g. `{ id: '507f1f77...' }`). */
  params:  Record<string, string>
  /**
   * Authenticated user object — set by your auth middleware via `req.user`.
   * Undefined if no auth middleware is applied to the route.
   */
  user?:   Record<string, unknown>
}

// ─── Lifecycle Hooks ──────────────────────────────────────────────────────────

/**
 * Lifecycle hooks for mutating data or triggering side-effects around
 * create, update, and delete operations.
 *
 * - `before*` hooks receive the request body and must return the (optionally
 *   modified) data object.
 * - `after*` hooks receive the persisted document and are fire-and-forget.
 * - All hooks receive `ctx` as the second argument for access to headers,
 *   query params, and the authenticated user.
 */
export interface Hooks {
  /** Runs before document creation. Return the (modified) data to persist. */
  beforeCreate?: (data: Record<string, unknown>, ctx: RequestContext) => Promise<Record<string, unknown>> | Record<string, unknown>
  /** Runs after document creation. Receives the saved document. */
  afterCreate?:  (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
  /** Runs before document update. Return the (modified) data to persist. */
  beforeUpdate?: (data: Record<string, unknown>, ctx: RequestContext) => Promise<Record<string, unknown>> | Record<string, unknown>
  /** Runs after document update. Receives the updated document. */
  afterUpdate?:  (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
  /** Runs before document deletion. Receives the document about to be deleted. */
  beforeDelete?: (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
  /** Runs after document deletion. Receives the deleted document. */
  afterDelete?:  (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
}

// ─── Pagination ───────────────────────────────────────────────────────────────

/**
 * Pagination strategy for list endpoints.
 * - `'page'`   — offset-based (`?page=2&limit=10`)
 * - `'cursor'` — cursor-based (`?cursor=<id>&limit=10`)
 * - `'both'`   — cursor when `?cursor` is present, page otherwise
 * - `false`    — pagination disabled; all matching documents returned
 */
export type PaginationMode = 'page' | 'cursor' | 'both' | false

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Full-text search strategy for list endpoints.
 * - `'all-fields'`    — searches across all string fields using `$or` + regex
 * - `'single-field'`  — searches a specific field (`?searchField=name`)
 * - `false`           — search disabled
 */
export type SearchMode = 'all-fields' | 'single-field' | false

// ─── Transform ────────────────────────────────────────────────────────────────

/**
 * Document transform function — reshapes a raw Mongoose document before it is
 * sent in the response. Applied after field exclusion and population.
 *
 * @example
 * transform: (doc) => ({ id: doc._id, name: doc.name })
 */
export type TransformFn = (doc: Record<string, unknown>) => Record<string, unknown>

// ─── Response Shape ───────────────────────────────────────────────────────────

/**
 * Custom response envelope function. When provided, replaces the default
 * `{ success, data, meta }` shape with whatever structure you return.
 *
 * @example
 * response: (data, meta) => ({ result: data, pagination: meta })
 */
export type ResponseShapeFn = (
  data: unknown,
  meta: ResponseMeta
) => Record<string, unknown>

/** Pagination and collection metadata included in list responses. */
export interface ResponseMeta {
  page?:       number
  limit?:      number
  total?:      number
  totalPages?: number
  cursor?:     string
  nextCursor?: string
  /** Allows additional custom metadata fields. */
  [key: string]: unknown
}

/** Default success response envelope. */
export interface DefaultResponse {
  success: boolean
  data:    unknown
  meta?:   ResponseMeta
}

/** Error response envelope returned on validation failures and HTTP errors. */
export interface ErrorResponse {
  success: false
  error:   string
  details?: ValidationError[]
}

/** Single field-level validation error. */
export interface ValidationError {
  field:   string
  message: string
}

// ─── Route-level Config ───────────────────────────────────────────────────────

/** Shared options available on every route config. */
interface BaseRouteConfig {
  /** Set to `false` to disable this route entirely. Defaults to `true`. */
  enabled?:    boolean
  /**
   * Marks the route as public. Currently informational — use `middleware` to
   * enforce authentication rather than relying on this flag.
   */
  public?:     boolean
  /** Middleware chain executed before the route handler. */
  middleware?: MiddlewareFn[]
  /** Rate limiting — built-in config or custom middleware array. */
  rateLimit?:  RateLimitOption
}

/** Config for `GET /:resource` — list all documents. */
export interface GetAllRouteConfig extends BaseRouteConfig, Hooks {
  /** Pagination strategy. Overrides the resource-level setting. */
  pagination?:  PaginationMode
  /** Search strategy. Overrides the resource-level setting. */
  search?:      SearchMode
  /** Field to search when `search: 'single-field'`. */
  searchField?: string
  /** Allow `?sort=field&order=asc|desc` query params. */
  sort?:        boolean
  /** Allow `?fields=a,b,c` field selection query param. */
  fields?:      boolean
  /** Default fields to include in the response projection. */
  select?:      string[]
  /** Fields to exclude from the response. Merged with resource-level excludes. */
  exclude?:     string[]
  /** Ref fields to populate. Overrides the resource-level setting. */
  populate?:    string[]
  /** Document transform. Overrides the resource-level transform. */
  transform?:   TransformFn
}

/** Config for `GET /:resource/:id` — fetch a single document. */
export interface GetOneRouteConfig extends BaseRouteConfig {
  /** Default fields to include in the response projection. */
  select?:    string[]
  /** Fields to exclude from the response. */
  exclude?:   string[]
  /** Ref fields to populate. Overrides the resource-level setting. */
  populate?:  string[]
  /** Document transform. Overrides the resource-level transform. */
  transform?: TransformFn
}

/** Config for `POST /:resource` — create a new document. */
export interface CreateRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeCreate' | 'afterCreate'> {
  /** Enable auto-validation against the parsed schema. Defaults to `false`. */
  validation?: boolean
  /** Document transform applied to the created document before response. */
  transform?:  TransformFn
}

/** Config for `PUT /:resource/:id` — replace an existing document. */
export interface UpdateRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeUpdate' | 'afterUpdate'> {
  /** Enable auto-validation against the parsed schema. Defaults to `false`. */
  validation?: boolean
  /** Document transform applied to the updated document before response. */
  transform?:  TransformFn
}

/** Config for `DELETE /:resource/:id` — remove a document. */
export interface DeleteRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeDelete' | 'afterDelete'> {}

// ─── Custom Route ─────────────────────────────────────────────────────────────

/**
 * User-defined route registered alongside the auto-generated CRUD routes.
 * Custom routes are always registered before `/:id` routes to prevent path
 * conflicts (e.g. `/products/active` must not be caught by `/products/:id`).
 *
 * @example
 * custom: [{
 *   method:  'GET',
 *   path:    '/products/active',
 *   handler: async (req, res) => { ... },
 *   middleware: [requireAuth],
 * }]
 */
export interface CustomRoute {
  method:      HttpMethod
  path:        string
  /** The route handler function. */
  handler:     MiddlewareFn
  /** Middleware chain executed before the handler. */
  middleware?: MiddlewareFn[]
  validation?: boolean
}

// ─── Resource Config ──────────────────────────────────────────────────────────

/**
 * Top-level configuration for a resource registered with `createAPI`.
 * All options here act as resource-level defaults and can be overridden
 * per-route inside `routes.*`.
 *
 * @example
 * createAPI(app, ProductSchema, 'products', {
 *   pagination: 'page',
 *   search:     'all-fields',
 *   exclude:    ['__v', 'internalNotes'],
 *   transform:  (doc) => ({ id: doc._id, ...doc }),
 *   routes: {
 *     create: { validation: true, middleware: [requireAuth] },
 *     delete: { middleware: [requireAuth, requireAdmin] },
 *   },
 * })
 */
export interface ResourceConfig {
  /** Default pagination strategy for list routes. */
  pagination?: PaginationMode
  /** Default search strategy for list routes. */
  search?:     SearchMode
  /** Default ref fields to populate across all routes. */
  populate?:   string[]
  /** Custom response envelope function applied to all routes. */
  response?:   ResponseShapeFn
  /** Fields never returned in any response for this resource. */
  exclude?:    string[]
  /** Default fields returned across all routes (inclusion projection). */
  select?:     string[]
  /** Default document transform applied before every response. */
  transform?:  TransformFn
  /** Per-route overrides. */
  routes?: {
    getAll?:  GetAllRouteConfig
    getOne?:  GetOneRouteConfig
    create?:  CreateRouteConfig
    update?:  UpdateRouteConfig
    delete?:  DeleteRouteConfig
  }
  /** Additional user-defined routes registered before `/:id`. */
  custom?: CustomRoute[]
}

// ─── Parsed Schema ────────────────────────────────────────────────────────────

/**
 * Mongoose schema field types normalised to a framework-agnostic string union.
 * Used by the validator and query handler.
 */
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'objectid'
  | 'array'
  | 'object'
  | 'mixed'

/** Normalised representation of a single Mongoose schema path. */
export interface ParsedField {
  /** Field name as defined in the schema. */
  name:       string
  /** Normalised field type. */
  type:       FieldType
  /** Whether the field is required. */
  required:   boolean
  /** Allowed enum values, if defined. */
  enum?:      unknown[]
  /** Minimum numeric value (number fields). */
  min?:       number
  /** Maximum numeric value (number fields). */
  max?:       number
  /** Minimum string length (string fields). */
  minlength?: number
  /** Maximum string length (string fields). */
  maxlength?: number
  /** Referenced model name for ObjectId fields (used for populate). */
  ref?:       string
  /** Whether the field is an array type. */
  isArray:    boolean
}

/** Full parsed representation of a Mongoose schema. */
export interface ParsedSchema {
  /** All parsed fields (excluding `_id` and `__v`). */
  fields:       ParsedField[]
  /** Names of all string-type fields — used for full-text search. */
  stringFields: string[]
  /** Names of all ObjectId ref fields — used for populate validation. */
  refFields:    string[]
}

// ─── Route Definition ─────────────────────────────────────────────────────────

/**
 * Framework-agnostic route descriptor produced by `buildRoutes`.
 * Adapters (e.g. `@schemaroute/express`) consume this to register routes on
 * their respective router.
 */
export interface RouteDefinition {
  method:     HttpMethod
  path:       string
  /** CRUD operation type, or `'custom'` for user-defined routes. */
  operation:  'getAll' | 'getOne' | 'create' | 'update' | 'delete' | 'custom'
  /** Resolved middleware chain (rate limiter + user middleware). */
  middleware: MiddlewareFn[]
  rateLimit?: RateLimitOption
  /** The resolved route config merged with defaults. */
  config:     GetAllRouteConfig | GetOneRouteConfig | CreateRouteConfig | UpdateRouteConfig | DeleteRouteConfig | CustomRoute
}

// ─── SchemaRoute Instance ─────────────────────────────────────────────────────

/**
 * Return value of `createSchemaRoute`. Contains everything an adapter needs
 * to register routes and handle requests.
 */
export interface SchemaRouteInstance {
  /** Framework-agnostic route descriptors. */
  routes:       RouteDefinition[]
  /** Parsed schema used for validation, search, and populate. */
  parsedSchema: ParsedSchema
  /** Plural resource name (e.g. `'products'`). */
  resourceName: string
  /** Original Mongoose schema. */
  schema:       Schema
  /** Resolved resource config. */
  config:       ResourceConfig
}
