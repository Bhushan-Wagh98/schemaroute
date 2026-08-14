/**
 * @file query/projection.ts
 * @description Builds a MongoDB projection object for field selection.
 *
 * MongoDB projection rule: inclusion and exclusion cannot be mixed in the same
 * projection (except for `_id`). This module enforces that rule:
 *   - When `?fields=` is present → inclusion-only projection
 *   - When `select` config is set → inclusion-only projection
 *   - Otherwise                  → exclusion-only projection
 *
 * Priority: `?fields=` query param > `select` config > `exclude` config
 */

import type { QueryParams } from './types'

/**
 * Builds a MongoDB projection object from query params and route/resource config.
 * Returns `null` when no projection is needed (fetch all fields).
 *
 * @param queryParams      - Raw query params containing `fields`.
 * @param schemaFieldNames - Set of valid field names from the parsed schema.
 * @param excludedFields   - Fields to always exclude (from resource + route config).
 * @param selectFields     - Default fields to include (from resource + route config).
 * @param isFieldsEnabled  - Whether `?fields=` query param is allowed on this route.
 * @returns                A MongoDB projection object, or `null` for no projection.
 */
export function buildProjection(
  queryParams:      QueryParams,
  schemaFieldNames: Set<string>,
  excludedFields:   Set<string>,
  selectFields?:    string[],
  isFieldsEnabled?: boolean
): { projection: Record<string, 0 | 1> | null, error?: string } {
  const mongoProjection: Record<string, 0 | 1> = {}

  if (queryParams.fields && isFieldsEnabled !== false) {
    // Inclusion projection from ?fields= — only valid, non-excluded schema fields
    for (const rawFieldName of queryParams.fields.split(',')) {
      const trimmedFieldName = rawFieldName.trim()
      if (!schemaFieldNames.has(trimmedFieldName)) {
        return { projection: null, error: `'${trimmedFieldName}' is not a valid field` }
      }
      if (!excludedFields.has(trimmedFieldName)) {
        mongoProjection[trimmedFieldName] = 1
      }
    }
  } else if (selectFields && selectFields.length > 0) {
    // Inclusion projection from config — skip excluded fields
    for (const configFieldName of selectFields) {
      if (!excludedFields.has(configFieldName)) {
        mongoProjection[configFieldName] = 1
      }
    }
  } else {
    // No inclusions — apply exclusions only to avoid mixed projection error
    for (const excludedFieldName of excludedFields) {
      mongoProjection[excludedFieldName] = 0
    }
  }

  return { projection: Object.keys(mongoProjection).length > 0 ? mongoProjection : null }
}
