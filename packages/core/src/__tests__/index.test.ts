import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { createSchemaRoute } from '../index'

const { Schema } = mongoose

const ProductSchema = new Schema({
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  status:   { type: String, enum: ['active', 'inactive'] },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
})

describe('createSchemaRoute', () => {
  it('returns a SchemaRouteInstance with all required fields', () => {
    const instance = createSchemaRoute(ProductSchema, 'products', {})

    expect(instance).toHaveProperty('routes')
    expect(instance).toHaveProperty('parsedSchema')
    expect(instance).toHaveProperty('resourceName', 'products')
    expect(instance).toHaveProperty('schema', ProductSchema)
    expect(instance).toHaveProperty('config')
  })

  it('parsedSchema contains the correct fields', () => {
    const instance = createSchemaRoute(ProductSchema, 'products', {})
    const names    = instance.parsedSchema.fields.map(f => f.name)

    expect(names).toContain('name')
    expect(names).toContain('price')
    expect(names).toContain('status')
    expect(names).toContain('category')
  })

  it('routes contains all 5 CRUD operations by default', () => {
    const instance = createSchemaRoute(ProductSchema, 'products', {})
    const ops      = instance.routes.map(r => r.operation)

    expect(ops).toContain('getAll')
    expect(ops).toContain('getOne')
    expect(ops).toContain('create')
    expect(ops).toContain('update')
    expect(ops).toContain('delete')
  })

  it('applies resource config to routes', () => {
    const instance = createSchemaRoute(ProductSchema, 'products', {
      routes: { delete: { enabled: false } },
    })
    const ops = instance.routes.map(r => r.operation)

    expect(ops).not.toContain('delete')
  })

  it('stores the config on the instance', () => {
    const config   = { pagination: 'page' as const, search: 'all-fields' as const }
    const instance = createSchemaRoute(ProductSchema, 'products', config)

    expect(instance.config).toMatchObject(config)
  })

  it('defaults to empty config when none is provided', () => {
    const instance = createSchemaRoute(ProductSchema, 'products')
    expect(instance.config).toEqual({})
  })
})
