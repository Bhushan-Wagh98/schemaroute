/**
 * @file parsing/schema-parser.ts
 * @description Parses a Mongoose schema into a normalised `ParsedSchema` used
 * by the validator, query handler, and route builder.
 *
 * Only public-facing schema paths are parsed — internal Mongoose paths
 * (`_id`, `__v`) are skipped automatically.
 *
 * Nested sub-documents are handled in two forms:
 *
 *   1. Explicit sub-schema — `address: new Schema({ street: String })`
 *      Mongoose creates an `Embedded` SchemaType with a `.schema` property.
 *      Child fields are parsed by recursing into that schema.
 *
 *   2. Inline object — `address: { street: { type: String } }`
 *      Mongoose flattens these into dot-notation paths (`address.street`).
 *      No parent `address` path exists. Child paths are grouped by their
 *      common prefix and synthesised into a parent `ParsedField` of type
 *      `'object'` with `fields` populated from the grouped children.
 */

import type { Schema, SchemaType } from 'mongoose'
import type { FieldType, ParsedField, ParsedSchema } from '../types'

/**
 * Maps a Mongoose `SchemaType` instance name to the normalised `FieldType`
 * union used throughout SchemaRoute. Falls back to `'mixed'` for unrecognised types.
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
 * For explicit sub-schemas (`Embedded` SchemaType with a `.schema` property),
 * child fields are parsed recursively and stored in `field.fields`.
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

  if (options.enum      !== undefined) field.enum      = options.enum
  if (options.min       !== undefined) field.min       = options.min
  if (options.max       !== undefined) field.max       = options.max
  if (options.minlength !== undefined) field.minlength = options.minlength
  if (options.maxlength !== undefined) field.maxlength = options.maxlength
  if (options.ref       !== undefined) field.ref       = options.ref

  // Explicit sub-schema: `address: new Schema({ ... })`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const embeddedSchema: Schema | undefined = (schemaType as any).schema
  if (type === 'object' && embeddedSchema) {
    field.fields = parseEmbeddedSchema(embeddedSchema)
  }

  return field
}

/** Parses child fields from an explicit embedded sub-schema. Skips `_id`. */
function parseEmbeddedSchema(schema: Schema): ParsedField[] {
  const children: ParsedField[] = []
  schema.eachPath((childName, childSchemaType) => {
    if (childName === '_id') return
    if (childName.includes('.')) return
    children.push(parseField(childName, childSchemaType))
  })
  return children
}

/**
 * Parses a Mongoose schema into a `ParsedSchema` containing normalised field
 * descriptors, string field names (for search), and ref field names (for populate).
 *
 * @param schema - The Mongoose schema to parse.
 * @returns      A `ParsedSchema` ready for use by the validator and query handler.
 */
export function parseSchema(schema: Schema): ParsedSchema {
  const rawPaths: Array<{ name: string; schemaType: SchemaType }> = []
  schema.eachPath((name, schemaType) => {
    if (name === '_id' || name === '__v') return
    rawPaths.push({ name, schemaType })
  })

  const topLevelNames = new Set(
    rawPaths.filter(p => !p.name.includes('.')).map(p => p.name)
  )

  // Group dot-notation paths by their top-level prefix for inline objects
  const inlineChildren = new Map<string, Array<{ name: string; schemaType: SchemaType }>>()
  for (const { name, schemaType } of rawPaths) {
    if (!name.includes('.')) continue
    const dotIndex = name.indexOf('.')
    const prefix   = name.slice(0, dotIndex)
    const child    = name.slice(dotIndex + 1)
    if (!topLevelNames.has(prefix)) {
      if (!inlineChildren.has(prefix)) inlineChildren.set(prefix, [])
      inlineChildren.get(prefix)!.push({ name: child, schemaType })
    }
  }

  const fields: ParsedField[] = []

  for (const { name, schemaType } of rawPaths) {
    if (name.includes('.')) continue
    fields.push(parseField(name, schemaType))
  }

  // Synthesise parent fields for inline object groups
  for (const [prefix, children] of inlineChildren) {
    fields.push({
      name:     prefix,
      type:     'object',
      required: false,
      isArray:  false,
      fields:   children.map(({ name, schemaType }) => parseField(name, schemaType)),
    })
  }

  return {
    fields,
    stringFields: fields.filter(f => f.type === 'string').map(f => f.name),
    refFields:    fields.filter(f => f.ref !== undefined).map(f => f.name),
  }
}
