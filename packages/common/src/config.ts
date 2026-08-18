/**
 * @file config.ts
 * @description Resource and route configuration types.
 *
 * The 3-layer override system:
 *   Global defaults → Resource config → Route config (most specific, always wins)
 *
 * All fields are optional. Omitting them falls back to the next layer up.
 */

import type { MiddlewareFn, RateLimitOption, PaginationMode, SearchMode } from './http'
import type { Hooks } from './hooks'
import type { TransformFn, ResponseShapeFn } from './response'

// ─── Populate ─────────────────────────────────────────────────────────────────

/**
 * Populate a ref field and optionally restrict which sub-document fields are
 * returned. Use the object form to prevent sensitive fields (e.g. `password`,
 * `__v`) from leaking through populated refs.
 *
 * @example
 * populate: ['category']                              // full referenced document
 * populate: [{ path: 'category', select: 'name slug' }]  // restricted fields only
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
 * for the same path — a server-side select restriction cannot be overridden
 * by the client.
 */
export type PopulateOption = string | PopulateFieldConfig

// ─── Scope ────────────────────────────────────────────────────────────────────

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
 * Applied to: getAll (filter), getOne (filter), create (body), update (filter),
 * patch (filter), delete (filter). Cross-scope reads/writes return 404 — not 403.
 *
 * @example
 * scope: (req) => ({ tenantId: (req as Request).headers['x-tenant-id'] })
 */
export type ScopeFn = (req: Record<string, unknown>) => Record<string, unknown>

// ─── Soft Delete ──────────────────────────────────────────────────────────────

/**
 * Soft delete field name configuration. Both fields must exist on the Mongoose
 * schema before enabling soft delete — SchemaRoute does not add them automatically.
 */
export interface SoftDeleteConfig {
  /** The Date field set to `new Date()` on soft-delete. Default: `'deletedAt'`. */
  field?:     string
  /** The Boolean field set to `true` on soft-delete. Default: `'isDeleted'`. */
  flagField?: string
}

/**
 * Pass `true` to use default field names (`deletedAt` / `isDeleted`),
 * or a `SoftDeleteConfig` object to customise the field names.
 */
export type SoftDeleteOption = boolean | SoftDeleteConfig

// ─── Validation Error ─────────────────────────────────────────────────────────

/** A single field-level validation error returned in 422 responses. */
export interface ValidationError {
  field:   string
  message: string
}

// ─── Base Route Config ────────────────────────────────────────────────────────

/**
 * Base options shared by every auto-generated route.
 * All fields are optional — omitting them falls back to resource-level or
 * global defaults via the 3-layer override system.
 */
interface BaseRouteConfig {
  /** Set `false` to disable this route entirely. Default: `true`. */
  enabled?:    boolean
  /** Mark route as public — informational only, does not bypass middleware. Default: `false`. */
  public?:     boolean
  /** Middleware chain run before the handler. User-supplied — SchemaRoute does not provide auth. */
  middleware?: MiddlewareFn[]
  /** Rate limit for this route. Object syntax uses the built-in limiter; array syntax brings your own. */
  rateLimit?:  RateLimitOption
}

// ─── Per-Route Configs ────────────────────────────────────────────────────────

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
 * For partial updates, use `PATCH` instead.
 */
export interface UpdateRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeUpdate' | 'afterUpdate'> {
  validation?: boolean
  transform?:  TransformFn
}

/**
 * Config for `PATCH /:resource/:id` — partial document update via `$set`.
 * Only the fields present in the request body are written — absent fields
 * are left unchanged. When `validation: true`, only the provided fields are
 * validated; required-field checks are skipped for absent fields.
 */
export interface PatchRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeUpdate' | 'afterUpdate'> {
  validation?: boolean
  transform?:  TransformFn
}

/** Config for `DELETE /:resource/:id` — hard or soft delete with optional lifecycle hooks. */
export interface DeleteRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeDelete' | 'afterDelete'> {}

/**
 * Config for `POST /:resource/:id/restore` — restores a soft-deleted document.
 * Only available when `softDelete` is enabled on the resource.
 * Disabled by default — opt in via `routes.restore: { enabled: true }`.
 *
 * Returns 404 when the document does not exist or is not soft-deleted.
 * Scope is applied — cross-tenant restores return 404.
 */
export interface RestoreRouteConfig extends BaseRouteConfig {
  afterRestore?: (doc: Record<string, unknown>, ctx: import('./hooks').RequestContext) => Promise<void> | void
}

