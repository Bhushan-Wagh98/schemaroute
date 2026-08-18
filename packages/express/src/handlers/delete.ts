/**
 * @file handlers/delete.ts
 * @description Factory for the `DELETE /:resource/:id` document deletion handler.
 * Supports both hard delete (default) and soft delete (`softDelete` config option).
 *
 * Hard delete: removes the document from the database permanently.
 * Soft delete: sets `deletedAt` + `isDeleted` (or custom field names) on the
 *   document instead of removing it. The document remains in the database and
 *   can be restored via PATCH.
 *
 * Hook execution order (both modes):
 *   1. `beforeDelete` — receives the full document before deletion/soft-delete
 *   2. DB operation   — hard delete or $set soft-delete fields
 *   3. `afterDelete`  — receives the document for side-effects
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import type { ResourceConfig, DeleteRouteConfig, ParsedSchema } from '@schemaroute/core'
import { isValidObjectId } from '@schemaroute/core'
import { resolveSoftDeleteFields, buildSoftDeleteUpdate, buildSoftDeleteFilter } from '../db/soft-delete'
import { buildRequestContext } from '../http/context'
import { sendSuccessResponse, sendErrorResponse, isDisconnectedError } from '../http/response'
import type { Logger } from '../logger'

/** Shape of a lean Mongoose document with a guaranteed `_id` field. */
interface LeanDocument extends Record<string, unknown> {
  _id: unknown
}

/**
 * Creates the `DELETE /:resource/:id` Express handler.
 *
 * @param resolveModel   - Lazy model factory called at request time.
 * @param _parsedSchema  - Parsed schema (unused here, kept for consistent factory signature).
 * @param routeConfig    - Route-level config (overrides resource-level defaults).
 * @param resourceConfig - Resource-level config (defaults applied to all routes).
 */
export function makeDeleteHandler(
  resolveModel:    () => Model<unknown>,
  _parsedSchema:   ParsedSchema,
  routeConfig:     DeleteRouteConfig,
  resourceConfig:  ResourceConfig,
  logger:          Logger
) {
  const softDeleteFields = resolveSoftDeleteFields(resourceConfig.softDelete)

  return async (expressRequest: Request, expressResponse: Response) => {
    try {
      const { id: documentId } = expressRequest.params

      if (!isValidObjectId(documentId)) {
        return sendErrorResponse(expressResponse, 400, 'Invalid id format')
      }

      const mongooseModel = resolveModel()

      // Build the find filter — merge scope so a tenant cannot delete another
      // tenant's document (returns 404 instead of leaking existence), and when
      // soft delete is enabled exclude already-deleted docs so a second DELETE
      // also returns 404 rather than a silent no-op.
      const scopeFilter = resourceConfig.scope
        ? resourceConfig.scope(expressRequest as unknown as Record<string, unknown>)
        : {}
      const findFilter: Record<string, unknown> = { _id: documentId, ...scopeFilter }
      if (softDeleteFields) {
        Object.assign(findFilter, buildSoftDeleteFilter(softDeleteFields))
      }

      const documentToDelete = await mongooseModel.findOne(findFilter).lean().exec() as LeanDocument | null
      if (!documentToDelete) {
        return sendErrorResponse(expressResponse, 404, 'Resource not found')
      }

      const serialisedDocument: Record<string, unknown> = {
        ...documentToDelete,
        _id: String(documentToDelete._id),
      }

      const requestContext = buildRequestContext(expressRequest)

      if (routeConfig.beforeDelete) {
        await routeConfig.beforeDelete(serialisedDocument, requestContext)
      }

      if (softDeleteFields) {
        // Soft delete — update the document in place
        await mongooseModel.findByIdAndUpdate(documentId, { $set: buildSoftDeleteUpdate(softDeleteFields) })
      } else {
        // Hard delete — remove permanently
        await mongooseModel.findByIdAndDelete(documentId)
      }

      if (routeConfig.afterDelete) {
        await routeConfig.afterDelete(serialisedDocument, requestContext)
      }

      sendSuccessResponse(expressResponse, { id: documentId }, {}, resourceConfig.response)
    } catch (unexpectedError) {
      logger.logError('delete error:', unexpectedError)
      const status  = isDisconnectedError(unexpectedError) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendErrorResponse(expressResponse, status, message)
    }
  }
}
