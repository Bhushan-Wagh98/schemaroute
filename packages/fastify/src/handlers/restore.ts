/**
 * @file handlers/restore.ts
 * @description Fastify handler for `POST /:resource/:id/restore`.
 * Only registered when `softDelete` is enabled and `routes.restore.enabled: true`.
 * Returns 404 when the document does not exist, is live, or is out of scope.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Model } from 'mongoose'
import {
  isValidObjectId,
  resolveSoftDeleteFields,
  buildRestoreUpdate,
  buildDeletedOnlyFilter,
} from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, RestoreRouteConfig } from '@schemaroute/core'
import { sendSuccess, sendError, isDisconnectedError } from '../http/response'

export function makeRestoreHandler(
  resolveModel:   () => Model<unknown>,
  _parsedSchema:  ParsedSchema,
  routeConfig:    RestoreRouteConfig,
  resourceConfig: ResourceConfig
) {
  const softDeleteFields = resolveSoftDeleteFields(resourceConfig.softDelete)!

  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string }
      if (!isValidObjectId(id)) return sendError(reply, 400, 'Invalid id format')

      const model       = resolveModel()
      const scopeFilter = resourceConfig.scope
        ? resourceConfig.scope(req as unknown as Record<string, unknown>)
        : {}
      const ctx = { headers: req.headers as any, query: req.query as any, params: req.params as any, user: (req as any).user, req: req as unknown as Record<string, unknown> }

      const findFilter = { _id: id, ...scopeFilter, ...buildDeletedOnlyFilter(softDeleteFields) }

      const restored = await model
        .findOneAndUpdate(findFilter, { $set: buildRestoreUpdate(softDeleteFields) }, { new: true })
        .lean().exec() as Record<string, unknown> | null

      if (!restored) return sendError(reply, 404, 'Resource not found')

      if (routeConfig.afterRestore) await routeConfig.afterRestore(restored, ctx)

      const exposed = resourceConfig.expose
        ? (() => { const r: Record<string, unknown> = {}; for (const f of resourceConfig.expose!) if (f in restored) r[f] = restored[f]; if (!resourceConfig.expose!.includes('_id') && '_id' in restored) r['_id'] = restored['_id']; return r })()
        : restored
      sendSuccess(reply, exposed, {}, resourceConfig.response)
    } catch (err) {
      const status  = isDisconnectedError(err) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendError(reply, status, message)
    }
  }
}
