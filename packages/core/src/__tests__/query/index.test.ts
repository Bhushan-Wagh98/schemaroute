import { describe, it, expect } from 'vitest'
import { resolveQuery, buildMeta } from '../../query/index'
import type { ParsedSchema } from '../../types'

// ─── Shared test schema ───────────────────────────────────────────────────────

const parsedSchema: ParsedSchema = {
  fields: [
    { name: 'name',     type: 'string',   required: true,  isArray: false },
    { name: 'price',    type: 'number',   required: true,  isArray: false },
    { name: 'status',   type: 'string',   required: false, isArray: false },
    { name: 'category', type: 'objectid', required: false, isArray: false, ref: 'Category' },
  ],
  stringFields: ['name', 'status'],
  refFields:    ['category'],
}

// ─── resolveQuery ─────────────────────────────────────────────────────────────

describe('resolveQuery', () => {
  it('returns a ResolvedQuery with all expected keys', () => {
    const result = resolveQuery({}, parsedSchema, {})

    expect(result).toHaveProperty('filter')
    expect(result).toHaveProperty('sort')
    expect(result).toHaveProperty('projection')
    expect(result).toHaveProperty('populate')
    expect(result).toHaveProperty('pagination')
  })

  it('builds filter from schema field query params', () => {
    const result = resolveQuery({ name: 'Laptop', page: '1' }, parsedSchema, {})
    expect(result.filter).toEqual({ name: 'Laptop' })
  })

  it('applies search when search option is set', () => {
    const result = resolveQuery({ search: 'laptop' }, parsedSchema, { search: 'all-fields' })
    expect(result.filter).toHaveProperty('$or')
  })

  it('does not apply search when search option is not set', () => {
    const result = resolveQuery({ search: 'laptop' }, parsedSchema, {})
    expect(result.filter).not.toHaveProperty('$or')
  })

  it('builds sort from query params', () => {
    const result = resolveQuery({ sort: 'price', order: 'desc' }, parsedSchema, { sort: true })
    expect(result.sort).toEqual({ price: -1 })
  })

  it('returns empty sort when no sort param and sort not enabled', () => {
    const result = resolveQuery({}, parsedSchema, {})
    expect(result.sort).toEqual({})
  })

  it('builds projection from ?fields= param', () => {
    const result = resolveQuery({ fields: 'name,price' }, parsedSchema, { fields: true })
    expect(result.projection).toEqual({ name: 1, price: 1 })
  })

  it('resolves populate from config', () => {
    const result = resolveQuery({}, parsedSchema, { populate: ['category'] })
    expect(result.populate).toContain('category')
  })

  it('resolves pagination when mode is set', () => {
    const result = resolveQuery({ page: '2', limit: '5' }, parsedSchema, { pagination: 'page' })
    expect(result.pagination).toMatchObject({ type: 'page', page: 2, limit: 5 })
  })

  it('returns null pagination when mode is not set', () => {
    const result = resolveQuery({}, parsedSchema, {})
    expect(result.pagination).toBeNull()
  })

  it('excludes __v by default', () => {
    const result = resolveQuery({}, parsedSchema, {})
    // exclusion projection should include __v: 0
    expect(result.projection).toEqual({ __v: 0 })
  })

  it('merges custom exclude fields with __v', () => {
    const result = resolveQuery({}, parsedSchema, { exclude: ['status'] })
    expect(result.projection).toEqual({ __v: 0, status: 0 })
  })
})

// ─── buildMeta ────────────────────────────────────────────────────────────────

describe('buildMeta', () => {
  it('returns empty object when pagination is null', () => {
    expect(buildMeta(null, 100)).toEqual({})
  })

  it('builds page meta', () => {
    const meta = buildMeta({ type: 'page', page: 1, limit: 10, skip: 0 }, 42)
    expect(meta).toEqual({ page: 1, limit: 10, total: 42, totalPages: 5 })
  })

  it('builds cursor meta with nextCursor', () => {
    const meta = buildMeta({ type: 'cursor', cursor: null, limit: 10 }, 50, 'cursor123')
    expect(meta).toMatchObject({ limit: 10, total: 50, nextCursor: 'cursor123' })
  })
})
