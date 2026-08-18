/**
 * @file __tests__/expose.test.ts
 * @description Unit tests for the expose whitelist feature.
 *
 * expose is a resource-level option that restricts which fields are returned
 * in every API response. It is applied as the final gate after transform,
 * so sensitive fields (password, tokens, internal flags) can never leak
 * regardless of what populate or transform returns.
 *
 * These tests cover the pure logic of the whitelist filter independently
 * of any HTTP handler, using a plain object helper that mirrors what
 * applyExposeFilter does in the express adapter.
 */

import { describe, it, expect } from 'vitest'

// ─── Helper — mirrors applyExposeFilter in packages/express/src/db/document.ts ──

function applyExposeFilter(
  doc:    Record<string, unknown>,
  expose: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of expose) {
    if (field in doc) result[field] = doc[field]
  }
  // _id is always included unless explicitly listed (and therefore already added)
  if (!expose.includes('_id') && '_id' in doc) result['_id'] = doc['_id']
  return result
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('expose whitelist', () => {

  describe('field filtering', () => {
    it('returns only the listed fields', () => {
      const doc    = { _id: '1', name: 'Alice', password: 'secret', role: 'admin' }
      const result = applyExposeFilter(doc, ['name'])

      expect(result).toHaveProperty('name', 'Alice')
      expect(result).not.toHaveProperty('password')
      expect(result).not.toHaveProperty('role')
    })

    it('returns multiple listed fields', () => {
      const doc    = { _id: '1', name: 'Alice', price: 99, stock: 5, internalCode: 'X1' }
      const result = applyExposeFilter(doc, ['name', 'price', 'stock'])

      expect(result).toHaveProperty('name')
      expect(result).toHaveProperty('price')
      expect(result).toHaveProperty('stock')
      expect(result).not.toHaveProperty('internalCode')
    })

    it('silently skips fields listed in expose that do not exist on the doc', () => {
      const doc    = { _id: '1', name: 'Alice' }
      const result = applyExposeFilter(doc, ['name', 'nonexistent'])

      expect(result).toHaveProperty('name')
      expect(result).not.toHaveProperty('nonexistent')
    })
  })

  describe('_id behaviour', () => {
    it('always includes _id even when not listed in expose', () => {
      const doc    = { _id: 'abc123', name: 'Alice', password: 'secret' }
      const result = applyExposeFilter(doc, ['name'])

      expect(result).toHaveProperty('_id', 'abc123')
    })

    it('includes _id only once when it is explicitly listed in expose', () => {
      const doc    = { _id: 'abc123', name: 'Alice' }
      const result = applyExposeFilter(doc, ['_id', 'name'])

      expect(Object.keys(result).filter(k => k === '_id')).toHaveLength(1)
      expect(result['_id']).toBe('abc123')
    })

    it('returns only _id when expose list is empty and doc has _id', () => {
      const doc    = { _id: 'abc123', name: 'Alice', password: 'secret' }
      const result = applyExposeFilter(doc, [])

      expect(result).toEqual({ _id: 'abc123' })
    })

    it('returns empty object when expose is empty and doc has no _id', () => {
      const doc    = { name: 'Alice', password: 'secret' }
      const result = applyExposeFilter(doc, [])

      expect(result).toEqual({})
    })
  })

  describe('sensitive field protection', () => {
    it('strips password from response', () => {
      const doc    = { _id: '1', email: 'a@b.com', password: 'hashed', token: 'jwt' }
      const result = applyExposeFilter(doc, ['email'])

      expect(result).not.toHaveProperty('password')
      expect(result).not.toHaveProperty('token')
      expect(result).toHaveProperty('email')
    })

    it('strips __v from response', () => {
      const doc    = { _id: '1', name: 'Alice', __v: 0 }
      const result = applyExposeFilter(doc, ['name'])

      expect(result).not.toHaveProperty('__v')
    })

    it('strips soft-delete fields when not in expose', () => {
      const doc    = { _id: '1', name: 'Alice', isDeleted: false, deletedAt: null }
      const result = applyExposeFilter(doc, ['name'])

      expect(result).not.toHaveProperty('isDeleted')
      expect(result).not.toHaveProperty('deletedAt')
    })
  })

  describe('value preservation', () => {
    it('preserves falsy values (false, 0, empty string)', () => {
      const doc    = { _id: '1', active: false, count: 0, label: '' }
      const result = applyExposeFilter(doc, ['active', 'count', 'label'])

      expect(result['active']).toBe(false)
      expect(result['count']).toBe(0)
      expect(result['label']).toBe('')
    })

    it('preserves null values', () => {
      const doc    = { _id: '1', deletedAt: null }
      const result = applyExposeFilter(doc, ['deletedAt'])

      expect(result).toHaveProperty('deletedAt', null)
    })

    it('preserves nested objects as-is', () => {
      const nested = { name: 'Electronics', slug: 'electronics' }
      const doc    = { _id: '1', category: nested }
      const result = applyExposeFilter(doc, ['category'])

      expect(result['category']).toEqual(nested)
    })

    it('preserves arrays as-is', () => {
      const doc    = { _id: '1', tags: ['a', 'b', 'c'] }
      const result = applyExposeFilter(doc, ['tags'])

      expect(result['tags']).toEqual(['a', 'b', 'c'])
    })
  })
})
