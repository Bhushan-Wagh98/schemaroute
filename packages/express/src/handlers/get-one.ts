/**
 * @file handlers/get-one.ts
 * @description Factory for the `GET /:resource/:id` single-document handler.
 * Validates the ObjectId format, applies field projection and ref population,
 * then returns the document or a 404.
 *
 * Supports:
 *   - Config-level populate with optional field selection: `populate: [{ path: 'category', select: 'name slug' }]`
 *   - Query-level populate: `?populate=category,brand`
 *   - Query-level field selection: `?fields=name,price` (mirrors getAll behaviour)
 *   - `expose` whitelist: applied as the final gate — only listed fields leave the API
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import type { ParsedSchema, ResourceConfig, GetOneRouteConfig, PopulateOption } from '@schemaroute/core'
import { isValidObjectId, toMongoosePopulate } from '@schemaroute/core'
import { stripExcludedFields, applyTransformWithValidation, applyExposeFilter } from '../utils/document'
import { resolveSoftDeleteFields, buildSoftDeleteFilter } from '@schemaroute/core'
import { sendSuccessResponse, sendErrorResponse, isDisconnectedError } from '../http/response'
import type { Logger } from '../utils/logger'

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

      if (!isValidObjectId(documentId)) {
        return sendErrorResponse(expressResponse, 400, 'Invalid id format')
      }

      const mongooseModel  = resolveModel()

      // Build find filter — merge scope and soft-delete exclusion so getOne
      // respects the same tenant/user restriction as getAll, and returns 404
      // for soft-deleted documents instead of leaking them.
      const scopeFilter      = resourceConfig.scope
        ? resourceConfig.scope(expressRequest as unknown as Record<string, unknown>)
        : {}
      const softDeleteFields = resolveSoftDeleteFields(resourceConfig.softDelete)
      const softDeleteFilter = softDeleteFields ? buildSoftDeleteFilter(softDeleteFields) : {}
      const findFilter       = { _id: documentId, ...scopeFilter, ...softDeleteFilter }
      const fieldsToExclude = [
        ...(resourceConfig.exclude ?? []),
        ...(routeConfig.exclude ?? []),
        '__v',
      ]

      // ?fields= query param — mirrors getAll behaviour.
      // Priority: query param > routeConfig.select > resourceConfig.select.
      // When active, only the listed fields are fetched from MongoDB via projection.
      const queryFieldsParam = expressRequest.query['fields']
      const queryFields = queryFieldsParam
        ? String(queryFieldsParam).split(',').map(f => f.trim()).filter(Boolean)
        : null

      const fieldsToSelect = queryFields ?? routeConfig.select ?? resourceConfig.select

      const mongoProjection: Record<string, 0 | 1> = {}
      if (fieldsToSelect?.length) {
        for (const selectedField of fieldsToSelect) {
          if (!fieldsToExclude.includes(selectedField)) {
            mongoProjection[selectedField] = 1
          }
        }
      } else {
        for (const excludedField of fieldsToExclude) mongoProjection[excludedField] = 0
      }

      let mongooseQuery = mongooseModel.findOne(findFilter)
      if (Object.keys(mongoProjection).length) {
        mongooseQuery = mongooseQuery.select(mongoProjection)
      }

      // Merge config-level populate with ?populate= query param
      const configPopulate: PopulateOption[] = routeConfig.populate ?? resourceConfig.populate ?? []
      const queryPopulateParam = expressRequest.query['populate']
      const queryPopulateFields: PopulateOption[] = queryPopulateParam
        ? String(queryPopulateParam).split(',').map(f => f.trim())
        : []

      // Deduplicate by path — config entries win (they may carry a select)
      const seenPaths = new Set<string>()
      const allPopulate: PopulateOption[] = []
      for (const opt of [...configPopulate, ...queryPopulateFields]) {
        const path = typeof opt === 'string' ? opt : opt.path
        if (!seenPaths.has(path)) {
          seenPaths.add(path)
          allPopulate.push(opt)
        }
      }

      for (const populateOpt of allPopulate) {
        mongooseQuery = mongooseQuery.populate(toMongoosePopulate(populateOpt) as any)
      }
      const foundDocument = await mongooseQuery.lean().exec()
      if (!foundDocument) {
        return sendErrorResponse(expressResponse, 404, 'Resource not found')
      }

      const documentTransformFn = routeConfig.transform ?? resourceConfig.transform
      const debugWarn            = resourceConfig.debug ? (msg: string) => logger.logError(msg, null) : undefined
      const sanitisedDocument   = stripExcludedFields(
        foundDocument as Record<string, unknown>,
        fieldsToExclude
      )
      const transformedDocument = documentTransformFn
        ? applyTransformWithValidation(sanitisedDocument, documentTransformFn, debugWarn)
        : sanitisedDocument
      // expose whitelist — applied last so it wins over transform and populate.
      // Sensitive fields (password, tokens, internal flags) can never leak
      // regardless of what transform or populate returns.
      const responseData = resourceConfig.expose
        ? applyExposeFilter(transformedDocument, resourceConfig.expose)
        : transformedDocument

      sendSuccessResponse(expressResponse, responseData, {}, resourceConfig.response)
    } catch (unexpectedError) {
      logger.logError('getOne error:', unexpectedError)
      const status  = isDisconnectedError(unexpectedError) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendErrorResponse(expressResponse, status, message)
    }
  }
}
