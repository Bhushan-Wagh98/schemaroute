/**
 * @file soft-delete.ts
 * @description Re-exports soft delete helpers from `@schemaroute/core`.
 * The implementation lives in core so it is shared by all adapters.
 */

export {
  resolveSoftDeleteFields,
  buildSoftDeleteUpdate,
  buildSoftDeleteFilter,
} from '@schemaroute/core'

export type { SoftDeleteFields } from '@schemaroute/core'
