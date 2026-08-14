/**
 * @file handlers/get-one.ts
 * @description Factory for the `GET /:resource/:id` single-document handler.
 * Validates the ObjectId format, applies field projection and ref population,
 * then returns the document or a 404.
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import type { ParsedSchema, ResourceConfig, GetOneRouteConfig } from '@schemaroute/core'
import { isValidMongoObjectId, stripExcludedFields } from '../db/document'
import { sendSuccessResponse, sendErrorResponse, isDisconnectedError } from '../http/response'
import type { Logger } from '../logger'

/**
 * Creates the `GET /:resource/:id` Express handler.
 *
 * @param resolveModel   - Lazy model factory called at request time.
 * @param _parsedSchema  - Parsed schema (unused here, kept for consistent factory signature).
 * @param routeConfig    - Route-level config (overrides resource-level defaults).
 * @param resourceConfig - Resource-level config (defaults applied to all routes).
 */
export function makeGetOneHandler(
  resolveModel:    () => Model<unknown>,
  _parsedSchema:   ParsedSchema,
  routeConfig:     GetOneRouteConfig,
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
      const fieldsToExclude = [
        ...(resourceConfig.exclude ?? []),
        ...(routeConfig.exclude ?? []),
        '__v',
      ]
      const fieldsToSelect = routeConfig.select ?? resourceConfig.select

      // Build projection — MongoDB cannot mix inclusion and exclusion in one projection.
      // When select fields are configured, use inclusion-only and skip the exclusion list.
      // When no select is configured, use exclusion-only.
      const mongoProjection: Record<string, 0 | 1> = {}
      if (fieldsToSelect?.length) {
        // Inclusion projection — only include selected fields that are not excluded
        for (const selectedField of fieldsToSelect) {
          if (!fieldsToExclude.includes(selectedField)) {
            mongoProjection[selectedField] = 1
          }
        }
      } else {
        // Exclusion-only projection
        for (const excludedField of fieldsToExclude) mongoProjection[excludedField] = 0
      }

      let mongooseQuery = mongooseModel.findById(documentId)
      if (Object.keys(mongoProjection).length) {
        mongooseQuery = mongooseQuery.select(mongoProjection)
      }

      const refFieldsToPopulate = routeConfig.populate ?? resourceConfig.populate ?? []
      for (const refFieldName of refFieldsToPopulate) {
        mongooseQuery = mongooseQuery.populate(refFieldName)
      }

      const foundDocument = await mongooseQuery.lean().exec()
      if (!foundDocument) {
        return sendErrorResponse(expressResponse, 404, 'Resource not found')
      }

      const documentTransformFn = routeConfig.transform ?? resourceConfig.transform
      const sanitisedDocument   = stripExcludedFields(
        foundDocument as Record<string, unknown>,
        fieldsToExclude
      )
      const responseData = documentTransformFn
        ? documentTransformFn(sanitisedDocument)
        : sanitisedDocument

      sendSuccessResponse(expressResponse, responseData, {}, resourceConfig.response)
    } catch (unexpectedError) {
      logger.logError('getOne error:', unexpectedError)
      const status = isDisconnectedError(unexpectedError) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendErrorResponse(expressResponse, status, message)
    }
  }
}
