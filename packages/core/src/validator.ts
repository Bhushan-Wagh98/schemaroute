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
 *   - enum: value membership check
 */

import type { ParsedField, ParsedSchema, ValidationError } from './types'

/**
 * Validates a single field value against its parsed schema constraints.
 * Errors are pushed into the shared `errors` array rather than thrown,
 * so all field errors are collected in a single pass.
 *
 * @param field  - The parsed field descriptor containing constraints.
 * @param value  - The value from the request body for this field.
 * @param errors - Accumulator array; errors are appended in place.
 */
function validateField(
  field:  ParsedField,
  value:  unknown,
  errors: ValidationError[]
): void {
  const { name, type, required, min, max, minlength, maxlength, enum: allowedValues } = field

  // ── Required check ────────────────────────────────────────────────────────
  // Treat only undefined and null as missing. Empty string ('') is a valid
  // submitted value — if the schema has minlength it will be caught below;
  // if not, Mongoose's own runValidators handles it at the DB layer.
  if (required && (value === undefined || value === null)) {
    errors.push({ field: name, message: `${name} is required` })
    return
  }

  // Skip constraint checks when the field is optional and not provided
  if (value === undefined || value === null) return

  // ── Type + constraint checks ──────────────────────────────────────────────
  switch (type) {
    case 'string': {
      if (typeof value !== 'string') {
        errors.push({ field: name, message: `${name} must be a string` })
        return
      }
      if (minlength !== undefined && value.length < minlength)
        errors.push({ field: name, message: `${name} must be at least ${minlength} characters` })
      if (maxlength !== undefined && value.length > maxlength)
        errors.push({ field: name, message: `${name} must be at most ${maxlength} characters` })
      break
    }

    case 'number': {
      if (typeof value !== 'number' || isNaN(value)) {
        errors.push({ field: name, message: `${name} must be a number` })
        return
      }
      // Use `!== undefined` so that `min: 0` correctly rejects negative values
      if (min !== undefined && value < min)
        errors.push({ field: name, message: `${name} must be at least ${min}` })
      if (max !== undefined && value > max)
        errors.push({ field: name, message: `${name} must be at most ${max}` })
      break
    }

    case 'boolean': {
      if (typeof value !== 'boolean')
        errors.push({ field: name, message: `${name} must be a boolean` })
      break
    }

    case 'date': {
      if (isNaN(Date.parse(String(value))))
        errors.push({ field: name, message: `${name} must be a valid date` })
      break
    }

    case 'objectid': {
      if (!/^[a-f\d]{24}$/i.test(String(value)))
        errors.push({ field: name, message: `${name} must be a valid ObjectId` })
      break
    }
  }

  // ── Enum check ────────────────────────────────────────────────────────────
  // Only apply enum validation to string and number fields — the only types
  // where Mongoose enum constraints are meaningful. All other types (array,
  // object, date, objectid, boolean, mixed) are skipped to avoid false positives
  // from reference-equality mismatches on non-primitive values.
  if (allowedValues && (type === 'string' || type === 'number') && !allowedValues.includes(value))
    errors.push({ field: name, message: `${name} must be one of: ${allowedValues.join(', ')}` })
}

/**
 * Validates a request body object against all fields in a parsed schema.
 * Returns an array of `ValidationError` objects — an empty array means valid.
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
