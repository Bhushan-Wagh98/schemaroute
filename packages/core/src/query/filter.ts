/**
 * @file query/filter.ts
 * @description Builds a MongoDB filter object from raw HTTP query parameters.
 * Only allows filtering on known schema fields to prevent query injection.
 * Values are coerced to their schema type so number/boolean filters work correctly.
 */

import type { QueryParams } from './types'
import type { ParsedField } from '../types'

/**
 * Coerces a raw query string value to the correct JS type based on the field's
 * parsed schema type. Query strings are always strings, so without coercion
 * `?price=99` would produce `{ price: '99' }` which MongoDB won't match against
 * a Number field.
 */
function coerceValue(rawValue: unknown, field: ParsedField): unknown {
  if (typeof rawValue !== 'string') return rawValue
  switch (field.type) {
    case 'number': {
      const n = Number(rawValue)
      return isNaN(n) ? rawValue : n
    }
    case 'boolean':
      if (rawValue === 'true')  return true
      if (rawValue === 'false') return false
      return rawValue
    case 'date': {
      const d = new Date(rawValue)
      return isNaN(d.getTime()) ? rawValue : d
    }
    default:
      return rawValue
  }
}

/**
 * Builds a MongoDB filter object from query string parameters.
 * Parameters matching known schema field names are included as equality filters.
 * Reserved query keys (sort, page, search, etc.) are always excluded.
 * Values are coerced to their schema type (number, boolean) so MongoDB matches correctly.
 *
 * @param queryParams        - Raw query string parameters from `req.query`.
 * @param schemaFieldNames   - Set of valid field names from the parsed schema.
 * @param reservedQueryKeys  - Set of keys consumed by the query handler itself.
 * @param parsedFields       - Parsed field descriptors for type coercion.
 * @returns                  A MongoDB-compatible filter object.
 *
 * @example
 * // GET /products?status=active&price=99&page=1
 * // → { status: 'active', price: 99 }  (page is reserved, price coerced to number)
 */
export function buildFieldFilter(
  queryParams:       QueryParams,
  schemaFieldNames:  Set<string>,
  reservedQueryKeys: Set<string>,
  parsedFields:      ParsedField[]
): { filter: Record<string, unknown>, errors: string[] } {
  const mongoFilter: Record<string, unknown> = {}
  const errors: string[] = []
  const fieldMap = new Map(parsedFields.map(f => [f.name, f]))

  for (const [paramKey, paramValue] of Object.entries(queryParams)) {
    const isSchemaField = schemaFieldNames.has(paramKey)
    const isReservedKey = reservedQueryKeys.has(paramKey)

    if (isSchemaField && !isReservedKey) {
      const field = fieldMap.get(paramKey)
      const coerced = field ? coerceValue(paramValue, field) : paramValue
      if (field?.enum && !field.enum.includes(coerced)) {
        errors.push(`'${paramValue}' is not a valid value for ${paramKey}. Must be one of: ${field.enum.join(', ')}`)
      } else {
        mongoFilter[paramKey] = coerced
      }
    }
  }

  return { filter: mongoFilter, errors }
}
