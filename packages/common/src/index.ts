/**
 * @file index.ts
 * @description Shared TypeScript types for the SchemaRoute ecosystem.
 *
 * This package has zero runtime dependencies — it is types only.
 * All other @schemaroute packages import their shared types from here.
 */

// ─── HTTP ─────────────────────────────────────────────────────────────────────

/**
 * HTTP methods supported by SchemaRoute.
 *
 * Standard CRUD methods (GET, POST, PUT, PATCH, DELETE) are used by the
 * auto-generated routes. HEAD is available for custom routes only — it behaves
 * like GET but the server omits the response body, useful for existence checks
 * and cache validation without transferring data.
 *
 * Not included and why:
 *   OPTIONS — Express handles CORS preflight automatically; no app-level ownership needed.
 *   CONNECT — TCP tunnel for SSL proxies; not an application-layer concern.
 *   TRACE   — Diagnostic loop-back; disabled by default in most frameworks for security.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'

// ─── Middleware ───────────────────────────────────────────────────────────────

export type MiddlewareFn = (req: any, res: any, next: any) => void

// ─── Rate Limiting ────────────────────────────────────────────────────────────

export interface BuiltInRateLimit {
  max:    number
  window: string
}

export type RateLimitOption = BuiltInRateLimit | MiddlewareFn[]

// ─── Request Context ──────────────────────────────────────────────────────────

export interface RequestContext {
  headers: Record<string, string | string[] | undefined>
  query:   Record<string, unknown>
  params:  Record<string, string>
  user?:   Record<string, unknown>
  req:     Record<string, unknown>
}

// ─── Lifecycle Hooks ──────────────────────────────────────────────────────────

export interface Hooks {
  beforeCreate?: (data: Record<string, unknown>, ctx: RequestContext) => Promise<Record<string, unknown>> | Record<string, unknown>
  afterCreate?:  (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
  beforeUpdate?: (data: Record<string, unknown>, ctx: RequestContext) => Promise<Record<string, unknown>> | Record<string, unknown>
  afterUpdate?:  (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
  beforeDelete?: (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
  afterDelete?:  (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export type PaginationMode = 'page' | 'cursor' | 'both' | false

// ─── Search ───────────────────────────────────────────────────────────────────

export type SearchMode = 'all-fields' | 'single-field' | false

// ─── Transform & Response ─────────────────────────────────────────────────────

export type TransformFn = (doc: Record<string, unknown>) => Record<string, unknown>

export interface ResponseMeta {
  page?:       number
  limit?:      number
  total?:      number
  totalPages?: number
  cursor?:     string
  nextCursor?: string
  [key: string]: unknown
}

export type ResponseShapeFn = (data: unknown, meta: ResponseMeta) => Record<string, unknown>

export interface DefaultResponse {
  success: boolean
  data:    unknown
  meta?:   ResponseMeta
}

export interface ErrorResponse {
  success: false
  error:   string
  details?: ValidationError[]
}

export interface ValidationError {
  field:   string
  message: string
}

// ─── Scope (Multitenancy) ─────────────────────────────────────────────────────

/**
 * A function that returns a filter object automatically merged into every
 * query and every create/update body for a resource. Used for multitenancy —
 * restricts all operations to the current request's tenant/user without
 * repeating the filter in every hook.
 *
 * The `req` argument is typed as `Record<string, unknown>` to keep this
 * package framework-agnostic. Cast to the framework's request type inside
 * the function body.
 *
 * Scope is applied to:
 *   - `getAll`  — merged into the MongoDB filter
 *   - `getOne`  — merged into the find filter (cross-tenant reads return 404)
 *   - `create`  — merged into the document body (auto-tags new docs)
 *   - `update`  — merged into the find filter (cross-tenant writes return 404)
 *   - `patch`   — merged into the find filter (cross-tenant writes return 404)
 *   - `delete`  — merged into the find filter (cross-tenant deletes return 404)
 *
 * @example
 * // Restrict all operations to the current tenant
 * scope: (req) => ({ tenantId: (req as Request).headers['x-tenant-id'] })
 *
 * // Restrict to the authenticated user's own documents
 * scope: (req) => ({ userId: (req as Request).user?.id })
 */
export type ScopeFn = (req: Record<string, unknown>) => Record<string, unknown>

// ─── Soft Delete ──────────────────────────────────────────────────────────────

