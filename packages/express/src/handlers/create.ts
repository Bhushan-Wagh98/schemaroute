/**
 * @file handlers/create.ts
 * @description Factory for the `POST /:resource` document creation handler.
 *
 * Hook execution order:
 *   1. `beforeCreate` — runs first so computed fields (e.g. slug) are present
 *      when the validator checks required fields
 *   2. Schema validation (when `validation: true`)
 *   3. Persist to MongoDB
 *   4. `afterCreate` — receives the saved document for side-effects
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import { validate } from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, CreateRouteConfig } from '@schemaroute/core'
import { buildRequestContext } from '../http/context'
import { sendSuccessResponse, sendErrorResponse, isDisconnectedError } from '../http/response'
import type { Logger } from '../logger'

/**
 * Creates the `POST /:resource` Express handler.
 *
 * @param resolveModel   - Lazy model factory called at request time.
 * @param parsedSchema   - Parsed schema used for body validation.
 * @param routeConfig    - Route-level config (overrides resource-level defaults).
 * @param resourceConfig - Resource-level config (defaults applied to all routes).
 */
export function makeCreateHandler(
  resolveModel:    () => Model<unknown>,
  parsedSchema:    ParsedSchema,
  routeConfig:     CreateRouteConfig,
  resourceConfig:  ResourceConfig,
  logger:          Logger
) {
  return async (expressRequest: Request, expressResponse: Response) => {
    try {
      const mongooseModel  = resolveModel()
      const requestContext = buildRequestContext(expressRequest)
      let   incomingData   = expressRequest.body as Record<string, unknown>

      // beforeCreate runs before validation so hooks can inject computed fields
      // (e.g. auto-generating a slug from name) before required-field checks run.
      // The hook must return the (modified) data — if it returns undefined the
      // original body is used and a warning is logged.
      if (routeConfig.beforeCreate) {
        const hookResult = await routeConfig.beforeCreate(incomingData, requestContext)
        if (hookResult !== undefined) {
          incomingData = hookResult
        } else {
          logger.logError('beforeCreate hook returned undefined — using original request body', null)
        }
      }

      if (routeConfig.validation) {
        const validationErrors = validate(incomingData, parsedSchema)
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

      const createdDocument = await mongooseModel.create(incomingData)
      const plainDocument   = (
        createdDocument as unknown as { toObject: () => Record<string, unknown> }
      ).toObject()

      // Normalise _id to a plain string so hooks always receive a serialisable object
      if (plainDocument['_id']) {
        plainDocument['_id'] = String(plainDocument['_id'])
      }

      if (routeConfig.afterCreate) {
        await routeConfig.afterCreate(plainDocument, requestContext)
      }

      const documentTransformFn = routeConfig.transform ?? resourceConfig.transform
      const responseData        = documentTransformFn
        ? documentTransformFn(plainDocument)
        : plainDocument

      sendSuccessResponse(expressResponse, responseData, {}, resourceConfig.response, 201)
    } catch (unexpectedError) {
      logger.logError('create error:', unexpectedError)
      const status = isDisconnectedError(unexpectedError) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendErrorResponse(expressResponse, status, message)
    }
  }
}
