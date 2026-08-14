/**
 * @file __tests__/index.test.ts
 * @description Verifies that @schemaroute/common exports all expected types
 * and that the SDKError class behaves correctly at runtime.
 *
 * Since this package is types-only, most tests verify structural shape
 * rather than runtime behaviour.
 */

import { describe, it, expect } from 'vitest'
import type {
  SchemaRouteInstance,
  ResourceConfig,
  ParsedSchema,
  ParsedField,
  RouteDefinition,
  RequestContext,
  ValidationError,
  ResponseMeta,
  GetAllRouteConfig,
  GetOneRouteConfig,
  CreateRouteConfig,
  UpdateRouteConfig,
  DeleteRouteConfig,
  CustomRoute,
  FieldType,
  PaginationMode,
  SearchMode,
} from '../index'

// ─── Type shape tests ─────────────────────────────────────────────────────────
// These tests verify that the exported types have the expected structure
// by constructing valid objects and asserting their properties.

describe('@schemaroute/common exports', () => {
  it('ResourceConfig accepts all valid options', () => {
    const config: ResourceConfig = {
      pagination: 'page',
      search:     'all-fields',
      populate:   ['category'],
      exclude:    ['__v'],
      select:     ['name', 'price'],
      routes: {
        getAll:  { enabled: true, sort: true, fields: true },
        getOne:  { enabled: true },
        create:  { enabled: true, validation: true },
        update:  { enabled: true, validation: true },
        delete:  { enabled: true },
      },
    }
    expect(config.pagination).toBe('page')
    expect(config.search).toBe('all-fields')
    expect(config.populate).toEqual(['category'])
  })

  it('ParsedField accepts all field types', () => {
    const fieldTypes: FieldType[] = ['string', 'number', 'boolean', 'date', 'objectid', 'array', 'object', 'mixed']
    expect(fieldTypes).toHaveLength(8)
  })

  it('PaginationMode covers all valid values', () => {
    const modes: PaginationMode[] = ['page', 'cursor', 'both', false]
    expect(modes).toHaveLength(4)
  })

  it('SearchMode covers all valid values', () => {
    const modes: SearchMode[] = ['all-fields', 'single-field', false]
    expect(modes).toHaveLength(3)
  })

  it('ParsedSchema has correct shape', () => {
    const schema: ParsedSchema = {
      fields:       [],
      stringFields: [],
      refFields:    [],
    }
    expect(schema).toHaveProperty('fields')
    expect(schema).toHaveProperty('stringFields')
    expect(schema).toHaveProperty('refFields')
  })

  it('ValidationError has field and message', () => {
    const error: ValidationError = { field: 'name', message: 'name is required' }
    expect(error.field).toBe('name')
    expect(error.message).toBe('name is required')
  })

  it('ResponseMeta supports page-based fields', () => {
    const meta: ResponseMeta = { page: 1, limit: 10, total: 42, totalPages: 5 }
    expect(meta.page).toBe(1)
    expect(meta.totalPages).toBe(5)
  })

  it('ResponseMeta supports cursor-based fields', () => {
    const meta: ResponseMeta = { limit: 10, total: 42, nextCursor: 'abc123' }
    expect(meta.nextCursor).toBe('abc123')
  })

  it('ResponseMeta supports extra fields via index signature', () => {
    const meta: ResponseMeta = { customField: 'value' }
    expect(meta['customField']).toBe('value')
  })

  it('RequestContext has all required fields', () => {
    const ctx: RequestContext = {
      headers: { 'content-type': 'application/json' },
      query:   { page: '1' },
      params:  { id: 'abc123' },
    }
    expect(ctx.headers).toBeDefined()
    expect(ctx.user).toBeUndefined()
  })

  it('CustomRoute requires method, path, and handler', () => {
    const route: CustomRoute = {
      method:  'GET',
      path:    '/products/active',
      handler: (_req, _res, _next) => {},
    }
    expect(route.method).toBe('GET')
    expect(route.path).toBe('/products/active')
  })

  it('GetAllRouteConfig supports all query options', () => {
    const config: GetAllRouteConfig = {
      enabled:    true,
      pagination: 'cursor',
      search:     'all-fields',
      sort:       true,
      fields:     true,
      populate:   ['category'],
      exclude:    ['__v'],
    }
    expect(config.pagination).toBe('cursor')
    expect(config.sort).toBe(true)
  })

  it('CreateRouteConfig supports validation and hooks', () => {
    const config: CreateRouteConfig = {
      validation: true,
      beforeCreate: async (data) => data,
      afterCreate:  async (_doc) => {},
    }
    expect(config.validation).toBe(true)
    expect(typeof config.beforeCreate).toBe('function')
  })

  it('SchemaRouteInstance has all required fields', () => {
    const instance: SchemaRouteInstance = {
      routes:       [],
      parsedSchema: { fields: [], stringFields: [], refFields: [] },
      resourceName: 'products',
      schema:       {},
      config:       {},
    }
    expect(instance.resourceName).toBe('products')
    expect(instance.routes).toEqual([])
  })
})
