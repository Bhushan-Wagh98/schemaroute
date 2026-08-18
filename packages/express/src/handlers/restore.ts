/**
 * @file handlers/restore.ts
 * @description Factory for the `POST /:resource/:id/restore` handler.
 * Only registered when `softDelete` is enabled and `routes.restore.enabled: true`.
 *
 * Behaviour:
 *   - Finds the document by id + scope, filtered to soft-deleted docs only
 *   - Returns 404 when the document does not exist, is live, or is out of scope
 *   - Clears `deletedAt` and `isDeleted` — document reappears in all reads
 *   - Runs `afterRestore` hook for side-effects (e.g. audit log, re-index)
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import type { ResourceConfig, RestoreRouteConfig, ParsedSchema } from '@schemaroute/core'
import { isValidObjectId, resolveSoftDeleteFields, buildRestoreUpdate, buildDeletedOnlyFilter } from '@schemaroute/core'
import { buildRequestContext } from '../http/context'
import { sendSuccessResponse, sendErrorResponse, isDisconnectedError } from '../http/response'
import { applyExposeFilter } from '../utils/document'
import type { Logger } from '../utils/logger'

export function makeRestoreHandler(
  resolveModel:   () => Model<unknown>,
  _parsedSchema:  ParsedSchema,
  routeConfig:    RestoreRouteConfig,
  resourceConfig: ResourceConfig,
  logger:         Logger
) {
  const softDeleteFields = resolveSoftDeleteFields(resourceConfig.softDelete)!

  return async (expressRequest: Request, expressResponse: Response) => {
    try {
      const { id } = expressRequest.params

      if (!isValidObjectId(id)) {
        return sendErrorResponse(expressResponse, 400, 'Invalid id format')
      }

      const model          = resolveModel()
      const requestContext = buildRequestContext(expressRequest)
      const scopeFilter    = resourceConfig.scope
        ? resourceConfig.scope(expressRequest as unknown as Record<string, unknown>)
        : {}

      // Only match soft-deleted documents — live docs return 404
      const findFilter = { _id: id, ...scopeFilter, ...buildDeletedOnlyFilter(softDeleteFields) }

      const restoredDocument = await model
        .findOneAndUpdate(findFilter, { $set: buildRestoreUpdate(softDeleteFields) }, { new: true })
        .lean()
        .exec() as Record<string, unknown> | null

      if (!restoredDocument) {
        return sendErrorResponse(expressResponse, 404, 'Resource not found')
      }

      if (routeConfig.afterRestore) {
        await routeConfig.afterRestore(restoredDocument, requestContext)
      }

      const responseData = resourceConfig.expose
        ? applyExposeFilter(restoredDocument, resourceConfig.expose)
        : restoredDocument

      sendSuccessResponse(expressResponse, responseData, {}, resourceConfig.response)
    } catch (unexpectedError) {
      logger.logError('restore error:', unexpectedError)
      const status  = isDisconnectedError(unexpectedError) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendErrorResponse(expressResponse, status, message)
    }
  }
}
