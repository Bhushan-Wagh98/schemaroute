/**
 * @file schema.ts
 * @description Parsed schema types — the normalised intermediate representation
 * of a Mongoose schema produced by `@schemaroute/core`'s schema parser.
 *
 * `ParsedSchema` is the source of truth for validation, query filtering,
 * field projection, and OpenAPI spec generation. All consumers read from
 * this structure rather than inspecting the raw Mongoose schema directly.
 */

/**
 * Normalised field type derived from a Mongoose schema path type.
 * `'object'` represents an embedded sub-document (both explicit sub-schemas
 * and inline object definitions). `'mixed'` covers Schema.Types.Mixed and
 * any type that cannot be mapped to a more specific category.
 */
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'objectid'
  | 'array'
  | 'object'   // embedded sub-document
  | 'mixed'

/**
 * Normalised representation of a single schema field.
 * Constraints (`min`, `max`, `minlength`, `maxlength`, `enum`) are only
 * present when defined on the schema — absent otherwise.
 */
export interface ParsedField {
  name:       string
  type:       FieldType
  required:   boolean
  enum?:      unknown[]
  min?:       number
  max?:       number
  minlength?: number
  maxlength?: number
  /** Mongoose model name for ObjectId ref fields — used for ref existence validation. */
  ref?:       string
  isArray:    boolean
  /**
   * Child fields for embedded sub-documents (`type: 'object'`).
   * Populated for both explicit sub-schemas (`address: new Schema({...})`) and
   * inline objects (`address: { street: String }`). Empty or absent for all
   * other field types. When present, the validator recurses into these children
   * using dot-notation error paths (e.g. `address.street`).
   */
  fields?:    ParsedField[]
}

/** The complete normalised representation of a Mongoose schema. */
export interface ParsedSchema {
  fields:       ParsedField[]
  /** Names of all string-typed fields — used to build full-text search queries. */
  stringFields: string[]
  /** Names of all ObjectId ref fields — used for populate validation. */
  refFields:    string[]
}
