import { describe, it, expect } from 'vitest'
import { applySearchFilter } from '../../query/search'

const STRING_FIELDS  = ['name', 'description', 'status']
const SCHEMA_FIELDS  = new Set(['name', 'description', 'status', 'price'])

describe('applySearchFilter', () => {
  it('does nothing when search param is absent', () => {
    const filter = {}
    applySearchFilter(filter, {}, 'all-fields', STRING_FIELDS, SCHEMA_FIELDS)
    expect(filter).toEqual({})
  })

  it('does nothing when searchMode is false', () => {
    const filter = {}
    applySearchFilter(filter, { search: 'laptop' }, false, STRING_FIELDS, SCHEMA_FIELDS)
    expect(filter).toEqual({})
  })

  describe('all-fields mode', () => {
    it('adds $or across all string fields', () => {
      const filter: Record<string, unknown> = {}
      applySearchFilter(filter, { search: 'laptop' }, 'all-fields', STRING_FIELDS, SCHEMA_FIELDS)

      expect(filter['$or']).toEqual([
        { name:        { $regex: 'laptop', $options: 'i' } },
        { description: { $regex: 'laptop', $options: 'i' } },
        { status:      { $regex: 'laptop', $options: 'i' } },
      ])
    })

    it('does not add $or when there are no string fields', () => {
      const filter: Record<string, unknown> = {}
      applySearchFilter(filter, { search: 'laptop' }, 'all-fields', [], SCHEMA_FIELDS)
      expect(filter).not.toHaveProperty('$or')
    })
  })

  describe('single-field mode', () => {
    it('searches the field from ?searchField query param', () => {
      const filter: Record<string, unknown> = {}
      applySearchFilter(filter, { search: 'laptop', searchField: 'name' }, 'single-field', STRING_FIELDS, SCHEMA_FIELDS)

      expect(filter['name']).toEqual({ $regex: 'laptop', $options: 'i' })
    })

    it('falls back to configSearchField when ?searchField is absent', () => {
      const filter: Record<string, unknown> = {}
      applySearchFilter(filter, { search: 'laptop' }, 'single-field', STRING_FIELDS, SCHEMA_FIELDS, 'description')

      expect(filter['description']).toEqual({ $regex: 'laptop', $options: 'i' })
    })

    it('does nothing when target field is not in schema', () => {
      const filter: Record<string, unknown> = {}
      applySearchFilter(filter, { search: 'laptop', searchField: 'nonexistent' }, 'single-field', STRING_FIELDS, SCHEMA_FIELDS)

      expect(filter).toEqual({})
    })

    it('does nothing when no searchField is provided and no config fallback', () => {
      const filter: Record<string, unknown> = {}
      applySearchFilter(filter, { search: 'laptop' }, 'single-field', STRING_FIELDS, SCHEMA_FIELDS)

      expect(filter).toEqual({})
    })
  })
})
