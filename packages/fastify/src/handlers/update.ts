/**
 * @file handlers/update.ts
 * @description Fastify handler for `PUT /:resource/:id` — full document replacement.
 * Scope filter prevents cross-tenant writes (returns 404, not 403).
 *
 * Hook execution order:
 *   1. `beforeUpdate` — runs before validation so hook-injected fields are present
 *   2. Schema validation (when `validation: true`) — all required fields must be present
 *   3. Persist to MongoDB
 *   4. `afterUpdate` — receives the saved document for side-effects
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Model } from 'mongoose'
import { isValidObjectId, validate } from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, UpdateRouteConfig } from '@schemaroute/core'
import { sendSuccess, sendError, isDisconnectedError } from '../http/response'

export function makeUpdateHandler(
  resolveModel:   () => Model<unknown>,
  parsedSchema:   ParsedSchema,
  routeConfig:    UpdateRouteConfig,
  resourceConfig: ResourceConfig
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = req.params as { id: string }
      if (!isValidObjectId(id)) return sendError(reply, 400, 'Invalid id format')

      const model       = resolveModel()
      const scopeFilter = resourceConfig.scope
        ? resourceConfig.scope(req as unknown as Record<string, unknown>)
        : {}
      let   data        = { ...(req.body as Record<string, unknown>) }
      const ctx         = { headers: req.headers as any, query: req.query as any, params: req.params as any, user: (req as any).user, req: req as unknown as Record<string, unknown> }

      if (routeConfig.beforeUpdate) {
        const result = await routeConfig.beforeUpdate(data, ctx)
        if (result !== undefined) data = result
      }

      if (routeConfig.validation) {
        const errors = validate(data, parsedSchema)
        if (errors.length) return sendError(reply, 422, 'Validation failed', errors)
      }

      const updated = await model
        .findOneAndUpdate({ _id: id, ...scopeFilter }, data, { new: true, runValidators: true })
        .lean().exec()
      if (!updated) return sendError(reply, 404, 'Resource not found')

      if (routeConfig.afterUpdate) await routeConfig.afterUpdate(updated as Record<string, unknown>, ctx)

      const exposed = resourceConfig.expose
        ? (() => { const r: Record<string, unknown> = {}; const d = updated as Record<string, unknown>; for (const f of resourceConfig.expose) if (f in d) r[f] = d[f]; if (!resourceConfig.expose.includes('_id') && '_id' in d) r['_id'] = d['_id']; return r })()
        : updated
      sendSuccess(reply, exposed, {}, resourceConfig.response)
    } catch (err) {
      const status  = isDisconnectedError(err) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendError(reply, status, message)
    }
  }
}
