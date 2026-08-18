/**
 * @file handlers/purge.ts
 * @description Factory for the `DELETE /:resource/:id/purge` handler.
 * Only registered when `softDelete` is enabled and `routes.purge.enabled: true`.
 *
 * Behaviour:
 *   - Finds the document by id + scope, filtered to soft-deleted docs only
 *   - Returns 404 when the document does not exist, is live, or is out of scope
 *   - Permanently removes the document from the database (hard delete)
 *   - Runs `beforePurge` and `afterPurge` hooks for side-effects
 *
 * This is intentionally separate from the regular DELETE route so that
 * permanent deletion requires an explicit opt-in from both the server
 * (enabling the route) and the client (calling /purge instead of DELETE).
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import type { ResourceConfig, PurgeRouteConfig, ParsedSchema } from '@schemaroute/core'
import { isValidObjectId, resolveSoftDeleteFields, buildDeletedOnlyFilter } from '@schemaroute/core'
import { buildRequestContext } from '../http/context'
import { sendSuccessResponse, sendErrorResponse, isDisconnectedError } from '../http/response'
import type { Logger } from '../utils/logger'

export function makePurgeHandler(
  resolveModel:   () => Model<unknown>,
  _parsedSchema:  ParsedSchema,
  routeConfig:    PurgeRouteConfig,
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

      const documentToPurge = await model.findOne(findFilter).lean().exec() as Record<string, unknown> | null

      if (!documentToPurge) {
        return sendErrorResponse(expressResponse, 404, 'Resource not found')
      }

      const serialised = { ...documentToPurge, _id: String(documentToPurge['_id']) }

      if (routeConfig.beforePurge) {
        await routeConfig.beforePurge(serialised, requestContext)
      }

      await model.findByIdAndDelete(id)

      if (routeConfig.afterPurge) {
        await routeConfig.afterPurge(serialised, requestContext)
      }

      sendSuccessResponse(expressResponse, { id }, {}, resourceConfig.response)
    } catch (unexpectedError) {
      logger.logError('purge error:', unexpectedError)
      const status  = isDisconnectedError(unexpectedError) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendErrorResponse(expressResponse, status, message)
    }
  }
}
