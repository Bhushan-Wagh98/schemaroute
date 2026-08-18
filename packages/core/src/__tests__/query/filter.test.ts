import { describe, it, expect } from 'vitest'
import { buildFieldFilter } from '../../query/filter'
import type { ParsedField } from '../../types'

const RESERVED_KEYS = new Set(['sort', 'order', 'fields', 'search', 'searchField', 'page', 'limit', 'cursor', 'populate'])
const SCHEMA_FIELDS = new Set(['name', 'price', 'status', 'category'])

const PARSED_FIELDS: ParsedField[] = [
  { name: 'name',     type: 'string',   required: false, isArray: false },
  { name: 'price',    type: 'number',   required: false, isArray: false },
  { name: 'status',   type: 'string',   required: false, isArray: false },
  { name: 'category', type: 'objectid', required: false, isArray: false },
]

describe('buildFieldFilter', () => {
  it('includes known schema fields as filters', () => {
    const { filter } = buildFieldFilter({ name: 'Laptop', price: '999' }, SCHEMA_FIELDS, RESERVED_KEYS, PARSED_FIELDS)
    expect(filter).toMatchObject({ name: 'Laptop' })
  })

  it('excludes reserved query keys even if they match a schema field name', () => {
    const schemaWithSort  = new Set([...SCHEMA_FIELDS, 'sort'])
    const parsedWithSort  = [...PARSED_FIELDS, { name: 'sort', type: 'string' as const, required: false, isArray: false }]
    const { filter } = buildFieldFilter({ sort: 'name', name: 'Laptop' }, schemaWithSort, RESERVED_KEYS, parsedWithSort)

    expect(filter).not.toHaveProperty('sort')
    expect(filter).toHaveProperty('name', 'Laptop')
  })

  it('excludes unknown fields not in the schema', () => {
    const { filter } = buildFieldFilter({ unknownField: 'value', name: 'Laptop' }, SCHEMA_FIELDS, RESERVED_KEYS, PARSED_FIELDS)

    expect(filter).not.toHaveProperty('unknownField')
    expect(filter).toHaveProperty('name', 'Laptop')
  })

  it('returns empty object when no schema fields are in query', () => {
    const { filter } = buildFieldFilter({ page: '1', limit: '10', sort: 'name' }, SCHEMA_FIELDS, RESERVED_KEYS, PARSED_FIELDS)
    expect(filter).toEqual({})
  })

  it('handles multiple valid filters at once', () => {
    const { filter } = buildFieldFilter(
      { name: 'Laptop', status: 'active', category: 'abc123', page: '1' },
      SCHEMA_FIELDS,
      RESERVED_KEYS,
      PARSED_FIELDS
    )
    expect(filter).toMatchObject({ name: 'Laptop', status: 'active', category: 'abc123' })
  })
})
