/**
 * @file handlers/patch.ts
 * @description Fastify handler for `PATCH /:resource/:id` — partial update via `$set`.
 * Only fields present in the request body are written — absent fields unchanged.
 * Validation is partial: required-field checks skipped for absent fields.
 *
 * Hook execution order:
 *   1. `beforeUpdate` — runs before validation
 *   2. Partial schema validation (when `validation: true`)
 *   3. Persist to MongoDB via `$set`
 *   4. `afterUpdate` — receives the saved document for side-effects
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Model } from 'mongoose'
import { isValidObjectId, validate } from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, PatchRouteConfig } from '@schemaroute/core'
import { sendSuccess, sendError, isDisconnectedError } from '../http/response'

export function makePatchHandler(
  resolveModel:   () => Model<unknown>,
  parsedSchema:   ParsedSchema,
  routeConfig:    PatchRouteConfig,
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
      if (resourceConfig.writable) {
        for (const key of Object.keys(data)) {
          if (!resourceConfig.writable.includes(key)) delete data[key]
        }
      }
      const ctx         = { headers: req.headers as any, query: req.query as any, params: req.params as any, user: (req as any).user, req: req as unknown as Record<string, unknown> }

      if (routeConfig.beforeUpdate) {
        const result = await routeConfig.beforeUpdate(data, ctx)
        if (result !== undefined) data = result
      }

      if (routeConfig.validation) {
        const partialSchema = {
          ...parsedSchema,
          fields: parsedSchema.fields
            .filter(f => data[f.name] !== undefined)
            .map(f => ({ ...f, required: false })),
        }
        const errors = validate(data, partialSchema)
        if (errors.length) return sendError(reply, 422, 'Validation failed', errors)

        // Verify ObjectId ref fields point to existing documents
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

      const updated = await model
        .findOneAndUpdate({ _id: id, ...scopeFilter }, { $set: data }, { new: true, runValidators: true })
        .lean().exec()
      if (!updated) return sendError(reply, 404, 'Resource not found')

      if (routeConfig.afterUpdate) await routeConfig.afterUpdate(updated as Record<string, unknown>, ctx)

      const transformFn = routeConfig.transform ?? resourceConfig.transform
      const transformed = transformFn ? transformFn(updated as Record<string, unknown>) : updated as Record<string, unknown>
      const exposed = resourceConfig.expose
        ? (() => { const r: Record<string, unknown> = {}; const d = transformed; for (const f of resourceConfig.expose) if (f in d) r[f] = d[f]; if (!resourceConfig.expose.includes('_id') && '_id' in d) r['_id'] = d['_id']; return r })()
        : transformed
      sendSuccess(reply, exposed, {}, resourceConfig.response)
    } catch (err) {
      const status  = isDisconnectedError(err) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendError(reply, status, message)
    }
  }
}
