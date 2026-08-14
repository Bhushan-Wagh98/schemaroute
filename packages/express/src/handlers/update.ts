/**
 * @file handlers/update.ts
 * @description Factory for the `PUT /:resource/:id` document update handler.
 * Validates the ObjectId format, optionally validates the request body,
 * runs lifecycle hooks, and returns the updated document.
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import { validate } from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, UpdateRouteConfig } from '@schemaroute/core'
import { isValidMongoObjectId } from '../db/document'
import { buildRequestContext } from '../http/context'
import { sendSuccessResponse, sendErrorResponse } from '../http/response'
import { logError } from '../logger'

/**
 * Creates the `PUT /:resource/:id` Express handler.
 *
 * @param resolveModel   - Lazy model factory called at request time.
 * @param parsedSchema   - Parsed schema used for body validation.
 * @param routeConfig    - Route-level config (overrides resource-level defaults).
 * @param resourceConfig - Resource-level config (defaults applied to all routes).
 */
export function makeUpdateHandler(
  resolveModel:    () => Model<unknown>,
  parsedSchema:    ParsedSchema,
  routeConfig:     UpdateRouteConfig,
  resourceConfig:  ResourceConfig
) {
  return async (expressRequest: Request, expressResponse: Response) => {
    try {
      const { id: documentId } = expressRequest.params

      if (!isValidMongoObjectId(documentId)) {
        return sendErrorResponse(expressResponse, 400, 'Invalid id format')
      }

      const mongooseModel  = resolveModel()
      const requestContext = buildRequestContext(expressRequest)

      if (routeConfig.validation) {
        const validationErrors = validate(
          expressRequest.body as Record<string, unknown>,
          parsedSchema
        )
        if (validationErrors.length) {
          return sendErrorResponse(expressResponse, 422, 'Validation failed', validationErrors)
        }
      }

      let incomingData = expressRequest.body as Record<string, unknown>
      if (routeConfig.beforeUpdate) {
        incomingData = await routeConfig.beforeUpdate(incomingData, requestContext) ?? incomingData
      }

      const updatedDocument = await mongooseModel
        .findByIdAndUpdate(documentId, incomingData, { new: true, runValidators: true })
        .lean()
        .exec()

      if (!updatedDocument) {
        return sendErrorResponse(expressResponse, 404, 'Resource not found')
      }

      if (routeConfig.afterUpdate) {
        await routeConfig.afterUpdate(updatedDocument as Record<string, unknown>, requestContext)
      }

      const documentTransformFn = routeConfig.transform ?? resourceConfig.transform
      const responseData        = documentTransformFn
        ? documentTransformFn(updatedDocument as Record<string, unknown>)
        : updatedDocument

      sendSuccessResponse(expressResponse, responseData, {}, resourceConfig.response)
    } catch (unexpectedError) {
      logError('update error:', unexpectedError)
      sendErrorResponse(expressResponse, 500, 'Internal server error')
    }
  }
}
