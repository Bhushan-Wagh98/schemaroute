/**
 * @file validator.ts
 * @description Schema-driven request body validator. Validates incoming data
 * against the constraints extracted from the Mongoose schema by `parseSchema`.
 *
 * Supported constraints:
 *   - required, type coercion check
 *   - string: minlength, maxlength
 *   - number: min, max (correctly handles zero as a valid boundary)
 *   - boolean: type check
 *   - date: parseable date string check
 *   - objectid: 24-char hex format check
 *   - enum: value membership check
 *   - object: recurses into embedded sub-document fields
 */

import type { ParsedField, ParsedSchema, ValidationError } from './types'

/**
 * Validates a single field value against its parsed schema constraints.
 * Errors are pushed into the shared `errors` array rather than thrown,
 * so all field errors are collected in a single pass.
 *
 * For `type === 'object'` fields that have child `fields`, the function
 * recurses into the sub-document value using dot-notation error paths
 * (e.g. `address.street`).
 *
 * @param field    - The parsed field descriptor containing constraints.
 * @param value    - The value from the request body for this field.
 * @param errors   - Accumulator array; errors are appended in place.
 * @param prefix   - Dot-notation prefix for nested error field names. Empty at top level.
 */
function validateField(
  field:   ParsedField,
  value:   unknown,
  errors:  ValidationError[],
  prefix = ''
): void {
  const { name, type, required, min, max, minlength, maxlength, enum: allowedValues } = field
  const qualifiedName = prefix ? `${prefix}.${name}` : name

  // ── Required check ────────────────────────────────────────────────────────
  // Treat only undefined and null as missing. Empty string ('') is a valid
  // submitted value — if the schema has minlength it will be caught below;
  // if not, Mongoose's own runValidators handles it at the DB layer.
  if (required && (value === undefined || value === null)) {
    errors.push({ field: qualifiedName, message: `${qualifiedName} is required` })
    return
  }

  // Skip constraint checks when the field is optional and not provided
  if (value === undefined || value === null) return

  // ── Type + constraint checks ──────────────────────────────────────────────
  switch (type) {
    case 'string': {
      if (typeof value !== 'string') {
        errors.push({ field: qualifiedName, message: `${qualifiedName} must be a string` })
        return
      }
      if (minlength !== undefined && value.length < minlength)
        errors.push({ field: qualifiedName, message: `${qualifiedName} must be at least ${minlength} characters` })
      if (maxlength !== undefined && value.length > maxlength)
        errors.push({ field: qualifiedName, message: `${qualifiedName} must be at most ${maxlength} characters` })
      break
    }

    case 'number': {
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push({ field: qualifiedName, message: `${qualifiedName} must be a number` })
        return
      }
      // Use `!== undefined` so that `min: 0` correctly rejects negative values
      if (min !== undefined && value < min)
        errors.push({ field: qualifiedName, message: `${qualifiedName} must be at least ${min}` })
      if (max !== undefined && value > max)
        errors.push({ field: qualifiedName, message: `${qualifiedName} must be at most ${max}` })
      break
    }

    case 'boolean': {
      if (typeof value !== 'boolean')
        errors.push({ field: qualifiedName, message: `${qualifiedName} must be a boolean` })
      break
    }

    case 'date': {
      if (isNaN(Date.parse(String(value))))
        errors.push({ field: qualifiedName, message: `${qualifiedName} must be a valid date` })
      break
    }

    case 'objectid': {
      if (!/^[a-f\d]{24}$/i.test(String(value)))
        errors.push({ field: qualifiedName, message: `${qualifiedName} must be a valid ObjectId` })
      break
    }

    case 'object': {
      // Recurse into embedded sub-document fields when child field descriptors
      // are available. If `field.fields` is absent or empty the object has no
      // parsed children (e.g. a bare `Mixed` or unrecognised type) — skip silently.
      // If the value is not a plain object, report a type error and stop —
      // there is nothing meaningful to validate inside a non-object value.
      // Arrays are explicitly rejected here because `typeof [] === 'object'`
      // would otherwise pass the plain-object check.
      if (field.fields?.length) {
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push({ field: qualifiedName, message: `${qualifiedName} must be an object` })
          return
        }
        const subDoc = value as Record<string, unknown>
        for (const childField of field.fields) {
          validateField(childField, subDoc[childField.name], errors, qualifiedName)
        }
      }
      break
    }
  }

  // ── Enum check ────────────────────────────────────────────────────────────
  // Only apply enum validation when ALL of the following are true:
  //   1. The field has an enum constraint
  //   2. The field type is string or number — the only types where Mongoose
  //      enum constraints are meaningful
  //   3. The runtime value is a primitive (string or number) — guards against
  //      false positives when an array or object is submitted for a field that
  //      has an enum, since reference-equality on non-primitives always fails
  const valueIsPrimitive = typeof value === 'string' || typeof value === 'number'
  if (allowedValues && (type === 'string' || type === 'number') && valueIsPrimitive && !allowedValues.includes(value))
    errors.push({ field: qualifiedName, message: `${qualifiedName} must be one of: ${allowedValues.join(', ')}` })
}

/**
 * Validates a request body object against all fields in a parsed schema.
 * Returns an array of `ValidationError` objects — an empty array means valid.
 *
 * Nested sub-document fields are validated recursively. Error field names use
 * dot-notation to identify the exact failing path (e.g. `address.street`).
 *
 * @param body         - The parsed request body (`req.body`).
 * @param parsedSchema - The schema produced by `parseSchema`.
 * @returns            Array of validation errors, empty if all fields are valid.
 *
 * @example
 * const errors = validate(req.body, parsedSchema)
 * if (errors.length) return res.status(422).json({ success: false, errors })
 */
export function validate(
  body:         Record<string, unknown>,
  parsedSchema: ParsedSchema
): ValidationError[] {
  const errors: ValidationError[] = []

  for (const field of parsedSchema.fields) {
    validateField(field, body[field.name], errors)
  }

  return errors
}
