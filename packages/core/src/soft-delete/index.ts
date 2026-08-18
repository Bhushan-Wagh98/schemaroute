/**
 * @file soft-delete/index.ts
 * @description Soft delete helpers shared by all SchemaRoute framework adapters.
 * Centralised here so the logic is written once and both Express and Fastify
 * adapters import from the same source.
 *
 * When `softDelete` is enabled on a resource:
 *   - `DELETE /:id`         — sets `deletedAt` + `isDeleted` instead of removing
 *   - `POST /:id/restore`   — clears both fields; document reappears in reads
 *   - `DELETE /:id/purge`   — permanently removes a soft-deleted document
 *   - All reads automatically exclude soft-deleted documents
 */

import type { SoftDeleteOption } from '../types'

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

/** Builds the MongoDB `$set` payload for a soft delete operation. */
export function buildSoftDeleteUpdate(fields: SoftDeleteFields): Record<string, unknown> {
  return { [fields.field]: new Date(), [fields.flagField]: true }
}

/**
 * Builds the MongoDB `$set` payload for a restore operation.
 * Clears both fields so the document reappears in all reads immediately.
 */
export function buildRestoreUpdate(fields: SoftDeleteFields): Record<string, unknown> {
  return { [fields.field]: null, [fields.flagField]: false }
}

/**
 * Builds the MongoDB filter that matches only soft-deleted documents.
 * Used by restore and purge — live documents return 404 from both routes.
 */
export function buildDeletedOnlyFilter(fields: SoftDeleteFields): Record<string, unknown> {
  return { [fields.flagField]: true }
}

/**
 * Builds the MongoDB filter that excludes soft-deleted documents from reads.
 *
 * Uses `$ne: true` rather than `isDeleted: false` so that documents created
 * before soft delete was enabled (no `isDeleted` field) are still returned —
 * `null` and `undefined` both satisfy `$ne: true`.
 */
export function buildSoftDeleteFilter(fields: SoftDeleteFields): Record<string, unknown> {
  return { [fields.flagField]: { $ne: true } }
}
