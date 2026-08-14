# SchemaRoute

[![npm](https://img.shields.io/npm/v/schemaroute)](https://www.npmjs.com/package/schemaroute)
[![license](https://img.shields.io/npm/l/schemaroute)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-116%20passing-brightgreen)](#testing)
[![coverage](https://img.shields.io/badge/coverage-99%25-brightgreen)](#testing)

Auto-generate a fully working CRUD API from a Mongoose schema. No boilerplate. No repetition. Just define your schema and get routes, validation, filtering, pagination, search, population, hooks, docs, and a TypeScript SDK — all in one call.

```js
createAPI(app, UserSchema, 'users')

// GET    /users
// GET    /users/:id
// POST   /users
// PUT    /users/:id
// DELETE /users/:id
```

---

## The Problem

Every Node.js developer repeats the same steps for every resource:

```
schema → model → controller → routes → validation → middleware → docs → SDK
```

SchemaRoute eliminates all of that.

---

## Install

```bash
# install everything
npm install schemaroute

# or install only what you need
npm install @schemaroute/core @schemaroute/express
npm install @schemaroute/docs   # OpenAPI + Swagger UI
npm install @schemaroute/sdk    # TypeScript client SDK
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
  app.listen(3000, () => console.log('API running on http://localhost:3000'))
})
```

That's it. You now have a fully working REST API with:

- ✅ Input validation from the schema
- ✅ Filtering, sorting, field selection
- ✅ Page and cursor pagination
- ✅ Full-text search
- ✅ Population of refs
- ✅ Standard error responses

---

## Features

### Querying out of the box

Every `GET /resource` endpoint supports:

| Query Param | Example | Description |
|---|---|---|
| Field filter | `?status=active&category=abc` | Filter by any schema field |
| Sort | `?sort=price&order=desc` | Sort by any field |
| Fields | `?fields=name,price,stock` | Select specific fields |
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
createAPI(app, ProductSchema, 'products', {

  // resource-level defaults
  pagination: 'page',
  search:     'all-fields',
  populate:   ['category'],
  exclude:    ['__v'],

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
        return data
      },
      afterCreate: async (doc) => {
        await notifySubscribers(doc)
      },
    },
    update: {
      validation: true,
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

## 3-Layer Override System

```
Global config (defaults)
    ↓ overridden by
Resource config (per schema)
    ↓ overridden by
Route config (per route)   ← most specific, always wins
```

---

## OpenAPI Docs

```js
import { generateOpenAPISpec, mountSwaggerUI } from '@schemaroute/docs'

const productsInstance  = createAPI(app, ProductSchema,  'products',  {}, mongoose)
const categoriesInstance = createAPI(app, CategorySchema, 'categories', {}, mongoose)

const spec = generateOpenAPISpec([productsInstance, categoriesInstance], {
  title:     'My API',
  version:   '1.0.0',
  serverUrl: 'http://localhost:3000',
})

mountSwaggerUI(app, spec)
// → Swagger UI at http://localhost:3000/api-docs
```

---

## TypeScript SDK

```ts
import { createSDK } from '@schemaroute/sdk'

const api = createSDK('http://localhost:3000', [productsInstance, categoriesInstance])

const { data, meta } = await api.products.getAll({ page: 1, limit: 10, sort: 'price' })
const product        = await api.products.getOne('abc123')
const created        = await api.products.create({ name: 'Laptop', price: 999, stock: 5 })
const updated        = await api.products.update('abc123', { price: 899 })
await api.products.delete('abc123')
```

---

## Packages

| Package | Version | Description |
|---|---|---|
| [`schemaroute`](https://www.npmjs.com/package/schemaroute) | [![npm](https://img.shields.io/npm/v/schemaroute)](https://www.npmjs.com/package/schemaroute) | Umbrella — installs everything |
| [`@schemaroute/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@schemaroute/core)](https://www.npmjs.com/package/@schemaroute/core) | Framework-agnostic core |
| [`@schemaroute/express`](./packages/express) | [![npm](https://img.shields.io/npm/v/@schemaroute/express)](https://www.npmjs.com/package/@schemaroute/express) | Express adapter |
| [`@schemaroute/docs`](./packages/docs) | [![npm](https://img.shields.io/npm/v/@schemaroute/docs)](https://www.npmjs.com/package/@schemaroute/docs) | OpenAPI 3.0 + Swagger UI |
| [`@schemaroute/sdk`](./packages/sdk) | [![npm](https://img.shields.io/npm/v/@schemaroute/sdk)](https://www.npmjs.com/package/@schemaroute/sdk) | TypeScript client SDK |

---

## Comparison

| Feature | cruddy-cat | nestjsx/crud | SchemaRoute |
|---|---|---|---|
| Auto CRUD routes | ✅ | ✅ | ✅ |
| Framework agnostic | ❌ | ❌ (NestJS only) | ✅ |
| Per-route middleware | ❌ | ✅ | ✅ |
| Input validation | ❌ | ✅ | ✅ |
| Filtering + Sorting | ❌ | ✅ | ✅ |
| Pagination (page + cursor) | ❌ | ✅ | ✅ |
| Full-text search | ❌ | ❌ | ✅ |
| Population | ❌ | ❌ | ✅ |
| Lifecycle hooks | ❌ | ❌ | ✅ |
| Custom routes | ❌ | ✅ | ✅ |
| Response shape | ❌ | ❌ | ✅ |
| Rate limiting | ❌ | ❌ | ✅ |
| 3-layer config override | ❌ | ❌ | ✅ |
| OpenAPI docs | ❌ | ❌ | ✅ |
| TypeScript SDK | ❌ | ❌ | ✅ |
| Zero boilerplate | ⚠️ | ❌ | ✅ |

---

## Monorepo Structure

```
schemaroute-lib/
├── packages/
│   ├── core/           ← framework-agnostic core
│   ├── express/        ← Express adapter
│   ├── docs/           ← OpenAPI + Swagger UI
│   ├── sdk/            ← TypeScript client SDK
│   └── schemaroute/    ← umbrella package
├── apps/
│   └── test-api/       ← local test server (not published)
└── ARCHITECTURE.md
```

---

## Tooling

| Tool | Purpose |
|---|---|
| Turborepo | Monorepo build orchestration |
| tsup | ESM + CJS dual build |
| TypeScript strict | Type safety |
| Vitest | Unit tests (116 tests, 99% coverage) |
| pnpm | Package manager |

---

## Development

```bash
pnpm install
pnpm build    # build all packages
pnpm test     # run all tests
```

---

## License

MIT
