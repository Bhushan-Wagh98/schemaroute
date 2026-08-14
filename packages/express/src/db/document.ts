/**
 * @file db/document.ts
 * @description Utilities for processing lean Mongoose documents before they
 * are sent in HTTP responses.
 *
 * Exports:
 *   - `stripExcludedFields`    — recursively removes excluded fields from a lean doc
 *   - `isValidMongoObjectId`   — validates 24-char hex ObjectId format
 *   - `applyDocumentTransform` — maps a transform function over an array of docs
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

      // Raw ObjectId — serialise to string to avoid [Object object] in responses
      if (nestedObject['_bsontype'] === 'ObjectId' || nestedObject['buffer'] !== undefined) {
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
 * Applies a document transform function to every document in an array.
 * Used to reshape the response (e.g. rename `_id` → `id`, omit internal fields).
 *
 * @param documents       - Array of lean documents to transform.
 * @param transformFn     - The transform function from route or resource config.
 * @returns               A new array of transformed documents.
 */
export function applyDocumentTransform(
  documents:   Record<string, unknown>[],
  transformFn: TransformFn
): Record<string, unknown>[] {
  return documents.map(transformFn)
}