/**
 * Soft delete configuration. When enabled, `DELETE /:id` sets `deletedAt` and
 * `isDeleted` on the document instead of removing it from the database.
 * All `getAll` and `getOne` queries automatically exclude soft-deleted documents.
 *
 * The fields must exist on the Mongoose schema — SchemaRoute does not add them
 * automatically. Add them to your schema before enabling soft delete:
 *
 * @example
 * const ProductSchema = new Schema({
 *   name:      String,
 *   deletedAt: { type: Date,    default: null },
 *   isDeleted: { type: Boolean, default: false },
 * })
 *
 * createAPI(app, ProductSchema, 'products', { softDelete: true }, mongoose)
 *
 * // Custom field names
 * createAPI(app, PostSchema, 'posts', {
 *   softDelete: { field: 'archivedAt', flagField: 'archived' }
 * }, mongoose)
 */
export interface SoftDeleteConfig {
  /**
   * The Date field set to `new Date()` when a document is soft-deleted.
   * Default: `'deletedAt'`.
   */
  field?:     string
  /**
   * The Boolean field set to `true` when a document is soft-deleted.
   * Default: `'isDeleted'`.
   */
  flagField?: string
}

/**
 * Pass `true` to use default field names (`deletedAt` / `isDeleted`),
 * or a `SoftDeleteConfig` object to customise the field names.
 */
export type SoftDeleteOption = boolean | SoftDeleteConfig

// ─── Route Config ─────────────────────────────────────────────────────────────

/**
 * Base options shared by every auto-generated route.
 * All fields are optional — omitting them falls back to resource-level or
 * global defaults via the 3-layer override system.
 */
interface BaseRouteConfig {
  /** Set `false` to disable this route entirely. Default: `true`. */
  enabled?:    boolean
  /** Set `true` to bypass all middleware (auth, rate limiting, etc.). Default: `false`. */
  public?:     boolean
  /** Express middleware to run before the handler. User-supplied — SchemaRoute does not provide auth. */
  middleware?: MiddlewareFn[]
  /** Rate limit for this route. Object syntax uses the built-in limiter; array syntax brings your own middleware. */
  rateLimit?:  RateLimitOption
}

/** Config for `GET /:resource` — list endpoint with filtering, search, sort, pagination, and population. */
export interface GetAllRouteConfig extends BaseRouteConfig, Hooks {
  pagination?:  PaginationMode
  search?:      SearchMode
  searchField?: string
  sort?:        boolean
  fields?:      boolean
  select?:      string[]
  exclude?:     string[]
  populate?:    PopulateOption[]
  transform?:   TransformFn
}

// ─── Populate ─────────────────────────────────────────────────────────────────

/**
 * Populate a ref field and optionally restrict which sub-document fields are
 * returned. Use the object form to prevent sensitive fields (e.g. `password`,
 * `__v`) from leaking through populated refs.
 *
 * @example
 * // plain string — returns the full referenced document
 * populate: ['category']
 *
 * // object form — returns only name and slug from the referenced document
 * populate: [{ path: 'category', select: 'name slug' }]
 */
export interface PopulateFieldConfig {
  path:    string
  /** Space-separated field names to include from the populated document. */
  select?: string
}

/**
 * A populate entry is either a plain ref field name (string) or a
 * `PopulateFieldConfig` object that restricts which fields are returned.
 * Config entries take precedence over `?populate=` query param entries
 * for the same path — allowing the config to enforce a select restriction
 * that the client cannot override.
 */
export type PopulateOption = string | PopulateFieldConfig

/** Config for `GET /:resource/:id` — single document by ID with population and field projection. */
export interface GetOneRouteConfig extends BaseRouteConfig {
  select?:    string[]
  exclude?:   string[]
  populate?:  PopulateOption[]
  transform?: TransformFn
}

/** Config for `POST /:resource` — create a new document with optional validation and lifecycle hooks. */
export interface CreateRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeCreate' | 'afterCreate'> {
  validation?: boolean
  transform?:  TransformFn
}

/**
 * Config for `PUT /:resource/:id` — full document replacement.
 * When `validation: true`, all required schema fields must be present in the body.
 * For partial updates where only some fields are sent, use `PATCH` instead.
 */
export interface UpdateRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeUpdate' | 'afterUpdate'> {
  validation?: boolean
  transform?:  TransformFn
}

/**
 * Config for `PATCH /:resource/:id` — partial document update via `$set`.
 * Unlike PUT, only the fields present in the request body are written —
 * absent fields are left unchanged in the document.
 * When `validation: true`, only the provided fields are validated;
 * required-field checks are skipped for fields not included in the body.
 */
