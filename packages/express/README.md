# @schemaroute/express

Express adapter for SchemaRoute. Registers auto-generated CRUD routes on an Express app from a Mongoose schema.

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
  name:  { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0 },
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

  // resource-level defaults
  pagination: 'page',
  search:     'all-fields',
  populate:   ['category'],
  exclude:    ['__v'],
  transform:  (doc) => ({ id: doc._id, ...doc }),

  routes: {
    getAll: {
      public:    true,
      sort:      true,
      fields:    true,
      rateLimit: { max: 100, window: '1m' },
    },
    getOne: {
      public:   true,
      populate: ['category'],
    },
    create: {
      validation: true,
      middleware: [requireAuth],
      beforeCreate: async (data, ctx) => {
        data.createdBy = ctx.user?.id
        return data
      },
      afterCreate: async (doc, ctx) => {
        console.log('created:', doc._id)
      },
    },
    update: {
      validation: true,
      middleware: [requireAuth],
    },
    delete: {
      middleware: [requireAuth, requireAdmin],
      afterDelete: async (doc) => {
        console.log('deleted:', doc._id)
      },
    },
  },

  custom: [
    {
      method:     'GET',
      path:       '/products/active',
      middleware: [requestLogger],
      handler: async (req, res) => {
        const products = await mongoose.model('Product').find({ status: 'active' })
        res.json({ success: true, data: products })
      },
    },
  ],

}, mongoose)
```

---

## Route Config Options

| Option | Type | Description |
|---|---|---|
| `enabled` | `boolean` | Disable this route entirely. Default: `true` |
| `public` | `boolean` | Mark route as public (informational) |
| `middleware` | `MiddlewareFn[]` | Middleware chain run before the handler |
| `validation` | `boolean` | Auto-validate request body against schema |
| `rateLimit` | `object \| array` | Built-in limiter `{ max, window }` or your own middleware array |
| `populate` | `string[]` | Ref fields to populate |
| `exclude` | `string[]` | Fields to strip from the response |
| `select` | `string[]` | Fields to include in the response |
| `transform` | `TransformFn` | Reshape the document before sending |

---

## Hooks

All hooks receive `(data/doc, ctx)` where `ctx` is a `RequestContext` snapshot.

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
  return data
}
```

---

## Pagination

| Value | Query params | Description |
|---|---|---|
| `'page'` | `?page=1&limit=10` | Offset-based |
| `'cursor'` | `?cursor=<id>&limit=10` | Cursor-based |
| `'both'` | either | Cursor when `?cursor` present, page otherwise |
| `false` | — | Disabled — returns all matching documents |

---

## Rate Limiting

```js
// built-in sliding window
rateLimit: { max: 100, window: '1m' }
rateLimit: { max: 10,  window: '30s' }

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

Custom envelope:

```js
response: (data, meta) => ({ result: data, pagination: meta })
```

---

## Error Responses

| Status | Cause |
|---|---|
| `400` | Invalid MongoDB ObjectId format |
| `400` | Malformed JSON request body |
| `404` | Document not found |
| `422` | Validation failed |
| `500` | Internal server error |
