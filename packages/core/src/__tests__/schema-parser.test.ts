import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { parseSchema } from '../schema-parser'

const { Schema } = mongoose

describe('parseSchema', () => {
  it('parses basic field types', () => {
    const schema = new Schema({
      name:      String,
      age:       Number,
      active:    Boolean,
      createdAt: Date,
    })
    const parsed = parseSchema(schema)
    const byName = Object.fromEntries(parsed.fields.map(f => [f.name, f]))

    expect(byName['name'].type).toBe('string')
    expect(byName['age'].type).toBe('number')
    expect(byName['active'].type).toBe('boolean')
    expect(byName['createdAt'].type).toBe('date')
  })

  it('skips _id and __v', () => {
    const schema = new Schema({ title: String })
    const parsed = parseSchema(schema)
    const names  = parsed.fields.map(f => f.name)

    expect(names).not.toContain('_id')
    expect(names).not.toContain('__v')
  })

  it('captures required flag', () => {
    const schema = new Schema({
      name:  { type: String, required: true },
      notes: { type: String },
    })
    const parsed = parseSchema(schema)
    const byName = Object.fromEntries(parsed.fields.map(f => [f.name, f]))

    expect(byName['name'].required).toBe(true)
    expect(byName['notes'].required).toBe(false)
  })

  it('captures string constraints', () => {
    const schema = new Schema({
      username: { type: String, minlength: 3, maxlength: 20 },
    })
    const parsed = parseSchema(schema)
    const field  = parsed.fields.find(f => f.name === 'username')!

    expect(field.minlength).toBe(3)
    expect(field.maxlength).toBe(20)
  })

  it('captures number constraints including zero boundary', () => {
    const schema = new Schema({
      stock: { type: Number, min: 0, max: 1000 },
    })
    const parsed = parseSchema(schema)
    const field  = parsed.fields.find(f => f.name === 'stock')!

    expect(field.min).toBe(0)
    expect(field.max).toBe(1000)
  })

  it('captures enum values', () => {
    const schema = new Schema({
      status: { type: String, enum: ['active', 'inactive', 'draft'] },
    })
    const parsed = parseSchema(schema)
    const field  = parsed.fields.find(f => f.name === 'status')!

    expect(field.enum).toEqual(['active', 'inactive', 'draft'])
  })

  it('captures ref field', () => {
    const schema = new Schema({
      category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
    })
    const parsed = parseSchema(schema)
    const field  = parsed.fields.find(f => f.name === 'category')!

    expect(field.type).toBe('objectid')
    expect(field.ref).toBe('Category')
  })

  it('populates stringFields with all string-type field names', () => {
    const schema = new Schema({
      name:        String,
      description: String,
      price:       Number,
    })
    const parsed = parseSchema(schema)

    expect(parsed.stringFields).toContain('name')
    expect(parsed.stringFields).toContain('description')
    expect(parsed.stringFields).not.toContain('price')
  })

  it('populates refFields with all ObjectId ref field names', () => {
    const schema = new Schema({
      category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
      brand:    { type: mongoose.Schema.Types.ObjectId, ref: 'Brand' },
      name:     String,
    })
    const parsed = parseSchema(schema)

    expect(parsed.refFields).toContain('category')
    expect(parsed.refFields).toContain('brand')
    expect(parsed.refFields).not.toContain('name')
  })
})
