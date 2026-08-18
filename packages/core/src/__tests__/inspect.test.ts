/**
 * @file __tests__/inspect.test.ts
 * @description Unit tests for the `inspectAPI` utility.
 *
 * `inspectAPI` prints a human-readable route table for a SchemaRouteInstance
 * to stdout. It reads entirely from existing instance data — no new internals.
 * Tests verify the output contains the expected route lines, query capabilities,
 * and expose/writable summaries.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import mongoose from 'mongoose'
import { createSchemaRoute } from '../index'
import { inspectAPI } from '../utils/inspect'

const { Schema } = mongoose

const ProductSchema = new Schema({
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  status:   { type: String, enum: ['active', 'inactive'] },
  category: { type: Schema.Types.ObjectId, ref: 'Category' },
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('inspectAPI', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prints output to stdout', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {})
    inspectAPI(instance)
    expect(spy).toHaveBeenCalledOnce()
  })

  it('includes the resource name in the header', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {})
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('[schemaroute] products')
  })

  it('lists all 6 CRUD routes', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {})
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('GET')
    expect(output).toContain('POST')
    expect(output).toContain('PUT')
    expect(output).toContain('PATCH')
    expect(output).toContain('DELETE')
    expect(output).toContain('/products')
  })

  it('shows "public" for public routes', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {
      routes: { getAll: { public: true } },
    })
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('public')
  })

  it('shows middleware function names', () => {
    const spy          = vi.spyOn(console, 'log').mockImplementation(() => {})
    function requireAuth() {}
    const instance = createSchemaRoute(ProductSchema, 'products', {
      routes: { create: { middleware: [requireAuth] } },
    })
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('requireAuth')
  })

  it('shows "no middleware" for routes with no middleware and not public', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {})
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('no middleware')
  })

  it('shows "custom" for custom routes', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {
      custom: [{ method: 'GET', path: '/products/active', handler: () => {} }],
    })
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('custom')
  })

  it('shows sort ✓ when sort is enabled on getAll', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {
      routes: { getAll: { sort: true } },
    })
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('sort ✓')
  })

  it('shows pagination mode when set', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {
      pagination: 'page',
    })
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('pagination: page')
  })

  it('shows search mode when set', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {
      search: 'all-fields',
    })
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('search: all-fields')
  })

  it('shows populate with select when configured', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {
      populate: [{ path: 'category', select: 'name slug' }],
    })
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('Populate:')
    expect(output).toContain('category (select: name slug)')
  })

  it('shows Exposed fields when expose is set', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {
      expose: ['name', 'price'],
    })
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('Exposed:  name, price')
  })

  it('shows Writable fields when writable is set', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {
      writable: ['name', 'price', 'status'],
    })
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('Writable: name, price, status')
  })

  it('does not show Exposed or Writable lines when neither is set', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', {})
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).not.toContain('Exposed:')
    expect(output).not.toContain('Writable:')
  })

  it('applies prefix to route paths in output', () => {
    const spy      = vi.spyOn(console, 'log').mockImplementation(() => {})
    const instance = createSchemaRoute(ProductSchema, 'products', { prefix: '/v1' })
    inspectAPI(instance)
    const output = spy.mock.calls[0]![0] as string
    expect(output).toContain('/v1/products')
  })
})
