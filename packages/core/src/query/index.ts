/**
 * @file query/index.ts
 * @description Public entry point for the query resolution pipeline.
 * Composes the individual query modules (filter, search, sort, projection,
 * populate, pagination) into the single `resolveQuery` function consumed
 * by the `getAll` handler.
 */

import type { ParsedSchema, PaginationMode, SearchMode, ResponseMeta } from '../types'
import type { QueryParams, ResolvedQuery, PagePagination, CursorPagination } from './types'
import { buildFieldFilter }      from './filter'
import { applySearchFilter }     from './search'
import { buildSortObject }       from './sort'
import { buildProjection }       from './projection'
import { resolvePopulateFields } from './populate'
import { resolvePagination, buildResponseMeta } from './pagination'

/** Keys consumed by the query handler — never treated as field filters. */
const RESERVED_QUERY_KEYS = new Set([
  'sort', 'order', 'fields', 'search', 'searchField',
  'page', 'limit', 'cursor', 'populate',
])

/**
 * Resolves raw HTTP query parameters into a structured `ResolvedQuery` object
 * ready to be applied to a Mongoose query builder.
 *
 * @param queryParams  - Raw query string params from `req.query`.
 * @param parsedSchema - Parsed schema for field name and ref field validation.
 * @param options      - Route and resource-level config that shapes the query.
 * @returns            A fully resolved query object.
 */
export function resolveQuery(
  queryParams:  QueryParams,
  parsedSchema: ParsedSchema,
  options: {
    pagination?:  PaginationMode
    search?:      SearchMode
    searchField?: string
    sort?:        boolean
    fields?:      boolean
    select?:      string[]
    exclude?:     string[]
    populate?:    string[]
  }
): ResolvedQuery {
  const schemaFieldNames = new Set(parsedSchema.fields.map(field => field.name))
  const excludedFields   = new Set(['__v', ...(options.exclude ?? [])])

  const mongoFilter = buildFieldFilter(queryParams, schemaFieldNames, RESERVED_QUERY_KEYS)

  if (options.search) {
    applySearchFilter(
      mongoFilter,
      queryParams,
      options.search,
      parsedSchema.stringFields,
      schemaFieldNames,
      options.searchField
    )
  }

  const mongoSort       = buildSortObject(queryParams, schemaFieldNames, options.sort)
  const mongoProjection = buildProjection(
    queryParams,
    schemaFieldNames,
    excludedFields,
    options.select,
    options.fields
  )
  const populateFields  = resolvePopulateFields(
    queryParams,
    options.populate ?? [],
    new Set(parsedSchema.refFields)
  )
  const paginationState = resolvePagination(queryParams, options.pagination)

  return {
    filter:     mongoFilter,
    sort:       mongoSort,
    projection: mongoProjection,
    populate:   populateFields,
    pagination: paginationState,
  }
}

/**
 * Builds the `meta` object included in list responses.
 * Re-exported here so consumers only need to import from `@schemaroute/core`.
 */
export function buildMeta(
  resolvedPagination: PagePagination | CursorPagination | null,
  totalDocumentCount: number,
  nextPageCursor?:    string
): ResponseMeta {
  return buildResponseMeta(resolvedPagination, totalDocumentCount, nextPageCursor)
}

export type { QueryParams, ResolvedQuery, PagePagination, CursorPagination } from './types'
