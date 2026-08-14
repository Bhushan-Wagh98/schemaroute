import { describe, it, expect } from 'vitest'
import { resolvePopulateFields } from '../../query/populate'

const VALID_REFS = new Set(['category', 'brand', 'supplier'])

describe('resolvePopulateFields', () => {
  it('returns config populate fields when no query param is given', () => {
    const fields = resolvePopulateFields({}, ['category'], VALID_REFS)
    expect(fields).toEqual(['category'])
  })

  it('returns query populate fields when no config fields are given', () => {
    const fields = resolvePopulateFields({ populate: 'brand' }, [], VALID_REFS)
    expect(fields).toEqual(['brand'])
  })

  it('merges config and query populate fields', () => {
    const fields = resolvePopulateFields({ populate: 'brand' }, ['category'], VALID_REFS)
    expect(fields).toContain('category')
    expect(fields).toContain('brand')
  })

  it('deduplicates when same field appears in config and query', () => {
    const fields = resolvePopulateFields({ populate: 'category' }, ['category'], VALID_REFS)
    expect(fields).toEqual(['category'])
    expect(fields).toHaveLength(1)
  })

  it('rejects fields not in the schema ref list', () => {
    const fields = resolvePopulateFields({ populate: 'nonexistent' }, [], VALID_REFS)
    expect(fields).toHaveLength(0)
  })

  it('handles comma-separated populate query param', () => {
    const fields = resolvePopulateFields({ populate: 'category,brand' }, [], VALID_REFS)
    expect(fields).toContain('category')
    expect(fields).toContain('brand')
  })

  it('returns empty array when nothing is configured and no query param', () => {
    const fields = resolvePopulateFields({}, [], VALID_REFS)
    expect(fields).toEqual([])
  })
})
