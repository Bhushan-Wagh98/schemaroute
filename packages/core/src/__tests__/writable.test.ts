/**
 * @file __tests__/writable.test.ts
 * @description Unit tests for the writable field whitelist feature.
 *
 * `writable` is a resource-level option that restricts which fields are accepted
 * in POST/PUT/PATCH request bodies. It is applied as the first gate — before
 * scope, hooks, and DB writes — so server-controlled fields (e.g. `role`,
 * `createdBy`, `isDeleted`) can never be set by clients regardless of what
 * they send in the body.
 *
 * These tests cover the pure filter logic independently of any HTTP handler.
 */

import { describe, it, expect } from 'vitest'

// ─── Helper — mirrors applyWritableFilter in packages/express/src/db/document.ts ──

function applyWritableFilter(
  body:     Record<string, unknown>,
  writable: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of writable) {
    if (field in body) result[field] = body[field]
  }
  return result
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('writable field whitelist', () => {

  describe('field filtering', () => {
    it('returns only the listed fields', () => {
      const body   = { name: 'Alice', email: 'a@b.com', role: 'admin', isDeleted: true }
      const result = applyWritableFilter(body, ['name', 'email'])

      expect(result).toHaveProperty('name', 'Alice')
      expect(result).toHaveProperty('email', 'a@b.com')
      expect(result).not.toHaveProperty('role')
      expect(result).not.toHaveProperty('isDeleted')
    })

    it('returns empty object when no body fields match the whitelist', () => {
      const body   = { role: 'admin', isDeleted: true }
      const result = applyWritableFilter(body, ['name', 'email'])

      expect(result).toEqual({})
    })

    it('returns empty object when writable list is empty', () => {
      const body   = { name: 'Alice', role: 'admin' }
      const result = applyWritableFilter(body, [])

      expect(result).toEqual({})
    })

    it('silently ignores whitelist fields not present in the body', () => {
      const body   = { name: 'Alice' }
      const result = applyWritableFilter(body, ['name', 'email', 'tenantId'])

      expect(result).toEqual({ name: 'Alice' })
    })
  })

  describe('server-controlled field protection', () => {
    it('strips role from body — cannot be escalated by client', () => {
      const body   = { name: 'Alice', email: 'a@b.com', tenantId: 't1', role: 'admin' }
      const result = applyWritableFilter(body, ['name', 'email', 'tenantId'])

      expect(result).not.toHaveProperty('role')
    })

    it('strips isDeleted from body — cannot soft-delete via write routes', () => {
      const body   = { name: 'Supplier', email: 'x@x.com', isDeleted: true, deletedAt: new Date() }
      const result = applyWritableFilter(body, ['name', 'email', 'address', 'active'])

      expect(result).not.toHaveProperty('isDeleted')
      expect(result).not.toHaveProperty('deletedAt')
    })

    it('strips __v from body', () => {
      const body   = { name: 'Alice', __v: 5 }
      const result = applyWritableFilter(body, ['name'])

      expect(result).not.toHaveProperty('__v')
    })

    it('strips _id from body — prevents client from controlling document id', () => {
      const body   = { _id: 'fake-id', name: 'Alice' }
      const result = applyWritableFilter(body, ['name'])

      expect(result).not.toHaveProperty('_id')
      expect(result).toHaveProperty('name')
    })
  })

  describe('value preservation', () => {
    it('preserves falsy values (false, 0, empty string)', () => {
      const body   = { active: false, count: 0, label: '' }
      const result = applyWritableFilter(body, ['active', 'count', 'label'])

      expect(result['active']).toBe(false)
      expect(result['count']).toBe(0)
      expect(result['label']).toBe('')
    })

    it('preserves null values', () => {
      const body   = { name: 'Alice', deletedAt: null }
      const result = applyWritableFilter(body, ['name', 'deletedAt'])

      expect(result).toHaveProperty('deletedAt', null)
    })

    it('preserves nested objects as-is', () => {
      const address = { street: '1 Main St', city: 'London' }
      const body    = { name: 'Supplier', address, role: 'admin' }
      const result  = applyWritableFilter(body, ['name', 'address'])

      expect(result['address']).toEqual(address)
      expect(result).not.toHaveProperty('role')
    })

    it('preserves arrays as-is', () => {
      const body   = { tags: ['a', 'b'], role: 'admin' }
      const result = applyWritableFilter(body, ['tags'])

      expect(result['tags']).toEqual(['a', 'b'])
    })
  })

  describe('symmetry with expose', () => {
    it('writable and expose can have different fields — they are independent', () => {
      // expose controls reads, writable controls writes — no coupling
      const body    = { name: 'Alice', createdBy: 'server', role: 'admin' }
      // writable: only name is client-writable
      const written = applyWritableFilter(body, ['name'])
      // expose: name + createdBy are readable (createdBy set by hook, not client)
      expect(written).toEqual({ name: 'Alice' })
      expect(written).not.toHaveProperty('createdBy')
      expect(written).not.toHaveProperty('role')
    })
  })
})
