import { describe, it, expect } from 'vitest'
import { validate } from '../validator'
import type { ParsedSchema } from '../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSchema(fields: ParsedSchema['fields']): ParsedSchema {
  return {
    fields,
    stringFields: fields.filter(f => f.type === 'string').map(f => f.name),
    refFields:    fields.filter(f => f.type === 'objectid').map(f => f.name),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('validate', () => {
  describe('required', () => {
    const schema = makeSchema([
      { name: 'name', type: 'string', required: true, isArray: false },
    ])

    it('returns error when required field is missing', () => {
      const errors = validate({}, schema)
      expect(errors).toHaveLength(1)
      expect(errors[0]!.field).toBe('name')
    })

    it('does not error when required field is empty string (minlength catches it)', () => {
      // Empty string is treated as a submitted value, not as missing.
      // If the schema has minlength, that constraint catches it.
      // If not, Mongoose runValidators handles it at the DB layer.
      const errors = validate({ name: '' }, schema)
      expect(errors).toHaveLength(0)
    })

    it('returns no error when required field is present', () => {
      const errors = validate({ name: 'Alice' }, schema)
      expect(errors).toHaveLength(0)
    })
  })

  describe('string constraints', () => {
    const schema = makeSchema([
      { name: 'username', type: 'string', required: false, isArray: false, minlength: 3, maxlength: 10 },
    ])

    it('returns error when value is not a string', () => {
      const errors = validate({ username: 42 }, schema)
      expect(errors[0]!.message).toMatch(/must be a string/)
    })

    it('returns error when string is too short', () => {
      const errors = validate({ username: 'ab' }, schema)
      expect(errors[0]!.message).toMatch(/at least 3/)
    })

    it('returns error when string is too long', () => {
      const errors = validate({ username: 'averylongname' }, schema)
      expect(errors[0]!.message).toMatch(/at most 10/)
    })

    it('passes when string is within bounds', () => {
      expect(validate({ username: 'alice' }, schema)).toHaveLength(0)
    })
  })

  describe('number constraints', () => {
    const schema = makeSchema([
      { name: 'stock', type: 'number', required: false, isArray: false, min: 0, max: 100 },
    ])

    it('returns error when value is not a number', () => {
      const errors = validate({ stock: 'ten' }, schema)
      expect(errors[0]!.message).toMatch(/must be a number/)
    })

    it('returns error when number is below min (including zero boundary)', () => {
      const errors = validate({ stock: -1 }, schema)
      expect(errors[0]!.message).toMatch(/at least 0/)
    })

    it('returns error when number exceeds max', () => {
      const errors = validate({ stock: 101 }, schema)
      expect(errors[0]!.message).toMatch(/at most 100/)
    })

    it('passes when number is exactly at min boundary (0)', () => {
      expect(validate({ stock: 0 }, schema)).toHaveLength(0)
    })

    it('passes when number is within range', () => {
      expect(validate({ stock: 50 }, schema)).toHaveLength(0)
    })
  })

  describe('boolean', () => {
    const schema = makeSchema([
      { name: 'active', type: 'boolean', required: false, isArray: false },
    ])

    it('returns error when value is not a boolean', () => {
      const errors = validate({ active: 'yes' }, schema)
      expect(errors[0]!.message).toMatch(/must be a boolean/)
    })

    it('passes for true and false', () => {
      expect(validate({ active: true },  schema)).toHaveLength(0)
      expect(validate({ active: false }, schema)).toHaveLength(0)
    })
  })

  describe('date', () => {
    const schema = makeSchema([
      { name: 'publishedAt', type: 'date', required: false, isArray: false },
    ])

    it('returns error for invalid date string', () => {
      const errors = validate({ publishedAt: 'not-a-date' }, schema)
      expect(errors[0]!.message).toMatch(/valid date/)
    })

    it('passes for valid ISO date string', () => {
      expect(validate({ publishedAt: '2024-01-15T00:00:00.000Z' }, schema)).toHaveLength(0)
    })
  })

  describe('enum', () => {
    const schema = makeSchema([
      { name: 'status', type: 'string', required: false, isArray: false, enum: ['active', 'inactive'] },
    ])

    it('returns error when value is not in enum', () => {
      const errors = validate({ status: 'pending' }, schema)
      expect(errors[0]!.message).toMatch(/one of: active, inactive/)
    })

    it('passes when value is in enum', () => {
      expect(validate({ status: 'active' }, schema)).toHaveLength(0)
    })
  })

  describe('optional fields', () => {
    const schema = makeSchema([
      { name: 'notes', type: 'string', required: false, isArray: false },
    ])

    it('skips constraint checks when optional field is absent', () => {
      expect(validate({}, schema)).toHaveLength(0)
    })

    it('skips constraint checks when optional field is null', () => {
      expect(validate({ notes: null }, schema)).toHaveLength(0)
    })
  })

  describe('multiple fields', () => {
    const schema = makeSchema([
      { name: 'name',  type: 'string', required: true,  isArray: false },
      { name: 'price', type: 'number', required: true,  isArray: false },
      { name: 'notes', type: 'string', required: false, isArray: false },
    ])

    it('collects all errors in a single pass', () => {
      const errors = validate({}, schema)
      expect(errors).toHaveLength(2)
      expect(errors.map(e => e.field)).toContain('name')
      expect(errors.map(e => e.field)).toContain('price')
    })

    it('returns empty array when all required fields are present', () => {
      expect(validate({ name: 'Widget', price: 9.99 }, schema)).toHaveLength(0)
    })
  })

  describe('nested sub-documents', () => {
    const schema = makeSchema([
      {
        name: 'address', type: 'object', required: true, isArray: false,
        fields: [
          { name: 'street',   type: 'string', required: true,  isArray: false },
          { name: 'city',     type: 'string', required: true,  isArray: false },
          { name: 'postcode', type: 'string', required: false, isArray: false, minlength: 5 },
        ],
      },
    ])

    it('returns error when required nested field is missing', () => {
      const errors = validate({ address: { city: 'London' } }, schema)
      expect(errors.map(e => e.field)).toContain('address.street')
    })

    it('uses dot-notation for nested error field names', () => {
      const errors = validate({ address: {} }, schema)
      expect(errors[0]!.field).toMatch(/^address\./)  
    })

    it('collects all nested errors in a single pass', () => {
      const errors = validate({ address: {} }, schema)
      const fields = errors.map(e => e.field)
      expect(fields).toContain('address.street')
      expect(fields).toContain('address.city')
    })

    it('validates nested constraint (minlength)', () => {
      const errors = validate({ address: { street: '1 Main St', city: 'London', postcode: 'AB1' } }, schema)
      expect(errors[0]!.field).toBe('address.postcode')
      expect(errors[0]!.message).toMatch(/at least 5/)
    })

    it('returns error when sub-document is not an object', () => {
      const errors = validate({ address: 'not-an-object' }, schema)
      expect(errors[0]!.field).toBe('address')
      expect(errors[0]!.message).toMatch(/must be an object/)
    })

    it('returns error when required sub-document is missing entirely', () => {
      const errors = validate({}, schema)
      expect(errors[0]!.field).toBe('address')
      expect(errors[0]!.message).toMatch(/is required/)
    })

    it('passes when all nested required fields are present and valid', () => {
      const errors = validate({ address: { street: '1 Main St', city: 'London' } }, schema)
      expect(errors).toHaveLength(0)
    })
  })
})
