import { describe, it, expect } from 'vitest'
import { buildRoutes } from '../route-builder'

describe('buildRoutes', () => {
  it('generates all 5 CRUD routes by default', () => {
    const routes = buildRoutes('products', {})
    const ops    = routes.map(r => r.operation)

    expect(ops).toContain('getAll')
    expect(ops).toContain('getOne')
    expect(ops).toContain('create')
    expect(ops).toContain('update')
    expect(ops).toContain('delete')
    expect(routes).toHaveLength(5)
  })

  it('assigns correct HTTP methods', () => {
    const routes  = buildRoutes('products', {})
    const byOp    = Object.fromEntries(routes.map(r => [r.operation, r]))

    expect(byOp['getAll']!.method).toBe('GET')
    expect(byOp['getOne']!.method).toBe('GET')
    expect(byOp['create']!.method).toBe('POST')
    expect(byOp['update']!.method).toBe('PUT')
    expect(byOp['delete']!.method).toBe('DELETE')
  })

  it('assigns correct paths', () => {
    const routes = buildRoutes('products', {})
    const byOp   = Object.fromEntries(routes.map(r => [r.operation, r]))

    expect(byOp['getAll']!.path).toBe('/products')
    expect(byOp['getOne']!.path).toBe('/products/:id')
    expect(byOp['create']!.path).toBe('/products')
    expect(byOp['update']!.path).toBe('/products/:id')
    expect(byOp['delete']!.path).toBe('/products/:id')
  })

  it('excludes a route when enabled is false', () => {
    const routes = buildRoutes('products', {
      routes: { delete: { enabled: false } },
    })
    const ops = routes.map(r => r.operation)

    expect(ops).not.toContain('delete')
    expect(routes).toHaveLength(4)
  })

  it('excludes multiple routes when disabled', () => {
    const routes = buildRoutes('products', {
      routes: {
        create: { enabled: false },
        update: { enabled: false },
        delete: { enabled: false },
      },
    })
    expect(routes).toHaveLength(2)
  })

  it('attaches middleware to the correct route', () => {
    const authMiddleware = () => {}
    const routes = buildRoutes('products', {
      routes: { create: { middleware: [authMiddleware] } },
    })
    const createRoute = routes.find(r => r.operation === 'create')!

    expect(createRoute.middleware).toContain(authMiddleware)
  })

  it('returns empty middleware array when none configured', () => {
    const routes      = buildRoutes('products', {})
    const getAllRoute  = routes.find(r => r.operation === 'getAll')!

    expect(getAllRoute.middleware).toEqual([])
  })

  it('attaches rateLimit config to the route', () => {
    const routes = buildRoutes('products', {
      routes: { getAll: { rateLimit: { max: 100, window: '1m' } } },
    })
    const getAllRoute = routes.find(r => r.operation === 'getAll')!

    expect(getAllRoute.rateLimit).toEqual({ max: 100, window: '1m' })
  })

  it('appends custom routes after CRUD routes in the array', () => {
    const handler = () => {}
    const routes  = buildRoutes('products', {
      custom: [{ method: 'GET', path: '/products/active', handler }],
    })
    const lastRoute = routes[routes.length - 1]!

    expect(lastRoute.operation).toBe('custom')
    expect(lastRoute.path).toBe('/products/active')
    expect(lastRoute.method).toBe('GET')
  })

  it('includes custom route handler in middleware chain', () => {
    const handler = () => {}
    const routes  = buildRoutes('products', {
      custom: [{ method: 'GET', path: '/products/active', handler }],
    })
    const customRoute = routes.find(r => r.operation === 'custom')!

    expect(customRoute.middleware).toContain(handler)
  })

  it('uses resource name as base path', () => {
    const routes = buildRoutes('categories', {})
    const paths  = routes.map(r => r.path)

    expect(paths.every(p => p.startsWith('/categories'))).toBe(true)
  })
})
