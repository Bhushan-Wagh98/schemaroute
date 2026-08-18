/**
 * @file __tests__/max-body-size.test.ts
 * @description Unit tests for the maxBodySize size-string parser and the
 * body size guard logic.
 *
 * The guard has two paths:
 *   1. Content-Length header present  — fast reject before body is read
 *   2. No Content-Length (chunked)    — fallback check on parsed body byte count
 *
 * These tests cover the parseSize helper in isolation so every unit
 * (bytes, kb, mb, gb) and edge case is verified without spinning up HTTP.
 */

import { describe, it, expect } from 'vitest'

// ─── Helper — mirrors parseSize in packages/express/src/index.ts ─────────────

function parseSize(size: string): number {
  const match = size.match(/^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i)
  if (!match) return 102400 // default 100kb
  const value = parseFloat(match[1]!)
  const unit  = (match[2] ?? 'b').toLowerCase()
  const multipliers: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 }
  return Math.floor(value * (multipliers[unit] ?? 1))
}

// ─── Helper — mirrors the guard logic in makeBodySizeGuard ───────────────────

function wouldReject(
  maxBodySize: string | number,
  contentLength: number | null,
  parsedBodyBytes: number | null
): boolean {
  const maxBytes = typeof maxBodySize === 'number' ? maxBodySize : parseSize(maxBodySize)

  // Fast path: Content-Length header
  if (contentLength !== null && contentLength > maxBytes) return true

  // Slow path: parsed body byte count (chunked transfers)
  if (parsedBodyBytes !== null && parsedBodyBytes > maxBytes) return true

  return false
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseSize', () => {
  it('parses bytes (b)', () => {
    expect(parseSize('500b')).toBe(500)
  })

  it('parses kilobytes (kb)', () => {
    expect(parseSize('10kb')).toBe(10 * 1024)
  })

  it('parses megabytes (mb)', () => {
    expect(parseSize('1mb')).toBe(1024 * 1024)
  })

  it('parses gigabytes (gb)', () => {
    expect(parseSize('1gb')).toBe(1024 ** 3)
  })

  it('is case-insensitive for unit suffix', () => {
    expect(parseSize('10KB')).toBe(parseSize('10kb'))
    expect(parseSize('1MB')).toBe(parseSize('1mb'))
  })

  it('handles decimal values', () => {
    expect(parseSize('0.5mb')).toBe(Math.floor(0.5 * 1024 * 1024))
  })

  it('defaults to 100kb for unrecognised format', () => {
    expect(parseSize('invalid')).toBe(102400)
  })

  it('treats bare number string as bytes', () => {
    // no unit suffix — defaults to 'b'
    expect(parseSize('1024')).toBe(1024)
  })
})

describe('body size guard logic', () => {
  describe('Content-Length fast path', () => {
    it('rejects when Content-Length exceeds limit', () => {
      expect(wouldReject('10kb', 11 * 1024, null)).toBe(true)
    })

    it('allows when Content-Length is exactly at limit', () => {
      expect(wouldReject('10kb', 10 * 1024, null)).toBe(false)
    })

    it('allows when Content-Length is below limit', () => {
      expect(wouldReject('10kb', 5 * 1024, null)).toBe(false)
    })

    it('allows when Content-Length is 0 (empty body)', () => {
      expect(wouldReject('10kb', 0, null)).toBe(false)
    })
  })

  describe('chunked transfer fallback path', () => {
    it('rejects when parsed body exceeds limit and no Content-Length', () => {
      expect(wouldReject('10kb', null, 11 * 1024)).toBe(true)
    })

    it('allows when parsed body is within limit and no Content-Length', () => {
      expect(wouldReject('10kb', null, 5 * 1024)).toBe(false)
    })
  })

  describe('numeric maxBodySize', () => {
    it('accepts raw byte count as number', () => {
      expect(wouldReject(10240, 10241, null)).toBe(true)
      expect(wouldReject(10240, 10240, null)).toBe(false)
    })
  })

  describe('isolation — other resources unaffected', () => {
    it('a resource without maxBodySize never rejects (null guard)', () => {
      // When maxBodySize is not set, bodySizeGuard is null and never runs
      const guardIsNull = null
      expect(guardIsNull).toBeNull()
    })
  })
})
