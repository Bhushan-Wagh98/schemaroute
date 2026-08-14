/**
 * @file handlers/delete.ts
 * @description Factory for the `DELETE /:resource/:id` document deletion handler.
 * Fetches the document before deletion so lifecycle hooks receive the full
 * document. Returns `{ id }` on success.
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import type { ResourceConfig, DeleteRouteConfig, ParsedSchema } from '@schemaroute/core'
import { isValidMongoObjectId } from '../db/document'
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
  return async (expressRequest: Request, expressResponse: Response) => {
    try {
      const { id: documentId } = expressRequest.params

      if (!isValidMongoObjectId(documentId)) {
        return sendErrorResponse(expressResponse, 400, 'Invalid id format')
      }

      const mongooseModel = resolveModel()

      // Fetch before deletion so hooks receive the full document
      const documentToDelete = await mongooseModel.findById(documentId).lean().exec() as LeanDocument | null
      if (!documentToDelete) {
        return sendErrorResponse(expressResponse, 404, 'Resource not found')
      }

      // Normalise _id to string before passing to hooks
      const serialisedDocument: Record<string, unknown> = {
        ...documentToDelete,
        _id: String(documentToDelete._id),
      }

      const requestContext = buildRequestContext(expressRequest)

      if (routeConfig.beforeDelete) {
        await routeConfig.beforeDelete(serialisedDocument, requestContext)
      }

      await mongooseModel.findByIdAndDelete(documentId)

      if (routeConfig.afterDelete) {
        await routeConfig.afterDelete(serialisedDocument, requestContext)
      }

      sendSuccessResponse(expressResponse, { id: documentId }, {}, resourceConfig.response)
    } catch (unexpectedError) {
      logger.logError('delete error:', unexpectedError)
      const status = isDisconnectedError(unexpectedError) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendErrorResponse(expressResponse, status, message)
    }
  }
}
