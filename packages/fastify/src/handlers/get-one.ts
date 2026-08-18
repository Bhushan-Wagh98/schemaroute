/**
 * @file handlers/get-one.ts
 * @description Fastify handler for `GET /:resource/:id`.
 * Validates ObjectId, applies scope and soft-delete filter, merges
 * config-level and query-level populate, supports ?fields= projection,
 * applies transform, and returns the document or 404.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Model } from 'mongoose'
import {
  isValidObjectId,
  toMongoosePopulate,
  resolveSoftDeleteFields,
  buildSoftDeleteFilter,
} from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, GetOneRouteConfig, PopulateOption } from '@schemaroute/core'
import { sendSuccess, sendError, isDisconnectedError } from '../http/response'

export function makeGetOneHandler(
  resolveModel:   () => Model<unknown>,
  _parsedSchema:  ParsedSchema,
  routeConfig:    GetOneRouteConfig,
  resourceConfig: ResourceConfig
) {
  const softDeleteFields = resolveSoftDeleteFields(resourceConfig.softDelete)
  const softDeleteFilter = softDeleteFields ? buildSoftDeleteFilter(softDeleteFields) : {}

  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string }
      if (!isValidObjectId(id)) return sendError(reply, 400, 'Invalid id format')

      const model       = resolveModel()
      const scopeFilter = resourceConfig.scope
        ? resourceConfig.scope(req as unknown as Record<string, unknown>)
        : {}
      const findFilter  = { _id: id, ...scopeFilter, ...softDeleteFilter }

      // ?fields= query param — takes precedence over routeConfig.select
      const fieldsParam = (req.query as Record<string, string>)['fields']
      const requestedFields = fieldsParam
        ? fieldsParam.split(',').map(f => f.trim())
        : null

      // Merge config-level populate with ?populate= query param.
      // Config entries take precedence — they may carry a select restriction
      // that the client cannot override via the query param.
      const configPopulate: PopulateOption[] = routeConfig.populate ?? resourceConfig.populate ?? []
      const queryPopulate: PopulateOption[]  = (req.query as Record<string, string>)['populate']
        ? String((req.query as Record<string, string>)['populate']).split(',').map(f => f.trim())
        : []
      const seenPaths    = new Set<string>()
      const allPopulate: PopulateOption[] = []
      for (const opt of [...configPopulate, ...queryPopulate]) {
        const path = typeof opt === 'string' ? opt : opt.path
        if (!seenPaths.has(path)) { seenPaths.add(path); allPopulate.push(opt) }
      }

      // When ?fields= is active, only populate ref fields that were explicitly listed
      const fieldsToPopulate = requestedFields
        ? allPopulate.filter(opt => requestedFields.includes(typeof opt === 'string' ? opt : opt.path))
        : allPopulate

      let q = model.findOne(findFilter)

      // Apply field projection
      if (requestedFields) {
        q = q.select(requestedFields.join(' '))
      } else if (routeConfig.select?.length) {
        q = q.select(routeConfig.select.join(' '))
      } else if (resourceConfig.select?.length) {
        q = q.select(resourceConfig.select.join(' '))
      }

      for (const opt of fieldsToPopulate) q = q.populate(toMongoosePopulate(opt) as any)

      const doc = await q.lean().exec()
      if (!doc) return sendError(reply, 404, 'Resource not found')

      // Apply transform
      const transformFn = routeConfig.transform ?? resourceConfig.transform
      const transformed = transformFn
        ? transformFn(doc as Record<string, unknown>)
        : doc as Record<string, unknown>

      // Apply expose whitelist as final gate
      const exposed = resourceConfig.expose
        ? (() => {
            const r: Record<string, unknown> = {}
            const d = transformed
            for (const f of resourceConfig.expose!) if (f in d) r[f] = d[f]
            if (!resourceConfig.expose!.includes('_id') && '_id' in d) r['_id'] = d['_id']
            return r
          })()
        : transformed

      sendSuccess(reply, exposed, {}, resourceConfig.response)
    } catch (err) {
      const status  = isDisconnectedError(err) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendError(reply, status, message)
    }
  }
}
