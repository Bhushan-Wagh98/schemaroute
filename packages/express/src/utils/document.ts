/**
 * @file utils/document.ts
 * @description Utilities for processing lean Mongoose documents before they
 * are sent in HTTP responses.
 *
 * Exports:
 *   - `stripExcludedFields`         — recursively removes excluded fields from a lean doc
 *   - `applyExposeFilter`           — applies the read whitelist (expose) to a document
 *   - `applyWritableFilter`         — applies the write whitelist (writable) to a request body
 *   - `applyDocumentTransform`      — maps a transform function over an array of docs
 *   - `applyTransformWithValidation`— applies transform and warns in debug mode if fields are dropped
 */

import type { TransformFn } from '@schemaroute/core'

/**
 * Recursively strips excluded fields from a lean Mongoose document.
 * Handles ObjectId values (serialised to strings) and populated sub-documents.
 */
export function stripExcludedFields(
  leanDocument:   Record<string, unknown>,
  excludedFields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [fieldName, fieldValue] of Object.entries(leanDocument)) {
    if (excludedFields.includes(fieldName)) continue

    if (fieldValue && typeof fieldValue === 'object' && !Array.isArray(fieldValue)) {
      const nested    = fieldValue as Record<string, unknown>
      const candidate = nested as unknown as { toHexString?: unknown }

      // ObjectId detection via BSON public API
      if (typeof candidate.toHexString === 'function' && isValidMongoObjectId(String(fieldValue))) {
        result[fieldName] = String(fieldValue)
        continue
      }

      // Populated sub-document — recurse
      if ('_id' in nested) {
        result[fieldName] = stripExcludedFields(nested, excludedFields)
        continue
      }
    }

    result[fieldName] = fieldValue
  }

  return result
}

function isValidMongoObjectId(candidateId: string): boolean {
  return /^[a-f\d]{24}$/i.test(candidateId)
}

/**
 * Applies the `expose` read whitelist to a document.
 * `_id` is always included unless explicitly omitted from the whitelist.
 * Applied after transform — this is the final gate before the response.
 */
export function applyExposeFilter(
  doc:    Record<string, unknown>,
  expose: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of expose) {
    if (field in doc) result[field] = doc[field]
  }
  if (!expose.includes('_id') && '_id' in doc) result['_id'] = doc['_id']
  return result
}

/**
 * Applies the `writable` write whitelist to an incoming request body.
 * Applied before scope, hooks, and DB writes — the first gate on all writes.
 */
export function applyWritableFilter(
  body:     Record<string, unknown>,
  writable: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of writable) {
    if (field in body) result[field] = body[field]
  }
  return result
}

/**
 * Applies a document transform function to every document in an array.
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
 * transform silently drops fields. `__v` is excluded from the check.
 * Silent in production — only fires when `debug: true`.
 */
export function applyTransformWithValidation(
  doc:         Record<string, unknown>,
  transformFn: TransformFn,
  debugWarn?:  (msg: string) => void
): Record<string, unknown> {
  const result = transformFn(doc)
  if (debugWarn) {
    const dropped = Object.keys(doc).filter(k => !new Set(Object.keys(result)).has(k) && k !== '__v')
    if (dropped.length > 0) {
      debugWarn(`[transform] dropped fields: ${dropped.join(', ')} — add them to your transform function or they will be missing from responses`)
    }
  }
  return result
}
