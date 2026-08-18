/**
 * @file handlers/get-all.ts
 * @description Factory for the `GET /:resource` list handler.
 * Supports filtering, full-text search, sorting, field projection,
 * ref population, and both page-based and cursor-based pagination.
 */

import type { Request, Response } from 'express'
import type { Model } from 'mongoose'
import { resolveQuery, buildMeta, toMongoosePopulate } from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, GetAllRouteConfig } from '@schemaroute/core'
import { stripExcludedFields, applyDocumentTransform, applyTransformWithValidation, applyExposeFilter } from '../utils/document'
import { resolveSoftDeleteFields, buildSoftDeleteFilter } from '@schemaroute/core'
import { sendSuccessResponse, sendErrorResponse, isDisconnectedError } from '../http/response'
import type { Logger } from '../utils/logger'

/**
 * Creates the `GET /:resource` Express handler.
 *
 * Query params supported:
 *   - `?search=`      full-text search across string fields
 *   - `?sort=&order=` field sort with asc/desc direction
 *   - `?fields=`      comma-separated field inclusion
 *   - `?populate=`    comma-separated ref fields to populate
 *   - `?page=&limit=` page-based pagination
 *   - `?cursor=`      cursor-based pagination
 *   - `?<fieldName>=` direct field filter
 *
 * @param resolveModel   - Lazy model factory called at request time.
 * @param parsedSchema   - Parsed schema for query resolution and validation.
 * @param routeConfig    - Route-level config (overrides resource-level defaults).
 * @param resourceConfig - Resource-level config (defaults applied to all routes).
 */
export function makeGetAllHandler(
  resolveModel:    () => Model<unknown>,
  parsedSchema:    ParsedSchema,
  routeConfig:     GetAllRouteConfig,
  resourceConfig:  ResourceConfig,
  logger:          Logger
) {
  return async (expressRequest: Request, expressResponse: Response) => {
    try {
      const mongooseModel = resolveModel()

      // ── Scope filter ──────────────────────────────────────────────────────
      // Merge scope function result into the base filter so every query is
      // automatically restricted to the current request's tenant/user.
      const scopeFilter = resourceConfig.scope
        ? resourceConfig.scope(expressRequest as unknown as Record<string, unknown>)
        : {}

      const resolvedQuery = resolveQuery(
        expressRequest.query as Record<string, string>,
        parsedSchema,
        {
          pagination:  routeConfig.pagination  ?? resourceConfig.pagination,
          search:      routeConfig.search      ?? resourceConfig.search,
          searchField: routeConfig.searchField,
          sort:        routeConfig.sort,
          fields:      routeConfig.fields,
          select:      routeConfig.select   ?? resourceConfig.select,
          exclude:     [...(resourceConfig.exclude ?? []), ...(routeConfig.exclude ?? [])],
          populate:    routeConfig.populate ?? resourceConfig.populate,
        }
      )

      if (resolvedQuery.errors.length > 0) {
        sendErrorResponse(expressResponse, 400, resolvedQuery.errors[0]!)
        return
      }

      // ── Soft delete filter ────────────────────────────────────────────────
      // Automatically exclude soft-deleted documents from all list queries.
      const softDeleteFields = resolveSoftDeleteFields(resourceConfig.softDelete)
      const softDeleteFilter = softDeleteFields ? buildSoftDeleteFilter(softDeleteFields) : {}

      // Cursor pagination — build a separate find filter that includes the _id
      // greater-than constraint. countDocuments uses the base filter only so
      // `total` always reflects the full matching collection size, not just the
      // remaining documents after the cursor.
      const findFilter = { ...resolvedQuery.filter, ...scopeFilter, ...softDeleteFilter }
      if (resolvedQuery.pagination?.type === 'cursor' && resolvedQuery.pagination.cursor) {
        findFilter['_id'] = { $gt: resolvedQuery.pagination.cursor }
      }

      let mongooseQuery = mongooseModel.find(findFilter)

      if (resolvedQuery.projection) {
        mongooseQuery = mongooseQuery.select(resolvedQuery.projection)
      }
      if (Object.keys(resolvedQuery.sort).length) {
        mongooseQuery = mongooseQuery.sort(resolvedQuery.sort)
      }

      // When an inclusion projection is active (?fields=), only populate ref
      // fields that were explicitly included — skip the rest so they don't
      // bleed through despite not being in the projection.
      const requestedFields = expressRequest.query['fields']
        ? String(expressRequest.query['fields']).split(',').map(f => f.trim())
        : null
      const fieldsToPopulate = requestedFields
        ? resolvedQuery.populate.filter(opt => {
            const path = typeof opt === 'string' ? opt : opt.path
            return requestedFields.includes(path)
          })
        : resolvedQuery.populate

      for (const populateOpt of fieldsToPopulate) {
        mongooseQuery = mongooseQuery.populate(toMongoosePopulate(populateOpt) as any)
      }

      if (resolvedQuery.pagination?.type === 'page') {
        mongooseQuery = mongooseQuery
          .skip(resolvedQuery.pagination.skip)
          .limit(resolvedQuery.pagination.limit)
      } else if (resolvedQuery.pagination?.type === 'cursor') {
        // Fetch one extra document to determine whether a next page exists
        mongooseQuery = mongooseQuery.limit(resolvedQuery.pagination.limit + 1)
      }

      // Execute find and count in parallel.
      // find uses findFilter (base filter + optional cursor _id constraint).
      // countDocuments uses the base filter only so meta.total always reflects
      // the full matching collection size regardless of cursor position.
      const baseFilter = { ...resolvedQuery.filter, ...scopeFilter, ...softDeleteFilter }
      const [fetchedDocuments, totalDocumentCount] = await Promise.all([
        mongooseQuery.lean().exec(),
        mongooseModel.countDocuments(baseFilter),
      ])

      let nextPageCursor: string | undefined
      let resultDocuments = fetchedDocuments as Record<string, unknown>[]

      if (resolvedQuery.pagination?.type === 'cursor') {
        const hasNextPage = resultDocuments.length > resolvedQuery.pagination.limit
        if (hasNextPage) resultDocuments = resultDocuments.slice(0, -1)
        const lastDocument = resultDocuments[resultDocuments.length - 1]
        nextPageCursor = hasNextPage && lastDocument
          ? String(lastDocument['_id'])
          : undefined
      }

      const fieldsToExclude = [
        '__v',
        ...(resourceConfig.exclude ?? []),
        ...(routeConfig.exclude ?? []),
      ]
      const documentTransformFn = routeConfig.transform ?? resourceConfig.transform
      const debugWarn            = resourceConfig.debug ? (msg: string) => logger.logError(msg, null) : undefined
      const responseMeta        = buildMeta(resolvedQuery.pagination, totalDocumentCount, nextPageCursor)
      const sanitisedDocuments  = resultDocuments.map(doc => stripExcludedFields(doc, fieldsToExclude))
      const responseData        = documentTransformFn
        ? applyDocumentTransform(sanitisedDocuments, documentTransformFn, debugWarn)
        : sanitisedDocuments
      const finalData = resourceConfig.expose
        ? responseData.map(doc => applyExposeFilter(doc, resourceConfig.expose!))
        : responseData

      sendSuccessResponse(expressResponse, finalData, responseMeta, resourceConfig.response)
    } catch (unexpectedError) {
      logger.logError('getAll error:', unexpectedError)
      const status = isDisconnectedError(unexpectedError) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendErrorResponse(expressResponse, status, message)
    }
  }
}
