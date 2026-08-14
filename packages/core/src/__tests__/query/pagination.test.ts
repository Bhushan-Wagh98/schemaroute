import { describe, it, expect } from 'vitest'
import { resolvePagination, buildResponseMeta } from '../../query/pagination'

describe('resolvePagination', () => {
  describe('page mode', () => {
    it('returns page pagination with defaults', () => {
      const result = resolvePagination({}, 'page')
      expect(result).toMatchObject({ type: 'page', page: 1, limit: 10, skip: 0 })
    })

    it('calculates skip correctly', () => {
      const result = resolvePagination({ page: '3', limit: '10' }, 'page')
      expect(result).toMatchObject({ type: 'page', page: 3, limit: 10, skip: 20 })
    })

    it('clamps limit to MAX_PAGE_LIMIT (100)', () => {
      const result = resolvePagination({ limit: '999' }, 'page')
      expect(result!.limit).toBe(100)
    })

    it('defaults page to 1 when page param is invalid', () => {
      const result = resolvePagination({ page: 'abc' }, 'page')
      expect(result).toMatchObject({ type: 'page', page: 1 })
    })

    it('clamps page to minimum of 1', () => {
      const result = resolvePagination({ page: '-5' }, 'page')
      expect(result!.page).toBe(1)
    })
  })

  describe('cursor mode', () => {
    it('returns cursor pagination with null cursor for first page', () => {
      const result = resolvePagination({}, 'cursor')
      expect(result).toMatchObject({ type: 'cursor', cursor: null, limit: 10 })
    })

    it('returns cursor pagination with provided cursor value', () => {
      const result = resolvePagination({ cursor: 'abc123' }, 'cursor')
      expect(result).toMatchObject({ type: 'cursor', cursor: 'abc123' })
    })
  })

  describe('both mode', () => {
    it('uses page pagination when no cursor is present', () => {
      const result = resolvePagination({ page: '2' }, 'both')
      expect(result!.type).toBe('page')
    })

    it('uses cursor pagination when cursor is present', () => {
      const result = resolvePagination({ cursor: 'abc123' }, 'both')
      expect(result!.type).toBe('cursor')
    })
  })

  describe('disabled', () => {
    it('returns null when pagination is false', () => {
      expect(resolvePagination({}, false)).toBeNull()
    })

    it('returns null when pagination is undefined', () => {
      expect(resolvePagination({}, undefined)).toBeNull()
    })
  })
})

describe('buildResponseMeta', () => {
  it('returns empty object when pagination is null', () => {
    expect(buildResponseMeta(null, 100)).toEqual({})
  })

  it('builds page meta correctly', () => {
    const meta = buildResponseMeta({ type: 'page', page: 2, limit: 10, skip: 10 }, 55)
    expect(meta).toEqual({ page: 2, limit: 10, total: 55, totalPages: 6 })
  })

  it('calculates totalPages correctly with remainder', () => {
    const meta = buildResponseMeta({ type: 'page', page: 1, limit: 10, skip: 0 }, 25)
    expect(meta.totalPages).toBe(3)
  })

  it('builds cursor meta correctly', () => {
    const meta = buildResponseMeta({ type: 'cursor', cursor: null, limit: 10 }, 100, 'nextCursorValue')
    expect(meta).toEqual({ limit: 10, total: 100, nextCursor: 'nextCursorValue' })
  })

  it('omits nextCursor when not provided', () => {
    const meta = buildResponseMeta({ type: 'cursor', cursor: null, limit: 10 }, 5)
    expect(meta).not.toHaveProperty('nextCursor')
  })

  it('returns totalPages of 1 when total equals limit exactly', () => {
    const meta = buildResponseMeta({ type: 'page', page: 1, limit: 10, skip: 0 }, 10)
    expect(meta.totalPages).toBe(1)
  })

  it('returns totalPages of 0 when total is 0', () => {
    const meta = buildResponseMeta({ type: 'page', page: 1, limit: 10, skip: 0 }, 0)
    expect(meta.totalPages).toBe(0)
  })

  it('builds cursor meta without nextCursor when undefined is passed explicitly', () => {
    const meta = buildResponseMeta({ type: 'cursor', cursor: 'abc', limit: 5 }, 20, undefined)
    expect(meta).not.toHaveProperty('nextCursor')
    expect(meta).toMatchObject({ limit: 5, total: 20 })
  })
})