export interface PatchRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeUpdate' | 'afterUpdate'> {
  validation?: boolean
  transform?:  TransformFn
}

/** Config for `DELETE /:resource/:id` — hard or soft delete with optional lifecycle hooks. */
export interface DeleteRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeDelete' | 'afterDelete'> {}

/**
 * A custom route registered outside the auto-generated CRUD set.
 * Custom routes are registered before `/:id` routes to prevent Express
 * matching named paths (e.g. `/products/active`) as `/:id`.
 *
 * HEAD is available here for existence-check endpoints that should return
 * headers only with no response body.
 */
export interface CustomRoute {
  method:      HttpMethod
  path:        string
  handler:     MiddlewareFn
  middleware?: MiddlewareFn[]
  validation?: boolean
}

export interface ResourceConfig {
  pagination?:  PaginationMode
  search?:      SearchMode
  populate?:    PopulateOption[]
  response?:    ResponseShapeFn
  exclude?:     string[]
  select?:      string[]
  /**
   * Whitelist of fields exposed in API responses. When set, only these fields
   * are returned — all other fields are stripped before the response is sent.
   * Takes precedence over `exclude`. Applied after transform.
   *
   * @example
   * expose: ['name', 'price', 'status']  // _id, __v, password, etc. never leak
   */
  expose?:      string[]
  transform?:   TransformFn
  /** Enable diagnostic logging from the SchemaRoute library. Default: `false`. */
  debug?:       boolean
  /**
   * URL prefix applied to all auto-generated routes for this resource.
   * Use for API versioning — all routes will be registered under this prefix.
   *
   * @example
   * prefix: '/v1'  // generates /v1/products, /v1/products/:id, etc.
   */
  prefix?:      string
  /**
   * Maximum request body size for write routes (POST, PUT, PATCH).
   * Accepts a number (bytes) or a string with a unit suffix (e.g. `'100kb'`, `'1mb'`).
   * Prevents malicious clients from sending arbitrarily large payloads.
   * Default: Express default (`'100kb'`).
   *
   * @example
   * maxBodySize: '50kb'
   */
  maxBodySize?: string | number
  /**
   * Scope function — auto-applied to every query filter and create/update body.
   * Use for multitenancy: restrict all operations to the current user's data
   * without repeating the filter in every hook for every resource.
   *
   * @example
   * scope: (req) => ({ tenantId: (req as any).user?.tenantId })
   */
  scope?:       ScopeFn
  /**
   * Enable soft delete — `DELETE /:id` sets `deletedAt`/`isDeleted` instead
   * of removing the document. All reads automatically exclude soft-deleted docs.
   * Pass `true` to use default field names, or an object to customise them.
   */
  softDelete?:  SoftDeleteOption
  routes?: {
    getAll?:  GetAllRouteConfig
    getOne?:  GetOneRouteConfig
    create?:  CreateRouteConfig
    update?:  UpdateRouteConfig
    patch?:   PatchRouteConfig
    delete?:  DeleteRouteConfig
  }
  custom?: CustomRoute[]
}

// ─── Parsed Schema ────────────────────────────────────────────────────────────

export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'objectid'
  | 'array'
  | 'object'
  | 'mixed'

export interface ParsedField {
  name:       string
  type:       FieldType
  required:   boolean
  enum?:      unknown[]
  min?:       number
  max?:       number
  minlength?: number
  maxlength?: number
  ref?:       string
  isArray:    boolean
  /** Child fields for embedded sub-documents (`type: 'object'`).
   * Populated for both explicit sub-schemas (`address: new Schema({...})`) and
   * inline objects (`address: { street: String }`). Empty or absent for all
   * other field types. When present, the validator recurses into these children
   * using dot-notation error paths (e.g. `address.street`).
   */
  fields?:    ParsedField[]
}

export interface ParsedSchema {
  fields:       ParsedField[]
  stringFields: string[]
  refFields:    string[]
}

// ─── Route Definition ─────────────────────────────────────────────────────────

export interface RouteDefinition {
  method:     HttpMethod
  path:       string
  operation:  'getAll' | 'getOne' | 'create' | 'update' | 'patch' | 'delete' | 'custom'
  middleware: MiddlewareFn[]
  rateLimit?: RateLimitOption
  config:     GetAllRouteConfig | GetOneRouteConfig | CreateRouteConfig | UpdateRouteConfig | PatchRouteConfig | DeleteRouteConfig | CustomRoute
}

// ─── SchemaRoute Instance ─────────────────────────────────────────────────────

/**
 * Return value of `createSchemaRoute` / `createAPI`.
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
