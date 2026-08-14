/**
 * @file query/populate.ts
 * @description Resolves the list of ref fields to populate for a query.
 * Merges config-level and query-level populate requests, validates each
 * against the parsed schema's known ref fields, and deduplicates.
 */

import type { QueryParams } from './types'

/**
 * Resolves the final list of ref field names to populate.
 * Combines fields from route/resource config and the `?populate=` query param.
 * Only fields that exist as ObjectId refs in the schema are allowed.
 *
 * @param queryParams        - Raw query params containing `populate`.
 * @param configPopulateFields - Ref fields from route/resource config.
 * @param validRefFieldNames - Set of known ref field names from the parsed schema.
 * @returns                  Deduplicated array of validated ref field names.
 *
 * @example
 * // config: populate: ['category']
 * // query:  ?populate=brand
 * // schema refs: ['category', 'brand', 'supplier']
 * // → ['category', 'brand']
 */
export function resolvePopulateFields(
  queryParams:           QueryParams,
  configPopulateFields:  string[],
  validRefFieldNames:    Set<string>
): string[] {
  const queryPopulateFields = queryParams.populate
    ? queryParams.populate.split(',').map(fieldName => fieldName.trim())
    : []

  const allRequestedPopulateFields = [...configPopulateFields, ...queryPopulateFields]
  const resolvedPopulateFields: string[] = []

  for (const requestedField of allRequestedPopulateFields) {
    const isValidRefField  = validRefFieldNames.has(requestedField)
    const isAlreadyAdded   = resolvedPopulateFields.includes(requestedField)

    if (isValidRefField && !isAlreadyAdded) {
      resolvedPopulateFields.push(requestedField)
    }
  }

  return resolvedPopulateFields
}
