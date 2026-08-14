/**
 * @file query/search.ts
 * @description Applies full-text search conditions to a MongoDB filter object
 * using case-insensitive regex queries.
 */

import type { SearchMode } from '../types'
import type { QueryParams } from './types'

/**
 * Applies a search condition to an existing MongoDB filter object.
 * Mutates `mongoFilter` in place by adding `$or` (all-fields) or a single
 * field regex condition (single-field).
 *
 * @param mongoFilter      - The filter object to mutate.
 * @param queryParams      - Raw query params containing `search` and `searchField`.
 * @param searchMode       - The search strategy from route/resource config.
 * @param allStringFields  - All string-type field names from the parsed schema.
 * @param schemaFieldNames - Set of all valid schema field names.
 * @param configSearchField- Fallback search field from route config.
 */
export function applySearchFilter(
  mongoFilter:        Record<string, unknown>,
  queryParams:        QueryParams,
  searchMode:         SearchMode,
  allStringFields:    string[],
  schemaFieldNames:   Set<string>,
  configSearchField?: string
): void {
  if (!queryParams.search || !searchMode) return

  const caseInsensitiveRegex = { $regex: queryParams.search, $options: 'i' }

  if (searchMode === 'all-fields') {
    // Search across every string field using $or for broad full-text matching
    if (allStringFields.length > 0) {
      mongoFilter['$or'] = allStringFields.map(fieldName => ({
        [fieldName]: caseInsensitiveRegex,
      }))
    }
  } else if (searchMode === 'single-field') {
    // Search a specific field — prefer query param, fall back to config
    const targetFieldName = queryParams.searchField ?? configSearchField
    if (targetFieldName && schemaFieldNames.has(targetFieldName)) {
      mongoFilter[targetFieldName] = caseInsensitiveRegex
    }
  }
}
