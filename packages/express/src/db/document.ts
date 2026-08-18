/**
 * @file db/document.ts
 * @description Utilities for processing lean Mongoose documents before they
 * are sent in HTTP responses.
 *
 * Exports:
 *   - `stripExcludedFields`          — recursively removes excluded fields from a lean doc
 *   - `applyDocumentTransform`        — maps a transform function over an array of docs
 *   - `applyTransformWithValidation`  — applies transform and warns in debug mode if fields are dropped
 *
 * Note: ObjectId validation (`isValidObjectId`) is exported from `@schemaroute/core`
 * and used directly by handlers. The local `isValidMongoObjectId` below is kept
 * only for internal use by `stripExcludedFields`.
 */

import type { TransformFn } from '@schemaroute/core'

/**
 * Recursively strips excluded fields from a lean Mongoose document.
 *
 * Also handles two special cases found in lean documents:
 *   - Raw `ObjectId` values — serialised to plain strings
 *   - Populated sub-documents (objects with `_id`) — recursively stripped
 *
 * @param leanDocument  - A plain object returned by Mongoose `.lean()`.
 * @param excludedFields - Field names to remove from the output at every level.
 * @returns              A new object with excluded fields removed.
 */
export function stripExcludedFields(
  leanDocument:  Record<string, unknown>,
  excludedFields: string[]
): Record<string, unknown> {
  const sanitisedDocument: Record<string, unknown> = {}

  for (const [fieldName, fieldValue] of Object.entries(leanDocument)) {
    if (excludedFields.includes(fieldName)) continue

    if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
      const nestedObject = fieldValue as Record<string, unknown>

      // ObjectId detection: toHexString is the public BSON API present on all
      // ObjectId instances across driver versions. The hex format check guards
      // against false positives from unrelated objects that happen to have a
      // toHexString method.
      const candidate = nestedObject as unknown as { toHexString?: unknown }
      if (
        typeof candidate.toHexString === 'function' &&
        isValidMongoObjectId(String(fieldValue))
      ) {
        sanitisedDocument[fieldName] = String(fieldValue)
        continue
      }

      // Populated sub-document — recursively strip excluded fields
      if ('_id' in nestedObject) {
        sanitisedDocument[fieldName] = stripExcludedFields(nestedObject, excludedFields)
        continue
      }
    }

    sanitisedDocument[fieldName] = fieldValue
  }

  return sanitisedDocument
}

/**
 * Validates that a string is a valid 24-character hexadecimal MongoDB ObjectId.
 * Used to return a clean 400 response instead of letting Mongoose throw a
 * `CastError` which would result in a 500.
 *
 * @param candidateId - The string to validate.
 * @returns           `true` if the string is a valid ObjectId format.
 */
export function isValidMongoObjectId(candidateId: string): boolean {
  return /^[a-f\d]{24}$/i.test(candidateId)
}

/**
 * Applies an `expose` whitelist to a document — only the listed fields are kept.
 * `_id` is always included unless explicitly omitted from the whitelist.
 * Applied after transform so the whitelist is the final gate before the response.
 */
export function applyExposeFilter(
  doc:    Record<string, unknown>,
  expose: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of expose) {
    if (field in doc) result[field] = doc[field]
  }
  // Always include _id unless the caller explicitly excluded it
  if (!expose.includes('_id') && '_id' in doc) result['_id'] = doc['_id']
  return result
}

/**
 * Applies a document transform function to every document in an array.
 * Used to reshape the response (e.g. rename `_id` → `id`, omit internal fields).
 *
 * @param documents       - Array of lean documents to transform.
 * @param transformFn     - The transform function from route or resource config.
 * @param debugWarn       - Optional warn function called when transform drops fields (debug mode).
 * @returns               A new array of transformed documents.
 */
export function applyDocumentTransform(
  documents:   Record<string, unknown>[],
  transformFn: TransformFn,
  debugWarn?:  (msg: string) => void
): Record<string, unknown>[] {
  return documents.map(doc => applyTransformWithValidation(doc, transformFn, debugWarn))
}

/**
 * Applies a transform to a single document and warns (in debug mode) if the
 * transform silently drops fields that were present in the original document.
 * This catches the common mistake of a transform function that forgets to
 * forward a field, causing it to silently disappear from responses.
 *
 * `__v` is excluded from the dropped-fields check — it is an internal
 * Mongoose version key that is always excluded from responses anyway.
 * Soft-delete fields (`deletedAt`, `isDeleted`) are not excluded here —
 * if a transform drops them intentionally that is fine, but if it drops
 * them accidentally the warning will fire, which is the correct behaviour.
 *
 * Only fires when `debug: true` is set on the resource config.
 * Silent in production.
 */
export function applyTransformWithValidation(
  doc:        Record<string, unknown>,
  transformFn: TransformFn,
  debugWarn?:  (msg: string) => void
): Record<string, unknown> {
  const result = transformFn(doc)
  if (debugWarn) {
    const inputKeys  = Object.keys(doc)
    const outputKeys = new Set(Object.keys(result))
    const dropped    = inputKeys.filter(k => !outputKeys.has(k) && k !== '__v')
    if (dropped.length > 0) {
      debugWarn(`[transform] dropped fields: ${dropped.join(', ')} — add them to your transform function or they will be missing from responses`)
    }
  }
  return result
}
