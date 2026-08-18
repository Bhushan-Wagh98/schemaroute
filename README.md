# SchemaRoute

[![npm](https://img.shields.io/npm/v/schemaroute)](https://www.npmjs.com/package/schemaroute)
[![license](https://img.shields.io/npm/l/schemaroute)](./LICENSE)
[![tests](https://img.shields.io/badge/tests-306%20passing-brightgreen)](#testing)
[![coverage](https://img.shields.io/badge/coverage-99%25-brightgreen)](#testing)

Auto-generate a fully working CRUD API from a Mongoose schema. No boilerplate. No repetition.

```js
createAPI(app, UserSchema, 'users', {}, mongoose)

// GET    /users
// GET    /users/:id
// POST   /users
// PUT    /users/:id
// PATCH  /users/:id
// DELETE /users/:id
```

---

## What is actually exposed?

This is the first question any developer should ask before installing a library that touches their database. Here are the defaults and the controls:

**By default, all schema fields are returned.** Use `expose` to whitelist exactly which fields leave the API — this is the final gate, applied after transform and populate, so nothing leaks regardless of what other pipeline stages return:

```js
createAPI(app, UserSchema, 'users', {
  expose: ['name', 'email', 'role'],  // password, tokens, internal flags — never sent
}, mongoose)
```

**By default, all routes are open.** Add middleware for auth:

```js
routes: {
  create: { middleware: [requireAuth] },
  update: { middleware: [requireAuth] },
  delete: { middleware: [requireAuth, requireAdmin] },
}
```

**By default, any schema field can be filtered.** Enum fields are validated — `?status=badvalue` returns `400`. Non-schema fields are ignored. Type coercion is automatic — `?price=99` produces `{ price: 99 }` (number), not a string.

**Population is controlled server-side.** A client sending `?populate=category` only works if the field is a Mongoose ref. You can restrict which fields come back from the populated document:

```js
populate: [{ path: 'category', select: 'name slug' }]  // password never leaks through populate
```

**Multitenancy via scope.** Every query, create, update, patch, and delete is automatically scoped — cross-tenant reads return `404`, not `403`, so other tenants' existence is not revealed:

```js
scope: (req) => ({ tenantId: req.headers['x-tenant-id'] })
```

**To see exactly what SchemaRoute is doing**, enable debug logging:

```js
createAPI(app, ProductSchema, 'products', { debug: true }, mongoose)
```

**To escape the abstraction entirely**, use custom routes or plain controllers alongside SchemaRoute — they coexist on the same Express app. SchemaRoute is for CRUD-heavy resources. Complex domain logic belongs in your own handlers.

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

## How the DB connection works

SchemaRoute does not connect to MongoDB. You connect, then pass your mongoose instance to `createAPI`. This ensures SchemaRoute uses the same connection you opened — important when using Atlas or a custom connection string.

```js
// ✅ correct — createAPI called after connect resolves, mongoose instance passed
mongoose.connect(process.env.MONGO_URI).then(() => {
  createAPI(app, ProductSchema, 'products', {}, mongoose)
  app.listen(3000)
})

// ❌ wrong — throws a clear error before any routes are registered
createAPI(app, ProductSchema, 'products', {}, mongoose)
mongoose.connect(process.env.MONGO_URI)  // too late
```

If you call `createAPI` before connecting, you get an immediate error — not a silent failure:

```
[schemaroute] createAPI('products') was called while mongoose connection is "disconnected".
You must call createAPI inside the .then() callback of mongoose.connect().
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
- ✅ Population of refs with optional field selection
- ✅ Partial updates via PATCH
- ✅ Soft delete with automatic read exclusion
- ✅ Multitenancy via scope
- ✅ Standard error responses
- ✅ Expose field whitelist — DB-only fields never leak
- ✅ API versioning via prefix
- ✅ Body size limiting per resource
- ✅ Full request context in hooks (`ctx.req`, `ctx.user`, `ctx.headers`)

---

## The Problem

Every Node.js developer repeats the same steps for every resource:

```
schema → model → controller → routes → validation → middleware → docs → SDK
```

SchemaRoute eliminates all of that. And unlike AI-generated boilerplate, it stays consistent across every resource, stays maintained as a dependency, and gives you filtering, pagination, search, population, soft delete, and OpenAPI docs without writing or maintaining any of it.

---

## SchemaRoute does not own your API

SchemaRoute owns only the CRUD routes you give it. Everything else on the same app is yours:

```js
// SchemaRoute handles these
createAPI(app, ProductSchema, 'products', {}, mongoose)
createAPI(app, CategorySchema, 'categories', {}, mongoose)

// Your own handlers coexist on the same app — no conflict
app.post('/products/:id/publish', requireAuth, publishProduct)
app.get('/reports/summary', requireAdmin, generateReport)
```

Start with the CRUD-heavy resources. Keep complex domain logic in your own handlers. Add more resources to SchemaRoute over time as confidence grows:

```
/users       → your existing controller  (complex auth — keep it)
/orders      → your existing controller  (payment logic — keep it)
/products    → SchemaRoute
/categories  → SchemaRoute
/reviews     → SchemaRoute               (new resource — zero boilerplate)
```

---

## SchemaRoute has opinions. Here's every one of them.

Adopting SchemaRoute means adopting a set of API behaviors. They are all configurable or escapable — nothing is imposed silently.

| Behavior | Default | How to change it |
|---|---|---|
| Response envelope | `{ success, data, meta }` | `response: (data, meta) => ({ ... })` — any shape you want |
| Validation | off | `routes.create: { validation: true }` — opt in per route |
| All routes active | GET, POST, PUT, PATCH, DELETE all registered | `routes.delete: { enabled: false }` — disable any route |
| All routes open | no auth | `routes.create: { middleware: [requireAuth] }` — your middleware |
| All fields returned | full document | `expose: ['name', 'price']` — whitelist what leaves the API |
| Any field filterable | `?status=active` works on all schema fields | non-schema fields are ignored; enum values are validated |
| Pagination | off | `pagination: 'page'` or `'cursor'` or `'both'` |
| Search | off | `search: 'all-fields'` or `'single-field'` |
| Population | off | `populate: [{ path: 'category', select: 'name' }]` |
| Sort | off | `routes.getAll: { sort: true }` |
| Soft delete | hard delete | `softDelete: true` — sets `deletedAt`/`isDeleted` instead |
| Scope | none | `scope: (req) => ({ tenantId: req.headers['x-tenant-id'] })` |
| Error shape | `{ success: false, error, details }` | consistent across all routes — not currently overridable |
| PATCH semantics | `$set` — only sent fields written | not configurable — use PUT for full replacement |
| ObjectId validation | invalid IDs return `400` | not configurable — always on |
| Enum filter validation | invalid enum values return `400` | not configurable — always on |
| Type coercion in filters | `?price=99` → `{ price: 99 }` (number) | not configurable — always on |
| Body size limit | Express default | `maxBodySize: '50kb'` — per resource |
| Rate limiting | none | `rateLimit: { max: 100, window: '1m' }` or bring your own |
| Debug logging | silent | `debug: true` — logs model registration and handler activity |

The items marked "not configurable" are intentional constraints, not oversights. If any of them conflict with your requirements, use a custom route or a plain controller for that resource instead — SchemaRoute and your own handlers coexist on the same app without conflict.

---

## Features

### Querying out of the box

Every `GET /resource` endpoint supports:

| Query Param | Example | Description |
|---|---|---|
| Field filter | `?status=active&category=abc` | Filter by any schema field. Returns `400` if value is not a valid enum member |
| Sort | `?sort=price&order=desc` | Sort by any field. Returns `400` for unknown field names |
| Fields | `?fields=name,price,stock` | Select specific fields on `getAll` and `getOne`. Returns `400` for unknown field names. Ref fields not listed are not populated |
| Search | `?search=laptop` | Search across all string fields. Empty/whitespace values are ignored |
| Search field | `?search=laptop&searchField=name` | Search in a specific field |
| Page pagination | `?page=2&limit=10` | Offset-based. Returns `400` if `page < 1` or `limit` is non-numeric/non-positive |
| Cursor pagination | `?cursor=<id>&limit=10` | Cursor-based pagination |
| Populate | `?populate=category` | Populate Mongoose refs on `getAll` and `getOne` |

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

All options are optional. Start with zero config and add only what you need.

```js
createAPI(app, ProductSchema, 'products', {

  // resource-level defaults
  pagination:  'page',
  search:      'all-fields',
  populate:    [{ path: 'category', select: 'name slug' }],  // restrict populated fields
  exclude:     ['__v'],
  expose:      ['name', 'price', 'status', 'category'],      // whitelist — only these fields ever leave the API
  prefix:      '/v1',                                        // all routes registered under /v1/products
  maxBodySize: '100kb',                                      // reject POST/PUT/PATCH bodies over this size
  softDelete:  true,                                         // soft delete instead of hard delete
  scope:       (req) => ({ tenantId: req.headers['x-tenant-id'] }),  // multitenancy
  transform:   (doc) => ({ id: doc._id, ...doc }),           // reshape every response doc
  debug:       false,                                        // set true to enable diagnostic logging

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
        // ctx.req is the raw framework request — access ip, socket, custom props
        console.log('created from ip:', ctx.req.ip)
        return data
      },
      afterCreate: async (doc) => {
        await notifySubscribers(doc)
      },
    },
    update: {
      validation: true,  // PUT — all required fields must be present
      middleware: [requireAuth],
    },
    patch: {
      // PATCH — only sent fields are written, absent fields stay unchanged
      // validation: true only validates fields present in the body
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
    {
      // HEAD — returns headers only, no body
      // useful for existence checks without transferring data
      method:  'HEAD',
      path:    '/products/:id/exists',
      handler: async (req, res) => {
        const exists = await Product.exists({ _id: req.params.id })
        res.status(exists ? 200 : 404).end()
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

const productsInstance   = createAPI(app, ProductSchema,  'products',  {}, mongoose)
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
const updated        = await api.products.update('abc123', { price: 899 })   // PUT — full replace
const patched        = await api.products.patch('abc123', { price: 799 })    // PATCH — partial update
await api.products.delete('abc123')
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
| Vitest | Unit tests (306 tests, 99% coverage) |
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
