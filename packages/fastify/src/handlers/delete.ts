/**
 * @file handlers/delete.ts
 * @description Fastify handler for `DELETE /:resource/:id`.
 * Supports both hard delete (default) and soft delete (`softDelete` config).
 *
 * Soft delete: sets `deletedAt` + `isDeleted` instead of removing the document.
 * A second DELETE on an already-soft-deleted document returns 404.
 * Restore via PATCH: set `{ isDeleted: false, deletedAt: null }`.
 *
 * Hook execution order:
 *   1. `beforeDelete` — receives the full document before deletion
 *   2. DB operation — hard delete or $set soft-delete fields
 *   3. `afterDelete` — receives the document for side-effects
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { Model } from 'mongoose'
import {
  isValidObjectId,
  resolveSoftDeleteFields,
  buildSoftDeleteFilter,
  buildSoftDeleteUpdate,
} from '@schemaroute/core'
import type { ParsedSchema, ResourceConfig, DeleteRouteConfig } from '@schemaroute/core'
import { sendSuccess, sendError, isDisconnectedError } from '../http/response'

export function makeDeleteHandler(
  resolveModel:   () => Model<unknown>,
  _parsedSchema:  ParsedSchema,
  routeConfig:    DeleteRouteConfig,
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
      // Include soft-delete filter so a second DELETE on an already-deleted doc returns 404
      const findFilter  = { _id: id, ...scopeFilter, ...softDeleteFilter }
      const ctx         = { headers: req.headers as any, query: req.query as any, params: req.params as any, user: (req as any).user, req: req as unknown as Record<string, unknown> }

      const doc = await model.findOne(findFilter).lean().exec() as Record<string, unknown> | null
      if (!doc) return sendError(reply, 404, 'Resource not found')

      const serialised = { ...doc, _id: String(doc['_id']) }
      if (routeConfig.beforeDelete) await routeConfig.beforeDelete(serialised, ctx)

      if (softDeleteFields) {
        await model.findByIdAndUpdate(id, { $set: buildSoftDeleteUpdate(softDeleteFields) })
      } else {
        await model.findByIdAndDelete(id)
      }

      if (routeConfig.afterDelete) await routeConfig.afterDelete(serialised, ctx)
      sendSuccess(reply, { id }, {}, resourceConfig.response)
    } catch (err) {
      const status  = isDisconnectedError(err) ? 503 : 500
      const message = status === 503 ? 'Service unavailable — database connection lost' : 'Internal server error'
      sendError(reply, status, message)
    }
  }
}
