/**
 * @file soft-delete.ts
 * @description Soft delete helpers shared by all SchemaRoute framework adapters.
 * Centralised here so the logic is written once and both Express and Fastify
 * adapters import from the same source.
 *
 * When `softDelete` is enabled on a resource:
 *   - `DELETE /:id` sets `deletedAt` + `isDeleted` instead of removing the document
 *   - All `getAll` and `getOne` queries automatically exclude soft-deleted documents
 *   - Documents can be restored via `PATCH` by setting `{ isDeleted: false, deletedAt: null }`
 */

import type { SoftDeleteOption } from './types'

export interface SoftDeleteFields {
  /** The Date field set to `new Date()` on soft delete. Default: `'deletedAt'`. */
  field:     string
  /** The Boolean flag set to `true` on soft delete. Default: `'isDeleted'`. */
  flagField: string
}

/**
 * Resolves the soft-delete field names from the config option.
 * Returns `null` when soft delete is disabled (`undefined` or `false`).
 */
export function resolveSoftDeleteFields(option: SoftDeleteOption | undefined): SoftDeleteFields | null {
  if (!option) return null
  const config = typeof option === 'object' ? option : {}
  return {
    field:     config.field     ?? 'deletedAt',
    flagField: config.flagField ?? 'isDeleted',
  }
}

/**
 * Builds the MongoDB `$set` payload for a soft delete operation.
 */
export function buildSoftDeleteUpdate(fields: SoftDeleteFields): Record<string, unknown> {
  return {
    [fields.field]:     new Date(),
    [fields.flagField]: true,
  }
}

/**
 * Builds the MongoDB filter that excludes soft-deleted documents from reads.
 *
 * Uses `$ne: true` rather than `isDeleted: false` so that documents created
 * before soft delete was enabled (which have no `isDeleted` field) are still
 * returned — `null` and `undefined` both satisfy `$ne: true`.
 */
export function buildSoftDeleteFilter(fields: SoftDeleteFields): Record<string, unknown> {
  return { [fields.flagField]: { $ne: true } }
}
