/**
 * @file query/sort.ts
 * @description Builds a MongoDB sort object from `?sort` and `?order` query params.
 * Falls back to `{ createdAt: -1 }` (newest first) when no sort is specified.
 */

import type { QueryParams } from './types'

/**
 * Builds a MongoDB sort object from query parameters.
 * Only allows sorting on known schema fields to prevent arbitrary sort injection.
 *
 * @param queryParams      - Raw query params containing `sort` and `order`.
 * @param schemaFieldNames - Set of valid field names from the parsed schema.
 * @param isSortEnabled    - Whether sorting is enabled for this route.
 * @returns                A MongoDB sort object (e.g. `{ price: -1 }`).
 *
 * @example
 * // GET /products?sort=price&order=desc → { price: -1 }
 * // GET /products                       → { createdAt: -1 }
 */
export function buildSortObject(
  queryParams:      QueryParams,
  schemaFieldNames: Set<string>,
  isSortEnabled?:   boolean
): Record<string, 1 | -1> {
  const requestedSortField = queryParams.sort
  const sortFieldIsValid   = requestedSortField && schemaFieldNames.has(requestedSortField)
  const sortIsAllowed      = isSortEnabled !== false

  if (sortFieldIsValid && sortIsAllowed) {
    const sortDirection: 1 | -1 = queryParams.order === 'desc' ? -1 : 1
    return { [requestedSortField]: sortDirection }
  }

  // Default: newest documents first
  return { createdAt: -1 }
}
