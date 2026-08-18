/**
 * @file query/populate.ts
 * @description Resolves the list of ref fields to populate for a query.
 * Merges config-level and query-level populate requests, validates each
 * against the parsed schema's known ref fields, and deduplicates.
 *
 * Config entries may carry a `select` restriction (e.g. `{ path: 'category', select: 'name slug' }`).
 * Query param entries (`?populate=category`) are plain strings with no select restriction.
 * Config entries take precedence — if the same path appears in both, the config entry wins.
 */

import type { PopulateOption } from '../types'
import type { QueryParams } from './types'

/**
 * Resolves the final list of populate options.
 * Combines fields from route/resource config and the `?populate=` query param.
 * Only fields that exist as ObjectId refs in the schema are allowed.
 *
 * @param queryParams             - Raw query params containing `populate`.
 * @param configPopulateFields    - Populate options from route/resource config.
 * @param validRefFieldNames      - Set of known ref field names from the parsed schema.
 * @returns                       Deduplicated array of validated populate options.
 *
 * @example
 * // config: populate: [{ path: 'category', select: 'name slug' }]
 * // query:  ?populate=brand
 * // schema refs: ['category', 'brand', 'supplier']
 * // → [{ path: 'category', select: 'name slug' }, 'brand']
 */
export function resolvePopulateFields(
  queryParams:          QueryParams,
  configPopulateFields: PopulateOption[],
  validRefFieldNames:   Set<string>
): PopulateOption[] {
  const queryPopulateFields: PopulateOption[] = queryParams.populate
    ? queryParams.populate.split(',').map(f => f.trim())
    : []

  // Config entries first — they may carry a select restriction and take precedence
  const allRequested = [...configPopulateFields, ...queryPopulateFields]
  const seenPaths    = new Set<string>()
  const resolved: PopulateOption[] = []

  for (const opt of allRequested) {
    const path          = typeof opt === 'string' ? opt : opt.path
    const isValidRef    = validRefFieldNames.has(path)
    const isAlreadySeen = seenPaths.has(path)

    if (isValidRef && !isAlreadySeen) {
      seenPaths.add(path)
      resolved.push(opt)
    }
  }

  return resolved
}
