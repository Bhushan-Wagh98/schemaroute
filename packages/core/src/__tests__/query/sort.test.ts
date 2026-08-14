import { describe, it, expect } from 'vitest'
import { buildSortObject } from '../../query/sort'

const SCHEMA_FIELDS = new Set(['name', 'price', 'createdAt', 'status'])

describe('buildSortObject', () => {
  it('defaults to { createdAt: -1 } when no sort param is given', () => {
    const sort = buildSortObject({}, SCHEMA_FIELDS)
    expect(sort).toEqual({ createdAt: -1 })
  })

  it('sorts ascending by default when order is not specified', () => {
    const sort = buildSortObject({ sort: 'name' }, SCHEMA_FIELDS, true)
    expect(sort).toEqual({ name: 1 })
  })

  it('sorts descending when order=desc', () => {
    const sort = buildSortObject({ sort: 'price', order: 'desc' }, SCHEMA_FIELDS, true)
    expect(sort).toEqual({ price: -1 })
  })

  it('sorts ascending when order=asc', () => {
    const sort = buildSortObject({ sort: 'price', order: 'asc' }, SCHEMA_FIELDS, true)
    expect(sort).toEqual({ price: 1 })
  })

  it('falls back to default when sort field is not in schema', () => {
    const sort = buildSortObject({ sort: 'unknownField' }, SCHEMA_FIELDS, true)
    expect(sort).toEqual({ createdAt: -1 })
  })

  it('falls back to default when sort is disabled', () => {
    const sort = buildSortObject({ sort: 'price' }, SCHEMA_FIELDS, false)
    expect(sort).toEqual({ createdAt: -1 })
  })

  it('falls back to default when sort is undefined (not explicitly enabled)', () => {
    // isSortEnabled = undefined means not explicitly disabled — sort should still work
    const sort = buildSortObject({ sort: 'name' }, SCHEMA_FIELDS, undefined)
    expect(sort).toEqual({ name: 1 })
  })
})
