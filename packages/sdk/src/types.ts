/**
 * @file types.ts
 * @description Public TypeScript interfaces for @schemaroute/sdk.
 */

import type { ResponseMeta } from '@schemaroute/core'

// ─── SDK Options ──────────────────────────────────────────────────────────────

/**
 * Options passed to `createSDK` to configure the client.
 *
 * @example
 * createSDK('http://localhost:3000', {
 *   headers: { 'x-api-key': 'secret123', 'x-role': 'admin' },
 * })
 */
export interface SDKOptions {
  /**
   * Default headers sent with every request.
   * Useful for auth tokens, API keys, etc.
   */
  headers?: Record<string, string>
}

// ─── Request Params ───────────────────────────────────────────────────────────

/**
 * Query parameters accepted by `getAll`.
 * Field filters are typed as `Record<string, unknown>` — the SDK merges them
 * into the query string alongside the reserved params below.
 */
export interface GetAllParams {
  /** Filter by any schema field — e.g. `{ status: 'active', price: 99 }` */
  filter?:      Record<string, unknown>
  /** Field name to sort by. */
  sort?:        string
  /** Sort direction. */
  order?:       'asc' | 'desc'
  /** Comma-separated field names to include — e.g. `'name,price'` */
  fields?:      string
  /** Search term applied across string fields. */
  search?:      string
  /** Field to search in when the API uses `single-field` search mode. */
  searchField?: string
  /** Page number for page-based pagination. */
  page?:        number
  /** Items per page. */
  limit?:       number
  /** Cursor value for cursor-based pagination. */
  cursor?:      string
  /** Comma-separated ref fields to populate — e.g. `'category'` */
  populate?:    string
  /** Per-request header overrides (merged with SDK-level headers). */
  headers?:     Record<string, string>
}

/** Options accepted by `getOne`. */
export interface GetOneParams {
  /** Per-request header overrides. */
  headers?: Record<string, string>
}

/** Options accepted by `create`. */
export interface CreateParams {
  /** Per-request header overrides. */
  headers?: Record<string, string>
}

/** Options accepted by `update`. */
export interface UpdateParams {
  /** Per-request header overrides. */
  headers?: Record<string, string>
}

/** Options accepted by `delete`. */
export interface DeleteParams {
  /** Per-request header overrides. */
  headers?: Record<string, string>
}

// ─── Responses ────────────────────────────────────────────────────────────────

/** Response returned by `getAll`. */
export interface ListResponse<T> {
  data: T[]
  meta: ResponseMeta
}

/** Response returned by `getOne`, `create`, and `update`. */
export interface SingleResponse<T> {
  data: T
}

/** Response returned by `delete`. */
export interface DeleteResponse {
  data: { id: string }
}

// ─── SDK Error ────────────────────────────────────────────────────────────────

/**
 * Error thrown by the SDK when the server returns a non-2xx response.
 *
 * @example
 * try {
 *   await api.products.create({ name: '' })
 * } catch (err) {
 *   if (err instanceof SDKError) {
 *     console.log(err.status)  // 422
 *     console.log(err.details) // [{ field: 'name', message: 'name is required' }]
 *   }
 * }
 */
export class SDKError extends Error {
  /** HTTP status code returned by the server. */
  status:   number
  /** Server error message. */
  error:    string
  /** Validation error details (present on 422 responses). */
  details?: { field: string; message: string }[]

  constructor(status: number, error: string, details?: { field: string; message: string }[]) {
    super(`[SchemaRoute SDK] ${status}: ${error}`)
    this.name    = 'SDKError'
    this.status  = status
    this.error   = error
    this.details = details
  }
}

// ─── Resource Client Interface ────────────────────────────────────────────────

/**
 * Typed client for a single resource — exposes all five CRUD methods.
 * `T` is the document shape inferred from the resource name and schema.
 */
export interface ResourceClient<T extends Record<string, unknown>> {
  /** Fetch a paginated, filtered, sorted list of documents. */
  getAll(params?: GetAllParams): Promise<ListResponse<T>>
  /** Fetch a single document by its MongoDB ObjectId. */
  getOne(id: string, params?: GetOneParams): Promise<SingleResponse<T>>
  /** Create a new document. */
  create(body: Partial<T>, params?: CreateParams): Promise<SingleResponse<T>>
  /** Update an existing document by ID. */
  update(id: string, body: Partial<T>, params?: UpdateParams): Promise<SingleResponse<T>>
  /** Delete a document by ID. */
  delete(id: string, params?: DeleteParams): Promise<DeleteResponse>
}
