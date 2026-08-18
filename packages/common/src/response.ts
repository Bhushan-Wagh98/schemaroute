/**
 * @file response.ts
 * @description Response shape types — the default envelope, error format,
 * and the customisation hook for reshaping responses per resource.
 */

import type { ValidationError } from './config'

/** Pagination and cursor metadata included in list responses. */
export interface ResponseMeta {
  page?:       number
  limit?:      number
  total?:      number
  totalPages?: number
  cursor?:     string
  nextCursor?: string
  [key: string]: unknown
}

/**
 * Custom response shape function. When set on a resource, SchemaRoute calls
 * this instead of building the default `{ success, data, meta }` envelope.
 *
 * @example
 * response: (data, meta) => ({ result: data, pagination: meta, ok: true })
 */
export type ResponseShapeFn = (data: unknown, meta: ResponseMeta) => Record<string, unknown>

/** Default response envelope returned by all CRUD routes. */
export interface DefaultResponse {
  success: boolean
  data:    unknown
  meta?:   ResponseMeta
}

/**
 * Standard error response shape — consistent across all routes and not
 * currently overridable. `details` is present on validation errors (422).
 */
export interface ErrorResponse {
  success: false
  error:   string
  details?: ValidationError[]
}

/** Document transform function — reshapes a single lean document before it is sent. */
export type TransformFn = (doc: Record<string, unknown>) => Record<string, unknown>
