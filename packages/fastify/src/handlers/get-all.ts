/**
 * @file handlers/get-all.ts
 * @description Fastify handler for `GET /:resource`.
 * Supports filtering, search, sorting, field projection, population,
 * page and cursor pagination, scope, and soft delete exclusion.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Model } from 'mongoose'
import {
  resolveQuery,
  buildMeta,
  toMongoosePopulate,
  resolveSoftDeleteFields,
  buildSoftDeleteFilter,
} from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, GetAllRouteConfig } from '@schemaroute/core'
import { sendSuccess, sendError, isDisconnectedError } from '../http/response'

export function makeGetAllHandler(
  resolveModel:   () => Model<unknown>,
  parsedSchema:   ParsedSchema,
  routeConfig:    GetAllRouteConfig,
  resourceConfig: ResourceConfig
) {
  const softDeleteFields = resolveSoftDeleteFields(resourceConfig.softDelete)
  const softDeleteFilter = softDeleteFields ? buildSoftDeleteFilter(softDeleteFields) : {}

  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const model       = resolveModel()
      const scopeFilter = resourceConfig.scope
        ? resourceConfig.scope(req as unknown as Record<string, unknown>)
        : {}

      const resolvedQuery = resolveQuery(
        req.query as Record<string, string>,
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
      if (resolvedQuery.errors.length) return sendError(reply, 400, resolvedQuery.errors[0]!)

      const findFilter: Record<string, unknown> = { ...resolvedQuery.filter, ...scopeFilter, ...softDeleteFilter }
      if (resolvedQuery.pagination?.type === 'cursor' && resolvedQuery.pagination.cursor) {
        findFilter['_id'] = { $gt: resolvedQuery.pagination.cursor }
      }

      let q = model.find(findFilter)
      if (resolvedQuery.projection) q = q.select(resolvedQuery.projection)
      if (Object.keys(resolvedQuery.sort).length) q = q.sort(resolvedQuery.sort)

      // When ?fields= is active, only populate ref fields that were explicitly
      // included — skip the rest so they don't bleed through the projection
      const requestedFields = (req.query as Record<string, string>)['fields']
        ? String((req.query as Record<string, string>)['fields']).split(',').map(f => f.trim())
        : null
      const fieldsToPopulate = requestedFields
        ? resolvedQuery.populate.filter(opt => requestedFields.includes(typeof opt === 'string' ? opt : opt.path))
        : resolvedQuery.populate
      for (const opt of fieldsToPopulate) q = q.populate(toMongoosePopulate(opt) as any)

      if (resolvedQuery.pagination?.type === 'page') {
        q = q.skip(resolvedQuery.pagination.skip).limit(resolvedQuery.pagination.limit)
      } else if (resolvedQuery.pagination?.type === 'cursor') {
        // Fetch one extra to determine hasNextPage without a separate count query
        q = q.limit(resolvedQuery.pagination.limit + 1)
      }

      // countDocuments uses base filter only so meta.total reflects the full
      // matching collection size regardless of cursor position
      const baseFilter = { ...resolvedQuery.filter, ...scopeFilter, ...softDeleteFilter }
      const [docs, total] = await Promise.all([q.lean().exec(), model.countDocuments(baseFilter)])

      let nextCursor: string | undefined
      let results = docs as Record<string, unknown>[]
      if (resolvedQuery.pagination?.type === 'cursor') {
        const hasNext = results.length > resolvedQuery.pagination.limit
        if (hasNext) results = results.slice(0, -1)
        nextCursor = hasNext && results[results.length - 1]
          ? String(results[results.length - 1]!['_id'])
          : undefined
      }

      // expose whitelist — applied last, after any transform
      const finalResults = resourceConfig.expose
        ? results.map(d => { const r: Record<string, unknown> = {}; for (const f of resourceConfig.expose!) if (f in d) r[f] = d[f]; if (!resourceConfig.expose!.includes('_id') && '_id' in d) r['_id'] = d['_id']; return r })
        : results

      sendSuccess(reply, finalResults, buildMeta(resolvedQuery.pagination, total, nextCursor), resourceConfig.response)
    } catch (err) {
      const status  = isDisconnectedError(err) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendError(reply, status, message)
    }
  }
}
