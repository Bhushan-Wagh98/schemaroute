/**
 * @file index.ts
 * @description Shared TypeScript types for the SchemaRoute ecosystem.
 *
 * This package has zero runtime dependencies — it is types only.
 * All other @schemaroute packages import their shared types from here.
 */

// ─── HTTP ─────────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

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

// ─── Route Config ─────────────────────────────────────────────────────────────

interface BaseRouteConfig {
  enabled?:    boolean
  public?:     boolean
  middleware?: MiddlewareFn[]
  rateLimit?:  RateLimitOption
}

export interface GetAllRouteConfig extends BaseRouteConfig, Hooks {
  pagination?:  PaginationMode
  search?:      SearchMode
  searchField?: string
  sort?:        boolean
  fields?:      boolean
  select?:      string[]
  exclude?:     string[]
  populate?:    string[]
  transform?:   TransformFn
}

export interface GetOneRouteConfig extends BaseRouteConfig {
  select?:    string[]
  exclude?:   string[]
  populate?:  string[]
  transform?: TransformFn
}

export interface CreateRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeCreate' | 'afterCreate'> {
  validation?: boolean
  transform?:  TransformFn
}

export interface UpdateRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeUpdate' | 'afterUpdate'> {
  validation?: boolean
  transform?:  TransformFn
}

export interface DeleteRouteConfig extends BaseRouteConfig, Pick<Hooks, 'beforeDelete' | 'afterDelete'> {}

export interface CustomRoute {
  method:      HttpMethod
  path:        string
  handler:     MiddlewareFn
  middleware?: MiddlewareFn[]
  validation?: boolean
}

export interface ResourceConfig {
  pagination?: PaginationMode
  search?:     SearchMode
  populate?:   string[]
  response?:   ResponseShapeFn
  exclude?:    string[]
  select?:     string[]
  transform?:  TransformFn
  routes?: {
    getAll?:  GetAllRouteConfig
    getOne?:  GetOneRouteConfig
    create?:  CreateRouteConfig
    update?:  UpdateRouteConfig
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
  operation:  'getAll' | 'getOne' | 'create' | 'update' | 'delete' | 'custom'
  middleware: MiddlewareFn[]
  rateLimit?: RateLimitOption
  config:     GetAllRouteConfig | GetOneRouteConfig | CreateRouteConfig | UpdateRouteConfig | DeleteRouteConfig | CustomRoute
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
