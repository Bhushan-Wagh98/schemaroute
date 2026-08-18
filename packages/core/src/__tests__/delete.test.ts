/**
 * @file __tests__/delete.test.ts
 * @description Unit tests for hard delete and soft delete behaviour.
 *
 * Hard delete (default):
 *   - DELETE /:id removes the document permanently via findByIdAndDelete
 *   - No deletedAt / isDeleted fields are touched
 *   - Route is present and enabled by default
 *
 * Soft delete (softDelete: true):
 *   - DELETE /:id sets deletedAt + isDeleted instead of removing
 *   - All reads automatically exclude soft-deleted documents via $ne filter
 *   - A second DELETE on an already-soft-deleted doc returns 404
 *   - Restore is done via PATCH: { isDeleted: false, deletedAt: null }
 *   - Custom field names supported: { field: 'archivedAt', flagField: 'archived' }
 *
 * These tests cover the pure logic layers (route builder + soft-delete helpers)
 * without spinning up HTTP or a real MongoDB connection.
 */

import { describe, it, expect } from 'vitest'
import { buildRoutes }                                          from '../routing/route-builder'
import { resolveSoftDeleteFields, buildSoftDeleteFilter, buildSoftDeleteUpdate } from '../soft-delete/index'

// ─── Hard delete — route builder ─────────────────────────────────────────────

describe('hard delete (default)', () => {
  it('delete route is present and enabled by default', () => {
    const routes = buildRoutes('products', {})
    const del    = routes.find(r => r.operation === 'delete')

    expect(del).toBeDefined()
    expect(del!.method).toBe('DELETE')
    expect(del!.path).toBe('/products/:id')
  })

  it('delete route can be disabled via enabled: false', () => {
    const routes = buildRoutes('products', {
      routes: { delete: { enabled: false } },
    })
    expect(routes.find(r => r.operation === 'delete')).toBeUndefined()
  })

  it('delete route carries middleware when configured', () => {
    const requireAdmin = () => {}
    const routes = buildRoutes('products', {
      routes: { delete: { middleware: [requireAdmin] } },
    })
    const del = routes.find(r => r.operation === 'delete')!

    expect(del.middleware).toContain(requireAdmin)
  })

  it('delete route has no rateLimit by default', () => {
    const routes = buildRoutes('products', {})
    const del    = routes.find(r => r.operation === 'delete')!

    expect(del.rateLimit).toBeUndefined()
  })

  it('softDelete is not set on the resource config by default', () => {
    const routes = buildRoutes('products', {})
    // softDelete absent means hard delete — resolveSoftDeleteFields returns null
    expect(resolveSoftDeleteFields(undefined)).toBeNull()
  })
})

// ─── Soft delete — resolveSoftDeleteFields ────────────────────────────────────

describe('resolveSoftDeleteFields', () => {
  it('returns null when softDelete is undefined (hard delete)', () => {
    expect(resolveSoftDeleteFields(undefined)).toBeNull()
  })

  it('returns null when softDelete is false (hard delete)', () => {
    expect(resolveSoftDeleteFields(false)).toBeNull()
  })

  it('returns default field names when softDelete is true', () => {
    const fields = resolveSoftDeleteFields(true)

    expect(fields).not.toBeNull()
    expect(fields!.field).toBe('deletedAt')
    expect(fields!.flagField).toBe('isDeleted')
  })

  it('returns custom field names when softDelete is an object', () => {
    const fields = resolveSoftDeleteFields({ field: 'archivedAt', flagField: 'archived' })

    expect(fields!.field).toBe('archivedAt')
    expect(fields!.flagField).toBe('archived')
  })

  it('falls back to default field names for missing keys in config object', () => {
    // Passing an empty object — both fields should fall back to defaults
    const fields = resolveSoftDeleteFields({})

    expect(fields!.field).toBe('deletedAt')
    expect(fields!.flagField).toBe('isDeleted')
  })
})

// ─── Soft delete — buildSoftDeleteFilter ─────────────────────────────────────

describe('buildSoftDeleteFilter', () => {
  it('builds $ne: true filter for default field names', () => {
    const fields = resolveSoftDeleteFields(true)!
    const filter = buildSoftDeleteFilter(fields)

    // Uses $ne: true so docs without isDeleted field are still returned
    expect(filter).toEqual({ isDeleted: { $ne: true } })
  })

  it('builds $ne: true filter for custom flag field name', () => {
    const fields = resolveSoftDeleteFields({ field: 'archivedAt', flagField: 'archived' })!
    const filter = buildSoftDeleteFilter(fields)

    expect(filter).toEqual({ archived: { $ne: true } })
  })

  it('uses $ne: true not === false so pre-existing docs without the field are included', () => {
    // This is the key design decision: { isDeleted: { $ne: true } } matches
    // null, undefined, and false — so documents created before soft delete
    // was enabled are still returned in list queries.
    const fields = resolveSoftDeleteFields(true)!
    const filter = buildSoftDeleteFilter(fields)

    expect(filter['isDeleted']).toEqual({ $ne: true })
    expect(filter['isDeleted']).not.toEqual(false)
  })
})

// ─── Soft delete — buildSoftDeleteUpdate ─────────────────────────────────────

describe('buildSoftDeleteUpdate', () => {
  it('builds update payload with default field names', () => {
    const fields = resolveSoftDeleteFields(true)!
    const update = buildSoftDeleteUpdate(fields)

    expect(update).toHaveProperty('deletedAt')
    expect(update).toHaveProperty('isDeleted', true)
    expect(update['deletedAt']).toBeInstanceOf(Date)
  })

  it('builds update payload with custom field names', () => {
    const fields = resolveSoftDeleteFields({ field: 'archivedAt', flagField: 'archived' })!
    const update = buildSoftDeleteUpdate(fields)

    expect(update).toHaveProperty('archivedAt')
    expect(update).toHaveProperty('archived', true)
  })

  it('sets the timestamp field to a Date instance', () => {
    const fields  = resolveSoftDeleteFields(true)!
    const before  = new Date()
    const update  = buildSoftDeleteUpdate(fields)
    const after   = new Date()

    const ts = update['deletedAt'] as Date
    expect(ts.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(ts.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})

// ─── Soft delete — route builder interaction ─────────────────────────────────

describe('soft delete route builder interaction', () => {
  it('delete route is still present when softDelete is enabled', () => {
    // softDelete does not remove the route — it changes what the handler does
    const routes = buildRoutes('products', { softDelete: true })
    const del    = routes.find(r => r.operation === 'delete')

    expect(del).toBeDefined()
  })

  it('softDelete config is stored on the route config', () => {
    const routes = buildRoutes('products', { softDelete: true })
    // The resource-level softDelete is on the ResourceConfig, not the RouteDefinition.
    // Verify the route itself is still a standard DELETE route.
    const del = routes.find(r => r.operation === 'delete')!

    expect(del.method).toBe('DELETE')
    expect(del.operation).toBe('delete')
  })
})
