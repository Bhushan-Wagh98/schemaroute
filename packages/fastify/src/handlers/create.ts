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
      if (resourceConfig.writable) {
        for (const key of Object.keys(data)) {
          if (!resourceConfig.writable.includes(key)) delete data[key]
        }
      }
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

        // Verify that all ObjectId ref fields point to existing documents
        for (const field of parsedSchema.fields) {
          if (field.type === 'objectid' && field.ref && data[field.name]) {
            const refModel = model.db.models[field.ref]
            if (refModel) {
              const exists = await refModel.exists({ _id: data[field.name] })
              if (!exists) {
                return sendError(reply, 422, 'Validation failed', [
                  { field: field.name, message: `${field.name} references a non-existent ${field.ref}` },
                ])
              }
            }
          }
        }
      }

      const created = await model.create(data)
      const plain   = (created as any).toObject() as Record<string, unknown>
      // Normalise _id to a plain string so hooks always receive a serialisable object
      if (plain['_id']) plain['_id'] = String(plain['_id'])

      if (routeConfig.afterCreate) await routeConfig.afterCreate(plain, ctx)

      const transformFn = routeConfig.transform ?? resourceConfig.transform
      const transformed = transformFn ? transformFn(plain) : plain
      const exposed = resourceConfig.expose
        ? (() => { const r: Record<string, unknown> = {}; for (const f of resourceConfig.expose) if (f in transformed) r[f] = transformed[f]; if (!resourceConfig.expose.includes('_id') && '_id' in transformed) r['_id'] = transformed['_id']; return r })()
        : transformed
      sendSuccess(reply, exposed, {}, resourceConfig.response, 201)
    } catch (err) {
      const status  = isDisconnectedError(err) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendError(reply, status, message)
    }
  }
}
