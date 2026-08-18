/**
 * @file handlers/purge.ts
 * @description Fastify handler for `DELETE /:resource/:id/purge`.
 * Only registered when `softDelete` is enabled and `routes.purge.enabled: true`.
 * Returns 404 when the document does not exist, is live, or is out of scope.
 * Permanently removes the document — this cannot be undone.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Model } from 'mongoose'
import { isValidObjectId, resolveSoftDeleteFields, buildDeletedOnlyFilter } from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, PurgeRouteConfig } from '@schemaroute/core'
import { sendSuccess, sendError, isDisconnectedError } from '../http/response'

export function makePurgeHandler(
  resolveModel:   () => Model<unknown>,
  _parsedSchema:  ParsedSchema,
  routeConfig:    PurgeRouteConfig,
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

      const doc = await model.findOne(findFilter).lean().exec() as Record<string, unknown> | null
      if (!doc) return sendError(reply, 404, 'Resource not found')

      const serialised = { ...doc, _id: String(doc['_id']) }
      if (routeConfig.beforePurge) await routeConfig.beforePurge(serialised, ctx)

      await model.findByIdAndDelete(id)

      if (routeConfig.afterPurge) await routeConfig.afterPurge(serialised, ctx)

      sendSuccess(reply, { id }, {}, resourceConfig.response)
    } catch (err) {
      const status  = isDisconnectedError(err) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendError(reply, status, message)
    }
  }
}
