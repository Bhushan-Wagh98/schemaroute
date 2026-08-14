# @schemaroute/express

[![npm](https://img.shields.io/npm/v/@schemaroute/express)](https://www.npmjs.com/package/@schemaroute/express)

Express adapter for SchemaRoute. One function call registers a fully working CRUD API on your Express app — with validation, filtering, pagination, search, population, hooks, rate limiting, and custom routes.

---

## Install

```bash
npm install @schemaroute/core @schemaroute/express
```

---

## Quick Start

```js
import express  from 'express'
import mongoose from 'mongoose'
import { createAPI } from '@schemaroute/express'

const app = express()
app.use(express.json())

const ProductSchema = new mongoose.Schema({
  name:     { type: String,  required: true },
  price:    { type: Number,  required: true, min: 0 },
  stock:    { type: Number,  required: true, min: 0 },
  status:   { type: String,  enum: ['active', 'inactive'], default: 'active' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
})

mongoose.connect(process.env.MONGO_URI).then(() => {
  createAPI(app, ProductSchema, 'products', {}, mongoose)
  app.listen(3000)
})
```

Generates:

```
GET    /products
GET    /products/:id
POST   /products
PUT    /products/:id
DELETE /products/:id
```

---

## `createAPI(app, schema, resourceName, config?, mongoose?)`

| Param | Type | Description |
|---|---|---|
| `app` | `Application` | Express app instance |
| `schema` | `Schema` | Mongoose schema |
| `resourceName` | `string` | Plural resource name — used as the URL base path |
| `config` | `ResourceConfig` | Optional resource-level configuration |
| `mongoose` | `Mongoose` | Your mongoose instance — required when using Atlas or a custom connection |

Returns a `SchemaRouteInstance` — pass it to `@schemaroute/docs` or `@schemaroute/sdk`.

> Always call `createAPI` inside the `.then()` callback of `mongoose.connect()` so models bind to the active connection.

---

## Full Config Example

```js
createAPI(app, ProductSchema, 'products', {

  // resource-level defaults (apply to all routes unless overridden)
  pagination: 'page',
  search:     'all-fields',
  populate:   ['category'],
  exclude:    ['__v'],

  routes: {

    getAll: {
      enabled:   true,
      public:    true,
      sort:      true,
      fields:    true,
      populate:  ['category'],
      rateLimit: { max: 100, window: '1m' },
      middleware: [requestLogger],
    },

    getOne: {
      enabled:  true,
      public:   true,
      populate: ['category'],
    },

    create: {
      enabled:    true,
      validation: true,
      middleware: [requireAuth],
      rateLimit:  { max: 20, window: '1m' },
      beforeCreate: async (data, ctx) => {
        data.slug      = data.name.toLowerCase().replace(/\s+/g, '-')
        data.createdBy = ctx.user?.id
        data.source    = ctx.headers['x-source']
        return data
      },
      afterCreate: async (doc, ctx) => {
        await sendWelcomeEmail(doc)
        await notifyAdmins(doc)
      },
    },

    update: {
      enabled:    true,
      validation: true,
      middleware: [requireAuth],
      beforeUpdate: async (data, ctx) => {
        data.updatedBy = ctx.user?.id
        return data
      },
      afterUpdate: async (doc) => {
        await invalidateCache(doc._id)
      },
    },

    delete: {
      enabled:    true,
      middleware: [requireAuth, requireAdmin],
      beforeDelete: async (doc) => {
        await cleanupRelated(doc._id)
      },
      afterDelete: async (doc) => {
        await auditLog('delete', doc)
      },
    },

  },

  custom: [
    {
      method:     'GET',
      path:       '/products/featured',
      middleware: [requestLogger],
      handler: async (req, res) => {
        const items = await Product.find({ featured: true }).limit(10)
        res.json({ success: true, data: items })
      },
    },
    {
      method:     'POST',
      path:       '/products/:id/duplicate',
      middleware: [requireAuth],
      handler: async (req, res) => {
        const original = await Product.findById(req.params.id)
        const copy = await Product.create({ ...original.toObject(), _id: undefined, name: original.name + ' (copy)' })
        res.status(201).json({ success: true, data: copy })
      },
    },
  ],

}, mongoose)
```

---

## Route Config Options

| Option | Type | Default | Description |
|---|---|---|---|
| `enabled` | `boolean` | `true` | Disable this route entirely |
| `public` | `boolean` | `false` | Mark route as public (informational) |
| `middleware` | `MiddlewareFn[]` | `[]` | Middleware chain run before the handler |
| `validation` | `boolean` | `false` | Auto-validate request body against schema |
| `rateLimit` | `object \| array` | — | Built-in limiter or your own middleware |
| `sort` | `boolean` | `false` | Allow `?sort=field&order=asc\|desc` |
| `fields` | `boolean` | `false` | Allow `?fields=name,price` field selection |
| `populate` | `string[]` | — | Ref fields to populate |
| `exclude` | `string[]` | — | Fields to strip from the response |
| `select` | `string[]` | — | Fields to include in the response |
| `transform` | `TransformFn` | — | Reshape each document before sending |

---

## Hooks

All hooks receive `(data/doc, ctx)` where `ctx` is a `RequestContext` snapshot containing `req.headers`, `req.params`, `req.query`, and any user context.

| Hook | Runs | Can modify data |
|---|---|---|
| `beforeCreate(data, ctx)` | before insert | ✅ return modified data |
| `afterCreate(doc, ctx)` | after insert | ❌ side effects only |
| `beforeUpdate(data, ctx)` | before update | ✅ return modified data |
| `afterUpdate(doc, ctx)` | after update | ❌ side effects only |
| `beforeDelete(doc, ctx)` | before delete | ❌ side effects only |
| `afterDelete(doc, ctx)` | after delete | ❌ side effects only |

```js
beforeCreate: async (data, ctx) => {
  data.slug      = data.name.toLowerCase().replace(/\s+/g, '-')
  data.createdBy = ctx.user?.id
  data.source    = ctx.headers['x-source']
  return data   // ← must return the modified data
}
```

---

## Pagination

| Value | Query params | Description |
|---|---|---|
| `'page'` | `?page=1&limit=10` | Offset-based |
| `'cursor'` | `?cursor=<id>&limit=10` | Cursor-based (efficient for large datasets) |
| `'both'` | either | Cursor when `?cursor` present, page otherwise |
| `false` | — | Disabled — returns all matching documents |

---

## Search

| Value | Behaviour |
|---|---|
| `'all-fields'` | Searches across all string fields automatically |
| `'single-field'` | Searches in the field specified by `?searchField=` |
| `false` | Disabled |

---

## Rate Limiting

```js
// built-in sliding window
rateLimit: { max: 100, window: '1m' }
rateLimit: { max: 10,  window: '30s' }
rateLimit: { max: 5,   window: '1h' }

// bring your own middleware
rateLimit: [expressRateLimit({ windowMs: 60_000, max: 100 })]
```

---

## Response Shape

Default envelope:

```json
{
  "success": true,
  "data": [...],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

Custom envelope per resource:

```js
response: (data, meta) => ({ result: data, pagination: meta, ok: true })
```

---

## Querying

Every `GET /resource` endpoint supports:

| Param | Example | Description |
|---|---|---|
| Field filter | `?status=active&category=abc` | Filter by any schema field |
| `sort` | `?sort=price&order=desc` | Sort by field |
| `fields` | `?fields=name,price` | Select specific fields |
| `search` | `?search=laptop` | Full-text search |
| `searchField` | `?searchField=name` | Restrict search to one field |
| `page` | `?page=2&limit=10` | Page-based pagination |
| `cursor` | `?cursor=<id>&limit=10` | Cursor-based pagination |
| `populate` | `?populate=category` | Populate ref fields |

---

## Error Responses

| Status | Cause |
|---|---|
| `400` | Invalid MongoDB ObjectId format |
| `400` | Malformed JSON request body |
| `404` | Document not found |
| `422` | Validation failed |
| `500` | Internal server error |

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    { "field": "name",  "message": "name is required" },
    { "field": "price", "message": "price must be a number" }
  ]
}
```

---

## License

MIT
