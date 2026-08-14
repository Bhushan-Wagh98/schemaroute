/**
 * @file handlers/update.ts
 * @description Factory for the `PUT /:resource/:id` document update handler.
 * Validates the ObjectId format, optionally validates the request body,
 * runs lifecycle hooks, and returns the updated document.
 *
 * Hook execution order:
 *   1. `beforeUpdate` — runs first so hook-injected fields (e.g. updatedBy, slug)
 *      are present when the validator checks required fields
 *   2. Schema validation (when `validation: true`)
 *   3. Persist to MongoDB
 *   4. `afterUpdate` — receives the saved document for side-effects
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import { validate } from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, UpdateRouteConfig } from '@schemaroute/core'
import { isValidMongoObjectId } from '../db/document'
import { buildRequestContext } from '../http/context'
import { sendSuccessResponse, sendErrorResponse, isDisconnectedError } from '../http/response'
import type { Logger } from '../logger'

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
  resourceConfig:  ResourceConfig,
  logger:          Logger
) {
  return async (expressRequest: Request, expressResponse: Response) => {
    try {
      const { id: documentId } = expressRequest.params

      if (!isValidMongoObjectId(documentId)) {
        return sendErrorResponse(expressResponse, 400, 'Invalid id format')
      }

      const mongooseModel  = resolveModel()
      const requestContext = buildRequestContext(expressRequest)

      let incomingData = expressRequest.body as Record<string, unknown>
      if (routeConfig.beforeUpdate) {
        // beforeUpdate runs before validation so hook-injected fields are present
        // when required-field checks run. The hook must return the (modified) data —
        // if it returns undefined the original body is used and a warning is logged.
        const hookResult = await routeConfig.beforeUpdate(incomingData, requestContext)
        if (hookResult !== undefined) {
          incomingData = hookResult
        } else {
          logger.logError('beforeUpdate hook returned undefined — using original request body', null)
        }
      }

      if (routeConfig.validation) {
        const validationErrors = validate(
          incomingData,
          parsedSchema
        )
        if (validationErrors.length) {
          return sendErrorResponse(expressResponse, 422, 'Validation failed', validationErrors)
        }

        // Verify that all ObjectId ref fields point to existing documents
        const mongooseModel = resolveModel()
        for (const field of parsedSchema.fields) {
          if (field.type === 'objectid' && field.ref && incomingData[field.name]) {
            const refModel = mongooseModel.db.models[field.ref]
            if (refModel) {
              const exists = await refModel.exists({ _id: incomingData[field.name] })
              if (!exists) {
                return sendErrorResponse(expressResponse, 422, 'Validation failed', [
                  { field: field.name, message: `${field.name} references a non-existent ${field.ref}` },
                ])
              }
            }
          }
        }
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
      logger.logError('update error:', unexpectedError)
      const status = isDisconnectedError(unexpectedError) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendErrorResponse(expressResponse, status, message)
    }
  }
}
