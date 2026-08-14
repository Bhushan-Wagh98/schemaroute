/**
 * @file schema-parser.ts
 * @description Parses a Mongoose schema into a normalised `ParsedSchema` used
 * by the validator, query handler, and route builder.
 *
 * Only public-facing schema paths are parsed — internal Mongoose paths
 * (`_id`, `__v`) are skipped automatically.
 */

import type { Schema, SchemaType } from 'mongoose'
import type { FieldType, ParsedField, ParsedSchema } from './types'

/**
 * Maps a Mongoose `SchemaType` instance name to the normalised `FieldType`
 * union used throughout SchemaRoute.
 *
 * Falls back to `'mixed'` for any unrecognised instance type.
 */
function resolveFieldType(schemaType: SchemaType): FieldType {
  switch (schemaType.instance?.toLowerCase()) {
    case 'string':   return 'string'
    case 'number':   return 'number'
    case 'boolean':  return 'boolean'
    case 'date':     return 'date'
    case 'objectid': return 'objectid'
    case 'array':    return 'array'
    case 'mixed':    return 'mixed'
    case 'object':
    case 'embedded': return 'object'
    default:         return 'mixed'
  }
}

/**
 * Extracts validation constraints and metadata from a single Mongoose schema
 * path and returns a normalised `ParsedField`.
 *
 * @param name       - The dot-notation path name (e.g. `'price'`, `'address.city'`).
 * @param schemaType - The Mongoose SchemaType instance for this path.
 */
function parseField(name: string, schemaType: SchemaType): ParsedField {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options = (schemaType as any).options ?? {}
  const type    = resolveFieldType(schemaType)

  const field: ParsedField = {
    name,
    type,
    required: !!options.required,
    isArray:  schemaType.instance?.toLowerCase() === 'array',
  }

  // only attach constraint properties when explicitly defined — use `!== undefined`
  // so that zero values (e.g. `min: 0`) are correctly captured
  if (options.enum      !== undefined) field.enum      = options.enum
  if (options.min       !== undefined) field.min       = options.min
  if (options.max       !== undefined) field.max       = options.max
  if (options.minlength !== undefined) field.minlength = options.minlength
  if (options.maxlength !== undefined) field.maxlength = options.maxlength
  if (options.ref       !== undefined) field.ref       = options.ref

  return field
}

/**
 * Parses a Mongoose schema into a `ParsedSchema` containing normalised field
 * descriptors, a list of string field names (for search), and a list of ref
 * field names (for populate validation).
 *
 * @param schema - The Mongoose schema to parse.
 * @returns      A `ParsedSchema` ready for use by the validator and query handler.
 *
 * @example
 * const parsed = parseSchema(ProductSchema)
 * // parsed.fields       → [{ name: 'name', type: 'string', required: true, ... }, ...]
 * // parsed.stringFields → ['name', 'description', 'status']
 * // parsed.refFields    → ['category']
 */
export function parseSchema(schema: Schema): ParsedSchema {
  const fields: ParsedField[] = []

  schema.eachPath((name, schemaType) => {
    // skip internal Mongoose paths — never exposed in responses or validation
    if (name === '_id' || name === '__v') return
    fields.push(parseField(name, schemaType))
  })

  const stringFields = fields
    .filter(f => f.type === 'string')
    .map(f => f.name)

  const refFields = fields
    .filter(f => f.ref !== undefined)
    .map(f => f.name)

  return { fields, stringFields, refFields }
}
