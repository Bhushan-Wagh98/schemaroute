/**
 * @file query/types.ts
 * @description Types specific to the query resolution pipeline.
 * Kept separate from the main `types.ts` to avoid bloating the public API
 * with internal query-handling concerns.
 */

// ─── Raw Query Params ─────────────────────────────────────────────────────────

/**
 * Shape of the raw query string parameters accepted by list endpoints.
 * Reserved keys are consumed by the query handler and never treated as filters.
 */
export interface QueryParams {
  [key: string]: unknown
  // Sorting
  sort?:        string
  order?:       'asc' | 'desc'
  // Field selection
  fields?:      string
  // Search
  search?:      string
  searchField?: string
  // Pagination
  page?:        string
  limit?:       string
  cursor?:      string
  // Populate
  populate?:    string
}

// ─── Resolved Query ───────────────────────────────────────────────────────────

/** Fully resolved query ready to be applied to a Mongoose query builder. */
export interface ResolvedQuery {
  /** MongoDB filter object built from field params and search conditions. */
  filter:     Record<string, unknown>
  /** MongoDB sort object (e.g. `{ createdAt: -1 }`). */
  sort:       Record<string, 1 | -1>
  /** MongoDB projection object, or `null` when no projection is needed. */
  projection: Record<string, 0 | 1> | null
  /** Validated ref field names to populate. */
  populate:   string[]
  /** Resolved pagination state, or `null` when pagination is disabled. */
  pagination: PagePagination | CursorPagination | null
  /** Validation errors collected during query resolution. */
  errors:     string[]
}

// ─── Pagination State ─────────────────────────────────────────────────────────

/** Resolved state for offset-based (page) pagination. */
export interface PagePagination {
  type:  'page'
  page:  number
  limit: number
  /** Pre-calculated skip value: `(page - 1) * limit`. */
  skip:  number
}

/** Resolved state for cursor-based pagination. */
export interface CursorPagination {
  type:   'cursor'
  /** The `_id` cursor from the last document of the previous page, or `null` for page 1. */
  cursor: string | null
  limit:  number
}
