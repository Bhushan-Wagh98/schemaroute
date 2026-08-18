/**
 * @file handlers/update.ts
 * @description Factory for the `PUT /:resource/:id` document update handler.
 * Validates the ObjectId format, optionally validates the request body,
 * runs lifecycle hooks, and returns the updated document.
 *
 * Hook execution order:
 *   1. `writable` filter  — strips fields not in the whitelist before anything else runs
 *   2. `beforeUpdate`     — runs before validation so hook-injected fields are present
 *   3. Schema validation  — when `validation: true`, all required fields must be present
 *   4. Persist to MongoDB
 *   5. `afterUpdate`      — receives the saved document for side-effects
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import { validate } from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, UpdateRouteConfig } from '@schemaroute/core'
import { isValidObjectId } from '@schemaroute/core'
import { buildRequestContext } from '../http/context'
import { sendSuccessResponse, sendErrorResponse, isDisconnectedError } from '../http/response'
import { applyTransformWithValidation, applyExposeFilter, applyWritableFilter } from '../utils/document'
import type { Logger } from '../utils/logger'

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

      if (!isValidObjectId(documentId)) {
        return sendErrorResponse(expressResponse, 400, 'Invalid id format')
      }

      const mongooseModel  = resolveModel()
      const requestContext = buildRequestContext(expressRequest)

      let incomingData = expressRequest.body as Record<string, unknown>
      if (resourceConfig.writable) {
        incomingData = applyWritableFilter(incomingData, resourceConfig.writable)
      }
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
        .findOneAndUpdate(
          { _id: documentId, ...(resourceConfig.scope ? resourceConfig.scope(expressRequest as unknown as Record<string, unknown>) : {}) },
          incomingData,
          { new: true, runValidators: true }
        )
        .lean()
        .exec()

      if (!updatedDocument) {
        return sendErrorResponse(expressResponse, 404, 'Resource not found')
      }

      if (routeConfig.afterUpdate) {
        await routeConfig.afterUpdate(updatedDocument as Record<string, unknown>, requestContext)
      }

      const documentTransformFn = routeConfig.transform ?? resourceConfig.transform
      const debugWarn            = resourceConfig.debug ? (msg: string) => logger.logError(msg, null) : undefined
      const transformedDocument = documentTransformFn
        ? applyTransformWithValidation(updatedDocument as Record<string, unknown>, documentTransformFn, debugWarn)
        : updatedDocument
      const responseData = resourceConfig.expose
        ? applyExposeFilter(transformedDocument as Record<string, unknown>, resourceConfig.expose)
        : transformedDocument

      sendSuccessResponse(expressResponse, responseData, {}, resourceConfig.response)
    } catch (unexpectedError) {
      logger.logError('update error:', unexpectedError)
      const status = isDisconnectedError(unexpectedError) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendErrorResponse(expressResponse, status, message)
    }
  }
}
