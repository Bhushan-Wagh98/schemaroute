/**
 * @file handlers/create.ts
 * @description Fastify handler for `POST /:resource`.
 *
 * Hook execution order:
 *   1. Scope fields merged into body (auto-tags with tenant/user context)
 *   2. `beforeCreate` — runs before validation so computed fields are present
 *   3. Schema validation (when `validation: true`)
 *   4. Persist to MongoDB
 *   5. `afterCreate` — receives the saved document for side-effects
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Model } from 'mongoose'
import { validate } from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, CreateRouteConfig } from '@schemaroute/core'
import { sendSuccess, sendError, isDisconnectedError } from '../http/response'

export function makeCreateHandler(
  resolveModel:   () => Model<unknown>,
  parsedSchema:   ParsedSchema,
  routeConfig:    CreateRouteConfig,
  resourceConfig: ResourceConfig
) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const model = resolveModel()
      let   data  = { ...(req.body as Record<string, unknown>) }
      const ctx   = { headers: req.headers as any, query: req.query as any, params: req.params as any, user: (req as any).user, req: req as unknown as Record<string, unknown> }

      // Merge scope fields so every created document is auto-tagged with tenant/user context
      if (resourceConfig.scope) {
        Object.assign(data, resourceConfig.scope(req as unknown as Record<string, unknown>))
      }

      // beforeCreate runs before validation so hooks can inject computed fields
      // (e.g. slug from name) before required-field checks run
      if (routeConfig.beforeCreate) {
        const result = await routeConfig.beforeCreate(data, ctx)
        if (result !== undefined) data = result
      }

      if (routeConfig.validation) {
        const errors = validate(data, parsedSchema)
        if (errors.length) return sendError(reply, 422, 'Validation failed', errors)
      }

      const created = await model.create(data)
      const plain   = (created as any).toObject() as Record<string, unknown>
      // Normalise _id to a plain string so hooks always receive a serialisable object
      if (plain['_id']) plain['_id'] = String(plain['_id'])

      if (routeConfig.afterCreate) await routeConfig.afterCreate(plain, ctx)

      const exposed = resourceConfig.expose
        ? (() => { const r: Record<string, unknown> = {}; for (const f of resourceConfig.expose) if (f in plain) r[f] = plain[f]; if (!resourceConfig.expose.includes('_id') && '_id' in plain) r['_id'] = plain['_id']; return r })()
        : plain
      sendSuccess(reply, exposed, {}, resourceConfig.response, 201)
    } catch (err) {
      const status  = isDisconnectedError(err) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendError(reply, status, message)
    }
  }
}
