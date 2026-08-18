# schemaroute

[![npm](https://img.shields.io/npm/v/schemaroute)](https://www.npmjs.com/package/schemaroute)
[![license](https://img.shields.io/npm/l/schemaroute)](https://github.com/Bhushan-Wagh98/schemaroute/blob/main/LICENSE)

Auto-generate a fully working CRUD API from a Mongoose schema. No boilerplate. No repetition. Just define your schema and get routes, validation, filtering, pagination, search, population, hooks, OpenAPI docs, and a TypeScript SDK — all in one call.

```js
createAPI(app, UserSchema, 'users')

// GET    /users
// GET    /users/:id
// POST   /users
// PUT    /users/:id
// PATCH  /users/:id
// DELETE /users/:id
```

---

## Install

```bash
npm install schemaroute
```

This single package includes everything:

| Package | Description |
|---|---|
| `@schemaroute/common` | Shared TypeScript types — zero runtime dependencies |
| `@schemaroute/core` | Framework-agnostic schema parser, route builder, validator, query pipeline |
| `@schemaroute/express` | Express adapter — registers routes on an Express app |
| `@schemaroute/fastify` | Fastify adapter — full feature parity with Express adapter |
| `@schemaroute/docs` | OpenAPI 3.0 spec generator + Swagger UI |
| `@schemaroute/sdk` | Auto-generated TypeScript client SDK |

---

## Quick Start

```js
import express  from 'express'
import mongoose from 'mongoose'
import { createAPI } from 'schemaroute'

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
  app.listen(3000, () => console.log('Running on http://localhost:3000'))
})
```

---

## Features

### Querying out of the box

Every `GET /resource` endpoint supports:

| Query Param | Example | Description |
|---|---|---|
| Field filter | `?status=active&category=abc` | Filter by any schema field |
| Sort | `?sort=price&order=desc` | Sort by any field |
| Fields | `?fields=name,price,stock` | Select specific fields — works on both `getAll` and `getOne` |
| Search | `?search=laptop` | Search across all string fields |
| Search field | `?search=laptop&searchField=name` | Search in a specific field |
| Page pagination | `?page=2&limit=10` | Offset-based pagination |
| Cursor pagination | `?cursor=<id>&limit=10` | Cursor-based pagination |
| Populate | `?populate=category` | Populate Mongoose refs |

### Response envelope

```json
{
  "success": true,
  "data": [...],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 42,
    "totalPages": 5
  }
}
```

### Validation errors

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

## Full Config Example

```js
import { createAPI } from 'schemaroute'

createAPI(app, ProductSchema, 'products', {

  // resource-level defaults
  pagination:  'page',
  search:      'all-fields',
  populate:    ['category'],
  exclude:     ['__v'],
  expose:      ['name', 'price', 'status', 'category'],  // whitelist — only these fields ever leave the API
  prefix:      '/v1',          // all routes registered under /v1/products
  maxBodySize: '100kb',        // reject POST/PUT/PATCH bodies over this size
  transform:   (doc) => ({ id: doc._id, ...doc }),
  debug:       false,

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
        data.slug      = data.name.toLowerCase().replace(/\s+/g, '-')
        data.createdBy = ctx.user?.id
        // ctx.req is the raw request — access ip, socket, custom middleware props
        console.log('created from ip:', ctx.req.ip)
        return data
      },
      afterCreate: async (doc, ctx) => {
        await notifySubscribers(doc)
      },
    },
    update: {
      validation: true,
      middleware: [requireAuth],
    },
    patch: {
      middleware: [requireAuth],
    },
    delete: {
      middleware: [requireAuth, requireAdmin],
      beforeDelete: async (doc) => {
        await cleanupRelated(doc._id)
      },
    },
  },

  custom: [
    {
      method:  'GET',
      path:    '/products/featured',
      handler: async (req, res) => {
        const items = await Product.find({ featured: true })
        res.json({ success: true, data: items })
      },
    },
  ],

}, mongoose)
```

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

`beforeCreate` runs **before** validation so computed fields (e.g. auto-generated slugs) are present when required-field checks run.

---

## OpenAPI Docs

```js
import { generateOpenAPISpec, mountSwaggerUI } from 'schemaroute'

const productsInstance   = createAPI(app, ProductSchema,  'products',  {}, mongoose)
const categoriesInstance = createAPI(app, CategorySchema, 'categories', {}, mongoose)

const spec = generateOpenAPISpec([productsInstance, categoriesInstance], {
  title:     'My API',
  version:   '1.0.0',
  serverUrl: 'http://localhost:3000',
})

mountSwaggerUI(app, spec)
// → Swagger UI at http://localhost:3000/api-docs

// custom path
mountSwaggerUI(app, spec, '/docs')

// serve raw spec for Postman / Redoc
app.get('/openapi.json', (req, res) => res.json(spec))
```

---

## TypeScript SDK

```ts
import { createSDK, SDKError } from 'schemaroute'

const api = createSDK('http://localhost:3000', [productsInstance, categoriesInstance])

const { data, meta } = await api.products.getAll({ page: 1, limit: 10, sort: 'price' })
const product        = await api.products.getOne('abc123')
const created        = await api.products.create({ name: 'Laptop', price: 999, stock: 5 })
const updated        = await api.products.update('abc123', { price: 899 })  // PUT — full replace
const patched        = await api.products.patch('abc123', { price: 799 })   // PATCH — partial update
await api.products.delete('abc123')
```

### Error handling

```ts
try {
  await api.products.create({ name: '' })
} catch (err) {
  if (err instanceof SDKError) {
    console.log(err.status)   // 422
    console.log(err.error)    // 'Validation failed'
    console.log(err.details)  // [{ field: 'name', message: 'name is required' }]
  }
}
```

---

## Rate Limiting

```js
// built-in sliding window (in-memory, single-process)
rateLimit: { max: 100, window: '1m' }
rateLimit: { max: 10,  window: '30s' }

// bring your own middleware (for distributed/multi-instance deployments)
rateLimit: [expressRateLimit({ windowMs: 60_000, max: 100 })]
```

---

## Error Responses

| Status | Cause |
|---|---|
| `400` | Invalid MongoDB ObjectId |
| `400` | Malformed JSON body |
| `404` | Document not found |
| `422` | Validation failed |
| `429` | Rate limit exceeded |
| `500` | Internal server error |

---

## Individual Packages

If you only need specific functionality:

```bash
npm install @schemaroute/core @schemaroute/express
npm install @schemaroute/core @schemaroute/fastify  # Fastify adapter
npm install @schemaroute/docs
npm install @schemaroute/sdk
```

---

## Links

- [GitHub](https://github.com/Bhushan-Wagh98/schemaroute)
- [Architecture](https://github.com/Bhushan-Wagh98/schemaroute/blob/main/ARCHITECTURE.md)
- [@schemaroute/core](https://www.npmjs.com/package/@schemaroute/core)
- [@schemaroute/express](https://www.npmjs.com/package/@schemaroute/express)
- [@schemaroute/fastify](https://www.npmjs.com/package/@schemaroute/fastify)
- [@schemaroute/docs](https://www.npmjs.com/package/@schemaroute/docs)
- [@schemaroute/sdk](https://www.npmjs.com/package/@schemaroute/sdk)

---

## License

MIT