/**
 * Config for `DELETE /:resource/:id/purge` — permanently removes a soft-deleted document.
 * Only available when `softDelete` is enabled on the resource.
 * Disabled by default — opt in via `routes.purge: { enabled: true }`.
 *
 * Returns 404 when the document does not exist or is not already soft-deleted.
 * Scope is applied — cross-tenant purges return 404.
 */
export interface PurgeRouteConfig extends BaseRouteConfig {
  beforePurge?: (doc: Record<string, unknown>, ctx: import('./hooks').RequestContext) => Promise<void> | void
  afterPurge?:  (doc: Record<string, unknown>, ctx: import('./hooks').RequestContext) => Promise<void> | void
}

/**
 * A custom route registered outside the auto-generated CRUD set.
 * Custom routes are registered before `/:id` routes to prevent Express
 * matching named paths (e.g. `/products/active`) as `/:id`.
 *
 * HEAD is available here for existence-check endpoints that return headers
 * only with no response body.
 */
export interface CustomRoute {
  method:      import('./http').HttpMethod
  path:        string
  handler:     MiddlewareFn
  middleware?: MiddlewareFn[]
  validation?: boolean
}

// ─── Resource Config ──────────────────────────────────────────────────────────

/** Top-level resource configuration passed to `createAPI`. All fields are optional. */
export interface ResourceConfig {
  pagination?:  PaginationMode
  search?:      SearchMode
  populate?:    PopulateOption[]
  response?:    ResponseShapeFn
  exclude?:     string[]
  select?:      string[]
  /**
   * Read whitelist — only these fields are returned in API responses.
   * Applied as the final gate after transform and populate, so sensitive fields
   * (password, tokens, internal flags) can never leak regardless of what other
   * pipeline stages return. `_id` is always included unless explicitly omitted.
   *
   * @example
   * expose: ['name', 'price', 'status']  // password, __v, etc. never sent
   */
  expose?:      string[]
  /**
   * Write whitelist — only these fields are accepted in POST/PUT/PATCH bodies.
   * Applied as the first gate before scope, hooks, and DB writes, so
   * server-controlled fields (role, createdBy, isDeleted) can never be set
   * by clients regardless of what they send.
   *
   * @example
   * writable: ['name', 'price', 'status']  // createdBy, role, etc. cannot be set by clients
   */
  writable?:    string[]
  transform?:   TransformFn
  /** Enable diagnostic logging. Default: `false`. Silent in production. */
  debug?:       boolean
  /**
   * URL prefix applied to all auto-generated routes for this resource.
   * Trailing slash is stripped — `'/v1/'` and `'/v1'` both produce `/v1/products`.
   * Custom routes define their own full path and are unaffected.
   *
   * @example
   * prefix: '/v1'  // generates /v1/products, /v1/products/:id, etc.
   */
  prefix?:      string
  /**
   * Maximum request body size for write routes (POST, PUT, PATCH).
   * Accepts a number (bytes) or a string with a unit suffix (`'100kb'`, `'1mb'`).
   * GET and DELETE routes are never affected.
   *
   * @example
   * maxBodySize: '50kb'
   */
  maxBodySize?: string | number
  /**
   * Scope function — return value is merged into every query filter and
   * create/update body. Use for multitenancy. Cross-scope reads/writes
   * return 404 — not 403 — so other tenants' existence is not revealed.
   *
   * @example
   * scope: (req) => ({ tenantId: (req as any).user?.tenantId })
   */
  scope?:       ScopeFn
  /**
   * Enable soft delete — `DELETE /:id` sets `deletedAt`/`isDeleted` instead
   * of removing the document. All reads automatically exclude soft-deleted docs.
   * Pass `true` for default field names, or an object to customise them.
   */
  softDelete?:  SoftDeleteOption
  routes?: {
    getAll?:   GetAllRouteConfig
    getOne?:   GetOneRouteConfig
    create?:   CreateRouteConfig
    update?:   UpdateRouteConfig
    patch?:    PatchRouteConfig
    delete?:   DeleteRouteConfig
    /** Restore a soft-deleted document. Only active when `softDelete` is enabled. Disabled by default. */
    restore?:  RestoreRouteConfig
    /** Permanently delete a soft-deleted document. Only active when `softDelete` is enabled. Disabled by default. */
    purge?:    PurgeRouteConfig
  }
  custom?: CustomRoute[]
}
