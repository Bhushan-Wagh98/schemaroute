/**
 * @file query/filter.ts
 * @description Builds a MongoDB filter object from raw HTTP query parameters.
 * Only allows filtering on known schema fields to prevent query injection.
 */

import type { QueryParams } from './types'

/**
 * Builds a MongoDB filter object from query string parameters.
 * Parameters matching known schema field names are included as equality filters.
 * Reserved query keys (sort, page, search, etc.) are always excluded.
 *
 * @param queryParams        - Raw query string parameters from `req.query`.
 * @param schemaFieldNames   - Set of valid field names from the parsed schema.
 * @param reservedQueryKeys  - Set of keys consumed by the query handler itself.
 * @returns                  A MongoDB-compatible filter object.
 *
 * @example
 * // GET /products?status=active&price=99&page=1
 * // → { status: 'active', price: '99' }  (page is reserved, ignored)
 */
export function buildFieldFilter(
  queryParams:       QueryParams,
  schemaFieldNames:  Set<string>,
  reservedQueryKeys: Set<string>
): Record<string, unknown> {
  const mongoFilter: Record<string, unknown> = {}

  for (const [paramKey, paramValue] of Object.entries(queryParams)) {
    const isSchemaField    = schemaFieldNames.has(paramKey)
    const isReservedKey    = reservedQueryKeys.has(paramKey)

    if (isSchemaField && !isReservedKey) {
      mongoFilter[paramKey] = paramValue
    }
  }

  return mongoFilter
}
