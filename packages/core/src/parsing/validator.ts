/**
 * @file parsing/validator.ts
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
 *   - object: recurses into embedded sub-document fields (dot-notation error paths)
 */

import type { ParsedField, ParsedSchema, ValidationError } from '../types'

/**
 * Validates a single field value against its parsed schema constraints.
 * Errors are pushed into the shared `errors` array rather than thrown,
 * so all field errors are collected in a single pass.
 *
 * For `type === 'object'` fields with child `fields`, the function recurses
 * into the sub-document value using dot-notation error paths (e.g. `address.street`).
 */
function validateField(
  field:   ParsedField,
  value:   unknown,
  errors:  ValidationError[],
  prefix = ''
): void {
  const { name, type, required, min, max, minlength, maxlength, enum: allowedValues } = field
  const qualifiedName = prefix ? `${prefix}.${name}` : name

  // Required check — only undefined and null are treated as missing
  if (required && (value === undefined || value === null)) {
    errors.push({ field: qualifiedName, message: `${qualifiedName} is required` })
    return
  }

  if (value === undefined || value === null) return

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

  // Enum check — only for string/number primitives
  const valueIsPrimitive = typeof value === 'string' || typeof value === 'number'
  if (allowedValues && (type === 'string' || type === 'number') && valueIsPrimitive && !allowedValues.includes(value))
    errors.push({ field: qualifiedName, message: `${qualifiedName} must be one of: ${allowedValues.join(', ')}` })
}

/**
 * Validates a request body against all fields in a parsed schema.
 * Returns an array of `ValidationError` — empty array means valid.
 *
 * @param body         - The parsed request body.
 * @param parsedSchema - The schema produced by `parseSchema`.
 * @returns            Array of validation errors, empty if all fields are valid.
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
