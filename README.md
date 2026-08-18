# SchemaRoute

[![npm](https://img.shields.io/npm/v/schemaroute)](https://www.npmjs.com/package/schemaroute)
[![license](https://img.shields.io/npm/l/schemaroute)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-486%20passing-brightgreen)](#testing)
[![coverage](https://img.shields.io/badge/coverage-99%25-brightgreen)](#testing)

**Automatic REST APIs for Mongoose resources. No controllers. No route files. No boilerplate.**

```js
createAPI(app, ProductSchema, 'products', {}, mongoose)

// GET    /products          — list, filter, sort, search, paginate, populate
// GET    /products/:id      — single document, field selection, populate
// POST   /products          — create with validation and lifecycle hooks
// PUT    /products/:id      — full replacement
// PATCH  /products/:id      — partial update via $set
// DELETE /products/:id      — hard or soft delete
```

One line. A fully working REST API — filtering, sorting, pagination, search, validation, population, error handling — all from your Mongoose schema.

> **SchemaRoute does not decide who can access your data. Your middleware does.**

```js
routes: {
  create: { middleware: [requireAuth] },
  delete: { middleware: [requireAuth, requireAdmin] },
}

---

## The real value

For a typical app with 10 resources, you're looking at:

```
Without SchemaRoute

10 controllers      × ~80 lines  =  800 lines
10 route files      × ~30 lines  =  300 lines
10 validators       × ~20 lines  =  200 lines
10 query parsers    × ~40 lines  =  400 lines
10 swagger files    × ~50 lines  =  500 lines
                                  ─────────────
                                   2,200 lines to write, test, and maintain

With SchemaRoute

10 × createAPI()                 =  10 lines
```

And when you add an 11th resource, it's one more line — not another 220.

Unlike AI-generated boilerplate, SchemaRoute stays consistent across every resource, stays maintained as a dependency, and gives you filtering, pagination, search, population, soft delete, and OpenAPI docs without writing or maintaining any of it.

---

## SchemaRoute does not decide who can access your data

This is the first question any developer should ask before installing a library that touches their database.

**SchemaRoute automates mechanics, not ownership.**

Your middleware controls access. SchemaRoute never bypasses it:

```js
createAPI(app, ProductSchema, 'products', {
  routes: {
    create: { middleware: [requireAuth] },
    update: { middleware: [requireAuth] },
    delete: { middleware: [requireAuth, requireAdmin] },
  },
}, mongoose)
```

**Your `expose` whitelist controls what leaves the API.** Sensitive fields never leak:

```js
createAPI(app, UserSchema, 'users', {
  expose:   ['name', 'email', 'role'],     // password, tokens — never sent
  writable: ['name', 'email', 'tenantId'], // role, createdBy — never writable by clients
}, mongoose)
```

**Population is controlled server-side.** A client sending `?populate=category` only works if the field is a Mongoose ref. You restrict which fields come back:

```js
populate: [{ path: 'category', select: 'name slug' }]  // password never leaks through populate
```

**Multitenancy via scope.** Every query, create, update, patch, and delete is automatically scoped — cross-tenant reads return `404`, not `403`:

```js
scope: (req) => ({ tenantId: req.headers['x-tenant-id'] })
```

**To see exactly what SchemaRoute registered**, use `inspectAPI`:

```
GET    /products           public
POST   /products           middleware: [requireAuth]
PUT    /products/:id       middleware: [requireAuth]
PATCH  /products/:id       middleware: [requireAuth]
DELETE /products/:id       middleware: [requireAuth, requireAdmin]

Exposed:  name, price, status, category
Writable: name, price, status, category
```

No magic. Everything is explicit and inspectable.

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

That's it. You now have a fully working REST API with filtering, sorting, pagination, search, validation, population, and error handling — all from your schema.

---

## Capabilities — add only what you need

SchemaRoute is layered. Start with zero config and add only what your resource needs.

### Level 1 — CRUD from your schema

```js
createAPI(app, ProductSchema, 'products', {}, mongoose)
```

Gives you GET, POST, PUT, PATCH, DELETE with ObjectId validation, enum filter validation, type coercion, and standard error responses.

### Level 2 — Control access, fields, and queries

```js
createAPI(app, ProductSchema, 'products', {
  expose:      ['name', 'price', 'status'],   // read whitelist
  writable:    ['name', 'price', 'stock'],     // write whitelist
  pagination:  'page',
  search:      'all-fields',
  populate:    [{ path: 'category', select: 'name slug' }],
  scope:       (req) => ({ tenantId: req.headers['x-tenant-id'] }),
  routes: {
    create: { middleware: [requireAuth], validation: true },
    delete: { middleware: [requireAuth, requireAdmin] },
  },
}, mongoose)
```

### Level 3 — OpenAPI docs and typed SDK

```js
import { generateOpenAPISpec, mountSwaggerUI } from '@schemaroute/docs'
import { createSDK } from '@schemaroute/sdk'

const spec = generateOpenAPISpec([productsInstance, categoriesInstance], {
  title: 'My API', version: '1.0.0', serverUrl: 'http://localhost:3000',
})
mountSwaggerUI(app, spec)
// → Swagger UI at http://localhost:3000/api-docs

const api = createSDK('http://localhost:3000', [productsInstance, categoriesInstance])
const { data } = await api.products.getAll({ page: 1, limit: 10 })
```

---

## SchemaRoute does not own your API

SchemaRoute owns only the CRUD routes you give it. Everything else on the same app is yours:

```js
// SchemaRoute handles these
createAPI(app, ProductSchema, 'products', {}, mongoose)
createAPI(app, CategorySchema, 'categories', {}, mongoose)

// Your own handlers coexist — no conflict
app.post('/products/:id/publish', requireAuth, publishProduct)
app.get('/reports/summary', requireAdmin, generateReport)
```

**You do not need to migrate your existing application.** Add SchemaRoute to new resources only. Keep complex domain logic in your own handlers:

```
Existing application
  │
  ├── /users    → your controller  (complex auth — keep it)
  ├── /orders   → your controller  (payment logic — keep it)
  │
  ├── /products    → SchemaRoute   (new or migrated)
  ├── /categories  → SchemaRoute   (new or migrated)
  └── /reviews     → SchemaRoute   (new resource — zero boilerplate)
```

The adoption risk is low because SchemaRoute never touches routes you don't give it.

---

## How the DB connection works

SchemaRoute does not connect to MongoDB. You connect, then pass your mongoose instance:

```js
// ✅ correct
mongoose.connect(process.env.MONGO_URI).then(() => {
  createAPI(app, ProductSchema, 'products', {}, mongoose)
  app.listen(3000)
})

// ❌ wrong — throws immediately before any routes are registered
createAPI(app, ProductSchema, 'products', {}, mongoose)
mongoose.connect(process.env.MONGO_URI)
```

You can also pass a Mongoose Model directly — schema and connection are extracted automatically:

```js
const Product = mongoose.model('Product', ProductSchema)
createAPI(app, Product, 'products', {})  // no mongoose 5th arg needed
```

---

## Querying out of the box

Every `GET /resource` endpoint supports:

| Query Param | Example | Description |
|---|---|---|
| Field filter | `?status=active&category=abc` | Filter by any schema field. Returns `400` for invalid enum values |
| Sort | `?sort=price&order=desc` | Sort by any field. Returns `400` for unknown fields |
| Fields | `?fields=name,price,stock` | Select specific fields on `getAll` and `getOne` |
| Search | `?search=laptop` | Search across all string fields |
| Search field | `?search=laptop&searchField=name` | Search in a specific field |
| Page pagination | `?page=2&limit=10` | Offset-based |
| Cursor pagination | `?cursor=<id>&limit=10` | Cursor-based |
| Populate | `?populate=category` | Populate Mongoose refs |

---

## Full Config Example

```js
createAPI(app, ProductSchema, 'products', {

  pagination:  'page',
  search:      'all-fields',
  populate:    [{ path: 'category', select: 'name slug' }],
  exclude:     ['__v'],
  expose:      ['name', 'price', 'status', 'category'],
  writable:    ['name', 'price', 'stock', 'status', 'category'],
  prefix:      '/v1',
  maxBodySize: '100kb',
  softDelete:  true,
  scope:       (req) => ({ tenantId: req.headers['x-tenant-id'] }),
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
      populate: [{ path: 'category', select: 'name slug' }],
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
    update: { validation: true, middleware: [requireAuth] },
    patch:  { middleware: [requireAuth] },
    delete: {
      middleware: [requireAuth, requireAdmin],
      beforeDelete: async (doc) => { await cleanupRelated(doc._id) },
    },
    restore: { enabled: true, middleware: [requireAuth] },
    purge:   { enabled: true, middleware: [requireAuth, requireAdmin] },
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

## SchemaRoute has opinions. Here's every one of them.

Adopting SchemaRoute means adopting a set of API behaviors. They are all configurable or escapable — nothing is imposed silently.

| Behavior | Default | How to change it |
|---|---|---|
| Response envelope | `{ success, data, meta }` | `response: (data, meta) => ({ ... })` |
| Validation | off | `routes.create: { validation: true }` — opt in per route |
| All routes active | GET, POST, PUT, PATCH, DELETE | `routes.delete: { enabled: false }` |
| All routes open | no auth | `routes.create: { middleware: [requireAuth] }` |
| All fields returned | full document | `expose: ['name', 'price']` |
| Any field filterable | all schema fields | non-schema fields ignored; enum values validated |
| Pagination | off | `pagination: 'page' \| 'cursor' \| 'both'` |
| Search | off | `search: 'all-fields' \| 'single-field'` |
| Population | off | `populate: [{ path: 'category', select: 'name' }]` |
| Sort | off | `routes.getAll: { sort: true }` |
| Soft delete | hard delete | `softDelete: true` |
| Scope | none | `scope: (req) => ({ tenantId: ... })` |
| Error shape | `{ success: false, error, details }` | consistent across all routes — not overridable |
| PATCH semantics | `$set` — only sent fields written | not configurable — use PUT for full replacement |
| ObjectId validation | invalid IDs return `400` | not configurable — always on |
| Enum filter validation | invalid enum values return `400` | not configurable — always on |
| Type coercion in filters | `?price=99` → number | not configurable — always on |
| Body size limit | Express default | `maxBodySize: '50kb'` |
| Rate limiting | none | `rateLimit: { max: 100, window: '1m' }` |
| Debug logging | silent | `debug: true` |

The items marked "not configurable" are intentional constraints. If any conflict with your requirements, use a custom route or a plain controller for that resource — SchemaRoute and your own handlers coexist without conflict.

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

## Packages

| Package | Version | Description |
|---|---|---|
| [`schemaroute`](https://www.npmjs.com/package/schemaroute) | [![npm](https://img.shields.io/npm/v/schemaroute)](https://www.npmjs.com/package/schemaroute) | Umbrella — installs everything |
| [`@schemaroute/core`](./packages/core) | [![npm](https://img.shields.io/npm/v/@schemaroute/core)](https://www.npmjs.com/package/@schemaroute/core) | Framework-agnostic core |
| [`@schemaroute/express`](./packages/express) | [![npm](https://img.shields.io/npm/v/@schemaroute/express)](https://www.npmjs.com/package/@schemaroute/express) | Express adapter |
| [`@schemaroute/fastify`](./packages/fastify) | [![npm](https://img.shields.io/npm/v/@schemaroute/fastify)](https://www.npmjs.com/package/@schemaroute/fastify) | Fastify adapter |
| [`@schemaroute/docs`](./packages/docs) | [![npm](https://img.shields.io/npm/v/@schemaroute/docs)](https://www.npmjs.com/package/@schemaroute/docs) | OpenAPI 3.0 + Swagger UI |
| [`@schemaroute/sdk`](./packages/sdk) | [![npm](https://img.shields.io/npm/v/@schemaroute/sdk)](https://www.npmjs.com/package/@schemaroute/sdk) | TypeScript client SDK |
| [`@schemaroute/common`](./packages/common) | [![npm](https://img.shields.io/npm/v/@schemaroute/common)](https://www.npmjs.com/package/@schemaroute/common) | Shared types — zero runtime deps |

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
| Populate field selection | ❌ | ❌ | ✅ |
| Partial updates (PATCH) | ❌ | ❌ | ✅ |
| Soft delete | ❌ | ❌ | ✅ |
| Multitenancy / scope | ❌ | ❌ | ✅ |
| Lifecycle hooks + full ctx | ❌ | ❌ | ✅ |
| Custom routes | ❌ | ✅ | ✅ |
| Response shape | ❌ | ❌ | ✅ |
| Rate limiting | ❌ | ❌ | ✅ |
| 3-layer config override | ❌ | ❌ | ✅ |
| OpenAPI docs | ❌ | ❌ | ✅ |
| TypeScript SDK | ❌ | ❌ | ✅ |
| Expose field whitelist | ❌ | ❌ | ✅ |
| Write field whitelist (`writable`) | ❌ | ❌ | ✅ |
| API versioning (prefix) | ❌ | ❌ | ✅ |
| Body size limiting | ❌ | ❌ | ✅ |
| Zero boilerplate | ⚠️ | ❌ | ✅ |
| Debug logging | ❌ | ❌ | ✅ |

---

## Monorepo Structure

```
schemaroute-lib/
├── packages/
│   ├── core/           ← framework-agnostic core
│   ├── express/        ← Express adapter
│   ├── fastify/        ← Fastify adapter
│   ├── docs/           ← OpenAPI + Swagger UI
│   ├── sdk/            ← TypeScript client SDK
│   ├── common/         ← shared types (zero runtime deps)
│   └── schemaroute/    ← umbrella package
├── apps/
│   ├── test-api/           ← Express integration test app (not published)
│   └── test-api fastify/   ← Fastify integration test app (not published)
└── ARCHITECTURE.md
```

---

## Testing

```bash
pnpm test   # runs all 486 tests across all packages
```

| Suite | Count | What it covers |
|---|---|---|
| Unit tests (`packages/*/src/__tests__/`) | 371 | Schema parser, validator, query handler, route builder, soft delete, expose, writable, inspect, pagination, search, sort, filter, projection, populate, OpenAPI spec generator |
| Integration tests (`apps/test-api/src/__tests__/`) | 115 | Full HTTP request/response cycle against a real Express app and real MongoDB (in-process, no external connection required) |

Integration tests use `mongodb-memory-server` — no Atlas account or connection string needed. `pnpm test` runs everything.

See [`apps/test-api`](./apps/test-api) for the full list of what the integration tests cover.

---

## Tooling

| Tool | Purpose |
|---|---|
| Turborepo | Monorepo build orchestration |
| tsup | ESM + CJS dual build |
| TypeScript strict | Type safety |
| Vitest | Unit + integration tests (486 tests, 99% coverage) |
| mongodb-memory-server | In-process MongoDB for integration tests — no external connection needed |
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
