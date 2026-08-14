import { describe, it, expect } from 'vitest'
import { buildFieldFilter } from '../../query/filter'

const RESERVED_KEYS    = new Set(['sort', 'order', 'fields', 'search', 'searchField', 'page', 'limit', 'cursor', 'populate'])
const SCHEMA_FIELDS    = new Set(['name', 'price', 'status', 'category'])

describe('buildFieldFilter', () => {
  it('includes known schema fields as filters', () => {
    const filter = buildFieldFilter({ name: 'Laptop', price: '999' }, SCHEMA_FIELDS, RESERVED_KEYS)

    expect(filter).toEqual({ name: 'Laptop', price: '999' })
  })

  it('excludes reserved query keys even if they match a schema field name', () => {
    // hypothetical schema with a field named 'sort'
    const schemaWithSort = new Set([...SCHEMA_FIELDS, 'sort'])
    const filter = buildFieldFilter({ sort: 'name', name: 'Laptop' }, schemaWithSort, RESERVED_KEYS)

    expect(filter).not.toHaveProperty('sort')
    expect(filter).toHaveProperty('name', 'Laptop')
  })

  it('excludes unknown fields not in the schema', () => {
    const filter = buildFieldFilter({ unknownField: 'value', name: 'Laptop' }, SCHEMA_FIELDS, RESERVED_KEYS)

    expect(filter).not.toHaveProperty('unknownField')
    expect(filter).toHaveProperty('name', 'Laptop')
  })

  it('returns empty object when no schema fields are in query', () => {
    const filter = buildFieldFilter({ page: '1', limit: '10', sort: 'name' }, SCHEMA_FIELDS, RESERVED_KEYS)

    expect(filter).toEqual({})
  })

  it('handles multiple valid filters at once', () => {
    const filter = buildFieldFilter(
      { name: 'Laptop', status: 'active', category: 'abc123', page: '1' },
      SCHEMA_FIELDS,
      RESERVED_KEYS
    )

    expect(filter).toEqual({ name: 'Laptop', status: 'active', category: 'abc123' })
  })
})
