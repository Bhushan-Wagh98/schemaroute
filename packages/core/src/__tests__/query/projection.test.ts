import { describe, it, expect } from 'vitest'
import { buildProjection } from '../../query/projection'

const SCHEMA_FIELDS   = new Set(['name', 'price', 'status', 'description', 'category'])
const EXCLUDED_FIELDS = new Set(['__v'])

describe('buildProjection', () => {
  it('returns null when no projection is needed', () => {
    const { projection } = buildProjection({}, SCHEMA_FIELDS, new Set(), undefined, true)
    expect(projection).toBeNull()
  })

  describe('?fields= inclusion projection', () => {
    it('builds inclusion projection from ?fields= param', () => {
      const { projection } = buildProjection({ fields: 'name,price' }, SCHEMA_FIELDS, EXCLUDED_FIELDS, undefined, true)
      expect(projection).toEqual({ name: 1, price: 1 })
    })

    it('returns error for unknown field in ?fields=', () => {
      const { projection, error } = buildProjection({ fields: 'name,nonexistent' }, SCHEMA_FIELDS, EXCLUDED_FIELDS, undefined, true)
      expect(projection).toBeNull()
      expect(error).toMatch(/nonexistent/)
    })

    it('ignores excluded fields in ?fields=', () => {
      const excluded      = new Set(['price'])
      const { projection } = buildProjection({ fields: 'name,price' }, SCHEMA_FIELDS, excluded, undefined, true)
      expect(projection).toEqual({ name: 1 })
    })

    it('returns null when all ?fields= values are invalid', () => {
      const { projection } = buildProjection({ fields: 'nonexistent' }, SCHEMA_FIELDS, EXCLUDED_FIELDS, undefined, true)
      expect(projection).toBeNull()
    })

    it('ignores ?fields= when fields param is disabled', () => {
      const { projection } = buildProjection({ fields: 'name,price' }, SCHEMA_FIELDS, EXCLUDED_FIELDS, undefined, false)
      // falls through to exclusion-only
      expect(projection).toEqual({ __v: 0 })
    })
  })

  describe('select config inclusion projection', () => {
    it('builds inclusion projection from select config', () => {
      const { projection } = buildProjection({}, SCHEMA_FIELDS, EXCLUDED_FIELDS, ['name', 'price'], true)
      expect(projection).toEqual({ name: 1, price: 1 })
    })

    it('skips excluded fields from select config', () => {
      const excluded      = new Set(['price'])
      const { projection } = buildProjection({}, SCHEMA_FIELDS, excluded, ['name', 'price'], true)
      expect(projection).toEqual({ name: 1 })
    })
  })

  describe('exclusion-only projection', () => {
    it('builds exclusion projection when no inclusions are configured', () => {
      const { projection } = buildProjection({}, SCHEMA_FIELDS, new Set(['__v', 'description']), undefined, true)
      expect(projection).toEqual({ __v: 0, description: 0 })
    })

    it('returns null when excluded set is empty', () => {
      const { projection } = buildProjection({}, SCHEMA_FIELDS, new Set(), undefined, true)
      expect(projection).toBeNull()
    })
  })

  describe('?fields= disabled', () => {
    it('falls through to exclusion when fields param is disabled and no select config', () => {
      const { projection } = buildProjection({ fields: 'name,price' }, SCHEMA_FIELDS, new Set(['__v']), undefined, false)
      expect(projection).toEqual({ __v: 0 })
    })

    it('falls through to select config when fields param is disabled', () => {
      const { projection } = buildProjection({ fields: 'name' }, SCHEMA_FIELDS, new Set(), ['price', 'status'], false)
      expect(projection).toEqual({ price: 1, status: 1 })
    })
  })
})
