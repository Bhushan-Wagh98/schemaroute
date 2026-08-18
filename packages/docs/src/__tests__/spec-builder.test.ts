import { describe, it, expect } from 'vitest'
import type { SchemaRouteInstance } from '@schemaroute/common'
import { generateOpenAPISpec } from '../spec-builder'

// ─── Minimal instance factory ─────────────────────────────────────────────────

function makeInstance(overrides: Partial<SchemaRouteInstance> = {}): SchemaRouteInstance {
  return {
    resourceName: 'products',
    schema:       {},
    routes:       [],
    parsedSchema: {
      fields: [
        { name: 'name',     type: 'string',   required: true,  isArray: false },
        { name: 'price',    type: 'number',   required: true,  isArray: false, min: 0 },
        { name: 'status',   type: 'string',   required: false, isArray: false, enum: ['active', 'inactive'] },
        { name: 'category', type: 'objectid', required: false, isArray: false, ref: 'Category' },
        { name: 'tags',     type: 'string',   required: false, isArray: true  },
      ],
      stringFields: ['name', 'status'],
      refFields:    ['category'],
    },
    config: {},
    ...overrides,
  }
}

// ─── generateOpenAPISpec ──────────────────────────────────────────────────────

describe('generateOpenAPISpec', () => {

  // ── spec metadata ───────────────────────────────────────────────────────────

  it('sets default metadata when no options are provided', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.openapi).toBe('3.0.0')
    expect(spec.info.title).toBe('SchemaRoute API')
    expect(spec.info.version).toBe('1.0.0')
    expect(spec.servers[0]!.url).toBe('http://localhost:3000')
  })

  it('uses provided metadata options', () => {
    const spec = generateOpenAPISpec([makeInstance()], {
      title:       'My API',
      version:     '2.0.0',
      description: 'Test',
      serverUrl:   'https://api.example.com',
    })
    expect(spec.info.title).toBe('My API')
    expect(spec.info.version).toBe('2.0.0')
    expect(spec.info.description).toBe('Test')
    expect(spec.servers[0]!.url).toBe('https://api.example.com')
  })

  it('omits description from info when not provided', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.info).not.toHaveProperty('description')
  })

  // ── schema components ───────────────────────────────────────────────────────

  it('creates a schema component for the resource', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.components.schemas).toHaveProperty('Product')
  })

  it('schema component includes _id, createdAt, updatedAt', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const props = spec.components.schemas['Product']!.properties!
    expect(props).toHaveProperty('_id')
    expect(props).toHaveProperty('createdAt')
    expect(props).toHaveProperty('updatedAt')
  })

  it('schema component includes all parsed fields', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const props = spec.components.schemas['Product']!.properties!
    expect(props).toHaveProperty('name')
    expect(props).toHaveProperty('price')
    expect(props).toHaveProperty('status')
    expect(props).toHaveProperty('category')
  })

  it('schema component lists required fields', () => {
    const spec     = generateOpenAPISpec([makeInstance()])
    const required = spec.components.schemas['Product']!.required ?? []
    expect(required).toContain('name')
    expect(required).toContain('price')
    expect(required).not.toContain('status')
  })

  it('schema component maps field types correctly', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const props = spec.components.schemas['Product']!.properties!
    expect(props['name']).toMatchObject({ type: 'string' })
    expect(props['price']).toMatchObject({ type: 'number' })
    expect(props['category']).toMatchObject({ type: 'string', description: 'MongoDB ObjectId' })
  })

  it('schema component applies enum constraint', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const props = spec.components.schemas['Product']!.properties!
    expect(props['status']!.enum).toEqual(['active', 'inactive'])
  })

  it('schema component applies min constraint', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const props = spec.components.schemas['Product']!.properties!
    expect(props['price']!.minimum).toBe(0)
  })

  it('schema component wraps array fields in array type', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const props = spec.components.schemas['Product']!.properties!
    expect(props['tags']).toMatchObject({ type: 'array', items: { type: 'string' } })
  })

  // ── expose whitelist ────────────────────────────────────────────────────────

  it('expose whitelist restricts schema component properties', () => {
    const spec  = generateOpenAPISpec([makeInstance({ config: { expose: ['name', 'price'] } })])
    const props = spec.components.schemas['Product']!.properties!
    expect(props).toHaveProperty('name')
    expect(props).toHaveProperty('price')
    expect(props).not.toHaveProperty('status')
    expect(props).not.toHaveProperty('category')
  })

  it('expose whitelist does not affect _id, createdAt, updatedAt', () => {
    const spec  = generateOpenAPISpec([makeInstance({ config: { expose: ['name'] } })])
    const props = spec.components.schemas['Product']!.properties!
    expect(props).toHaveProperty('_id')
    expect(props).toHaveProperty('createdAt')
    expect(props).toHaveProperty('updatedAt')
  })

  // ── writable whitelist ──────────────────────────────────────────────────────

  it('writable whitelist restricts create request body properties', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { writable: ['name', 'price'] } })])
    const body = spec.paths['/products']!.post!.requestBody!.content['application/json'].schema
    expect(body.properties).toHaveProperty('name')
    expect(body.properties).toHaveProperty('price')
    expect(body.properties).not.toHaveProperty('status')
    expect(body.properties).not.toHaveProperty('category')
  })

  it('writable whitelist restricts patch request body properties', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { writable: ['name'] } })])
    const body = spec.paths['/products/{id}']!.patch!.requestBody!.content['application/json'].schema
    expect(body.properties).toHaveProperty('name')
    expect(body.properties).not.toHaveProperty('price')
  })

  // ── paths ───────────────────────────────────────────────────────────────────

  it('generates /products and /products/{id} paths', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.paths).toHaveProperty('/products')
    expect(spec.paths).toHaveProperty('/products/{id}')
  })

  it('generates GET /products (getAll)', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.paths['/products']!.get).toBeDefined()
    expect(spec.paths['/products']!.get!.operationId).toBe('getAll_products')
  })

  it('generates POST /products (create)', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.paths['/products']!.post).toBeDefined()
    expect(spec.paths['/products']!.post!.operationId).toBe('create_products')
  })

  it('generates GET /products/{id} (getOne)', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.paths['/products/{id}']!.get).toBeDefined()
    expect(spec.paths['/products/{id}']!.get!.operationId).toBe('getOne_products')
  })

  it('generates PUT /products/{id} (update)', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.paths['/products/{id}']!.put).toBeDefined()
    expect(spec.paths['/products/{id}']!.put!.operationId).toBe('update_products')
  })

  it('generates PATCH /products/{id} (patch)', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.paths['/products/{id}']!.patch).toBeDefined()
    expect(spec.paths['/products/{id}']!.patch!.operationId).toBe('patch_products')
  })

  it('generates DELETE /products/{id} (delete)', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.paths['/products/{id}']!.delete).toBeDefined()
    expect(spec.paths['/products/{id}']!.delete!.operationId).toBe('delete_products')
  })

  // ── disabled routes ─────────────────────────────────────────────────────────

  it('omits getAll when routes.getAll.enabled is false', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { routes: { getAll: { enabled: false } } } })])
    expect(spec.paths['/products']?.get).toBeUndefined()
  })

  it('omits create when routes.create.enabled is false', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { routes: { create: { enabled: false } } } })])
    expect(spec.paths['/products']?.post).toBeUndefined()
  })

  it('omits getOne when routes.getOne.enabled is false', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { routes: { getOne: { enabled: false } } } })])
    expect(spec.paths['/products/{id}']?.get).toBeUndefined()
  })

  it('omits update when routes.update.enabled is false', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { routes: { update: { enabled: false } } } })])
    expect(spec.paths['/products/{id}']?.put).toBeUndefined()
  })

  it('omits patch when routes.patch.enabled is false', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { routes: { patch: { enabled: false } } } })])
    expect(spec.paths['/products/{id}']?.patch).toBeUndefined()
  })

  it('omits delete when routes.delete.enabled is false', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { routes: { delete: { enabled: false } } } })])
    expect(spec.paths['/products/{id}']?.delete).toBeUndefined()
  })

  // ── prefix ──────────────────────────────────────────────────────────────────

  it('applies prefix to all paths', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { prefix: '/v1' } })])
    expect(spec.paths).toHaveProperty('/v1/products')
    expect(spec.paths).toHaveProperty('/v1/products/{id}')
    expect(spec.paths).not.toHaveProperty('/products')
  })

  it('strips trailing slash from prefix', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { prefix: '/v1/' } })])
    expect(spec.paths).toHaveProperty('/v1/products')
  })

  // ── soft delete routes ──────────────────────────────────────────────────────

  it('does not generate restore/purge paths when softDelete is not set', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.paths).not.toHaveProperty('/products/{id}/restore')
    expect(spec.paths).not.toHaveProperty('/products/{id}/purge')
  })

  it('generates restore path when softDelete is true and restore.enabled is true', () => {
    const spec = generateOpenAPISpec([makeInstance({
      config: { softDelete: true, routes: { restore: { enabled: true } } },
    })])
    expect(spec.paths).toHaveProperty('/products/{id}/restore')
    expect(spec.paths['/products/{id}/restore']!.post!.operationId).toBe('restore_products')
  })

  it('generates purge path when softDelete is true and purge.enabled is true', () => {
    const spec = generateOpenAPISpec([makeInstance({
      config: { softDelete: true, routes: { purge: { enabled: true } } },
    })])
    expect(spec.paths).toHaveProperty('/products/{id}/purge')
    expect(spec.paths['/products/{id}/purge']!.delete!.operationId).toBe('purge_products')
  })

  it('does not generate restore when softDelete is true but restore.enabled is not set', () => {
    const spec = generateOpenAPISpec([makeInstance({ config: { softDelete: true } })])
    expect(spec.paths).not.toHaveProperty('/products/{id}/restore')
  })

  it('restore and purge paths respect prefix', () => {
    const spec = generateOpenAPISpec([makeInstance({
      config: {
        prefix:     '/v1',
        softDelete: true,
        routes:     { restore: { enabled: true }, purge: { enabled: true } },
      },
    })])
    expect(spec.paths).toHaveProperty('/v1/products/{id}/restore')
    expect(spec.paths).toHaveProperty('/v1/products/{id}/purge')
  })

  // ── getAll query parameters ─────────────────────────────────────────────────

  it('getAll includes filter params for each schema field', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('name')
    expect(names).toContain('price')
    expect(names).toContain('status')
  })

  it('getAll includes sort and order params', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('sort')
    expect(names).toContain('order')
  })

  it('getAll includes fields param', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('fields')
  })

  it('getAll includes populate param when ref fields exist', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('populate')
  })

  it('getAll does not include populate param when no ref fields', () => {
    const instance = makeInstance()
    instance.parsedSchema.refFields = []
    const spec  = generateOpenAPISpec([instance])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).not.toContain('populate')
  })

  it('getAll includes page and limit when pagination is page', () => {
    const spec  = generateOpenAPISpec([makeInstance({ config: { pagination: 'page' } })])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('page')
    expect(names).toContain('limit')
    expect(names).not.toContain('cursor')
  })

  it('getAll includes cursor and limit when pagination is cursor', () => {
    const spec  = generateOpenAPISpec([makeInstance({ config: { pagination: 'cursor' } })])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('cursor')
    expect(names).toContain('limit')
    expect(names).not.toContain('page')
  })

  it('getAll includes page, cursor, and limit when pagination is both', () => {
    const spec  = generateOpenAPISpec([makeInstance({ config: { pagination: 'both' } })])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('page')
    expect(names).toContain('cursor')
    expect(names).toContain('limit')
  })

  it('getAll includes search param when search is all-fields', () => {
    const spec  = generateOpenAPISpec([makeInstance({ config: { search: 'all-fields' } })])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('search')
  })

  it('getAll includes search and searchField when search is single-field', () => {
    const spec  = generateOpenAPISpec([makeInstance({ config: { search: 'single-field' } })])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('search')
    expect(names).toContain('searchField')
  })

  it('getAll does not include search param when search is not configured', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const names = spec.paths['/products']!.get!.parameters!.map(p => p.name)
    expect(names).not.toContain('search')
  })

  // ── getOne query parameters ─────────────────────────────────────────────────

  it('getOne includes fields param', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const names = spec.paths['/products/{id}']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('fields')
  })

  it('getOne includes populate param when ref fields exist', () => {
    const spec  = generateOpenAPISpec([makeInstance()])
    const names = spec.paths['/products/{id}']!.get!.parameters!.map(p => p.name)
    expect(names).toContain('populate')
  })

  it('getOne does not include populate param when no ref fields', () => {
    const instance = makeInstance()
    instance.parsedSchema.refFields = []
    const spec  = generateOpenAPISpec([instance])
    const names = spec.paths['/products/{id}']!.get!.parameters!.map(p => p.name)
    expect(names).not.toContain('populate')
  })

  // ── request bodies ──────────────────────────────────────────────────────────

  it('create request body marks required fields', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    const body = spec.paths['/products']!.post!.requestBody!.content['application/json'].schema
    expect(body.required).toContain('name')
    expect(body.required).toContain('price')
    expect(body.required).not.toContain('status')
  })

  it('update request body has no required fields', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    const body = spec.paths['/products/{id}']!.put!.requestBody!.content['application/json'].schema
    expect(body.required ?? []).toHaveLength(0)
  })

  it('patch request body has no required fields', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    const body = spec.paths['/products/{id}']!.patch!.requestBody!.content['application/json'].schema
    expect(body.required ?? []).toHaveLength(0)
  })

  // ── response codes ──────────────────────────────────────────────────────────

  it('getAll has 200 and 500 responses', () => {
    const responses = generateOpenAPISpec([makeInstance()]).paths['/products']!.get!.responses
    expect(responses).toHaveProperty('200')
    expect(responses).toHaveProperty('500')
  })

  it('create has 201, 422, and 500 responses', () => {
    const responses = generateOpenAPISpec([makeInstance()]).paths['/products']!.post!.responses
    expect(responses).toHaveProperty('201')
    expect(responses).toHaveProperty('422')
    expect(responses).toHaveProperty('500')
  })

  it('getOne has 200, 400, 404, and 500 responses', () => {
    const responses = generateOpenAPISpec([makeInstance()]).paths['/products/{id}']!.get!.responses
    expect(responses).toHaveProperty('200')
    expect(responses).toHaveProperty('400')
    expect(responses).toHaveProperty('404')
    expect(responses).toHaveProperty('500')
  })

  it('update has 200, 400, 404, 422, and 500 responses', () => {
    const responses = generateOpenAPISpec([makeInstance()]).paths['/products/{id}']!.put!.responses
    expect(responses).toHaveProperty('200')
    expect(responses).toHaveProperty('400')
    expect(responses).toHaveProperty('404')
    expect(responses).toHaveProperty('422')
    expect(responses).toHaveProperty('500')
  })

  it('patch has 200, 400, 404, 422, and 500 responses', () => {
    const responses = generateOpenAPISpec([makeInstance()]).paths['/products/{id}']!.patch!.responses
    expect(responses).toHaveProperty('200')
    expect(responses).toHaveProperty('400')
    expect(responses).toHaveProperty('404')
    expect(responses).toHaveProperty('422')
    expect(responses).toHaveProperty('500')
  })

  it('delete has 200, 400, 404, and 500 responses', () => {
    const responses = generateOpenAPISpec([makeInstance()]).paths['/products/{id}']!.delete!.responses
    expect(responses).toHaveProperty('200')
    expect(responses).toHaveProperty('400')
    expect(responses).toHaveProperty('404')
    expect(responses).toHaveProperty('500')
  })

  it('restore has 200, 400, 404, and 500 responses', () => {
    const responses = generateOpenAPISpec([makeInstance({
      config: { softDelete: true, routes: { restore: { enabled: true } } },
    })]).paths['/products/{id}/restore']!.post!.responses
    expect(responses).toHaveProperty('200')
    expect(responses).toHaveProperty('400')
    expect(responses).toHaveProperty('404')
    expect(responses).toHaveProperty('500')
  })

  it('purge has 200, 400, 404, and 500 responses', () => {
    const responses = generateOpenAPISpec([makeInstance({
      config: { softDelete: true, routes: { purge: { enabled: true } } },
    })]).paths['/products/{id}/purge']!.delete!.responses
    expect(responses).toHaveProperty('200')
    expect(responses).toHaveProperty('400')
    expect(responses).toHaveProperty('404')
    expect(responses).toHaveProperty('500')
  })

  // ── tags ────────────────────────────────────────────────────────────────────

  it('all operations are tagged with the resource name', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.paths['/products']!.get!.tags).toContain('products')
    expect(spec.paths['/products']!.post!.tags).toContain('products')
    expect(spec.paths['/products/{id}']!.get!.tags).toContain('products')
    expect(spec.paths['/products/{id}']!.put!.tags).toContain('products')
    expect(spec.paths['/products/{id}']!.patch!.tags).toContain('products')
    expect(spec.paths['/products/{id}']!.delete!.tags).toContain('products')
  })

  // ── singular name derivation ────────────────────────────────────────────────

  it('derives singular name for summaries (products → product)', () => {
    const spec = generateOpenAPISpec([makeInstance()])
    expect(spec.paths['/products']!.post!.summary).toContain('product')
  })

  it('derives singular name for -ies resources (categories → category)', () => {
    const instance = makeInstance({ resourceName: 'categories' })
    const spec     = generateOpenAPISpec([instance])
    expect(spec.paths['/categories']!.post!.summary).toContain('category')
  })

  // ── custom routes ───────────────────────────────────────────────────────────

  it('generates path items for custom routes', () => {
    const instance = makeInstance({
      config: {
        custom: [{ method: 'GET', path: '/products/active', handler: async () => {} }],
      },
    })
    const spec = generateOpenAPISpec([instance])
    expect(spec.paths).toHaveProperty('/products/active')
    expect(spec.paths['/products/active']!.get).toBeDefined()
  })

  it('custom route operationId is derived from path', () => {
    const instance = makeInstance({
      config: {
        custom: [{ method: 'GET', path: '/products/active', handler: async () => {} }],
      },
    })
    const spec = generateOpenAPISpec([instance])
    expect(spec.paths['/products/active']!.get!.operationId).toBe('get_products_active')
  })

  // ── multiple instances ──────────────────────────────────────────────────────

  it('merges paths from multiple instances', () => {
    const products   = makeInstance({ resourceName: 'products' })
    const categories = makeInstance({
      resourceName: 'categories',
      parsedSchema: {
        fields:       [{ name: 'name', type: 'string', required: true, isArray: false }],
        stringFields: ['name'],
        refFields:    [],
      },
    })
    const spec = generateOpenAPISpec([products, categories])
    expect(spec.paths).toHaveProperty('/products')
    expect(spec.paths).toHaveProperty('/categories')
    expect(spec.components.schemas).toHaveProperty('Product')
    expect(spec.components.schemas).toHaveProperty('Category')
  })

})
