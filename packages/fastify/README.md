# @schemaroute/fastify

[![npm](https://img.shields.io/npm/v/@schemaroute/fastify)](https://www.npmjs.com/package/@schemaroute/fastify)

Fastify adapter for SchemaRoute. One function call registers a fully working CRUD API on your Fastify instance — with validation, filtering, pagination, search, population, hooks, soft delete, scope, and custom routes.

Full feature parity with `@schemaroute/express`. The only difference is the framework binding.

---

## Install

```bash
npm install @schemaroute/core @schemaroute/fastify
```

---

## How the DB connection works

SchemaRoute **does not connect to MongoDB**. You connect, then pass your mongoose instance to `createAPI`.

```js
// ✅ correct
mongoose.connect(process.env.MONGO_URI).then(() => {
  createAPI(app, ProductSchema, 'products', {}, mongoose)
  app.listen({ port: 3000 })
})

// ❌ wrong — throws: mongoose connection is "disconnected"
createAPI(app, ProductSchema, 'products', {}, mongoose)
mongoose.connect(process.env.MONGO_URI)
```

---

## Quick Start

```js
import Fastify  from 'fastify'
import mongoose from 'mongoose'
import { createAPI } from '@schemaroute/fastify'

const app = Fastify()

const ProductSchema = new mongoose.Schema({
  name:     { type: String,  required: true },
  price:    { type: Number,  required: true, min: 0 },
  stock:    { type: Number,  required: true, min: 0 },
  status:   { type: String,  enum: ['active', 'inactive'], default: 'active' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' },
})

mongoose.connect(process.env.MONGO_URI).then(() => {
  createAPI(app, ProductSchema, 'products', {}, mongoose)
  app.listen({ port: 3000 })
})
```

Generates:

```
GET    /products
GET    /products/:id
POST   /products
PUT    /products/:id
PATCH  /products/:id
DELETE /products/:id
```

---

## `createAPI(app, schema, resourceName, config?, mongoose?)`

| Param | Type | Description |
|---|---|---|
| `app` | `FastifyInstance` | Fastify instance |
| `schema` | `Schema` | Mongoose schema |
| `resourceName` | `string` | Plural resource name — used as the URL base path |
| `config` | `ResourceConfig` | Optional resource-level configuration |
| `mongoose` | `Mongoose` | Your mongoose instance — required when using Atlas or a custom connection |

Returns a `SchemaRouteInstance` — pass it to `@schemaroute/docs` or `@schemaroute/sdk`.

---

## Full Config Example

```js
createAPI(app, ProductSchema, 'products', {

  // resource-level defaults
  pagination:  'page',
  search:      'all-fields',
  populate:    [{ path: 'category', select: 'name slug' }],
  exclude:     ['__v'],
  expose:      ['name', 'price', 'stock', 'status', 'category'],  // whitelist — only these fields ever leave the API
  prefix:      '/v1',          // all routes registered under /v1/products
  maxBodySize: '100kb',        // reject POST/PUT/PATCH bodies over this size
  softDelete:  true,           // DELETE sets deletedAt/isDeleted instead of removing
  scope:       (req) => ({ tenantId: req.headers['x-tenant-id'] }),  // multitenancy
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
      beforeDelete: async (doc, ctx) => {
        await cleanupRelated(doc._id)
      },
    },
  },

  custom: [
    {
      method:  'GET',
      path:    '/products/featured',
      handler: async (req, reply) => {
        const items = await mongoose.model('Product').find({ featured: true })
        reply.send({ success: true, data: items })
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
| `middleware` | `MiddlewareFn[]` | `[]` | Middleware run before the handler |
| `validation` | `boolean` | `false` | Auto-validate request body against schema |
| `rateLimit` | `object \| array` | — | Built-in limiter or your own middleware |
| `populate` | `PopulateOption[]` | — | Ref fields to populate |
| `exclude` | `string[]` | — | Fields to strip from the response |
| `select` | `string[]` | — | Fields to include in the response |
| `transform` | `TransformFn` | — | Reshape each document before sending |
| `expose` | `string[]` | — | Resource-level whitelist — only these fields ever leave the API |
| `prefix` | `string` | — | URL prefix for all routes, e.g. `'/v1'` |
| `maxBodySize` | `string \| number` | — | Reject POST/PUT/PATCH bodies over this size |

---

## Hooks

All hooks receive `(data/doc, ctx)` where `ctx` contains `ctx.user`, `ctx.req`, `ctx.headers`, `ctx.query`, and `ctx.params`.

| Hook | Runs | Can modify data |
|---|---|---|
| `beforeCreate(data, ctx)` | before insert | ✅ return modified data |
| `afterCreate(doc, ctx)` | after insert | ❌ side effects only |
| `beforeUpdate(data, ctx)` | before update | ✅ return modified data |
| `afterUpdate(doc, ctx)` | after update | ❌ side effects only |
| `beforeDelete(doc, ctx)` | before delete | ❌ side effects only |
| `afterDelete(doc, ctx)` | after delete | ❌ side effects only |

---

## Querying

Every `GET /resource` endpoint supports:

| Param | Example | Description |
|---|---|---|
| Field filter | `?status=active` | Filter by any schema field |
| `sort` | `?sort=price&order=desc` | Sort by field |
| `fields` | `?fields=name,price` | Select specific fields — works on both `getAll` and `getOne` |
| `search` | `?search=laptop` | Full-text search across string fields |
| `page` | `?page=2&limit=10` | Page-based pagination |
| `cursor` | `?cursor=<id>&limit=10` | Cursor-based pagination |
| `populate` | `?populate=category` | Populate ref fields |

---

## Soft Delete

```js
createAPI(app, ProductSchema, 'products', {
  softDelete: true,  // or: { field: 'archivedAt', flagField: 'archived' }
}, mongoose)
```

`DELETE /:id` sets `deletedAt` + `isDeleted` instead of removing the document. All reads automatically exclude soft-deleted documents. Restore via `PATCH`: `{ isDeleted: false, deletedAt: null }`.

---

## Scope (Multitenancy)

```js
createAPI(app, PostSchema, 'posts', {
  scope: (req) => ({ tenantId: req.headers['x-tenant-id'] }),
}, mongoose)
```

The scope function result is merged into every query filter and every create/update body — restricts all operations to the current tenant without repeating the filter in every hook.

---

## Differences from `@schemaroute/express`

| Area | Notes |
|---|---|
| Request/response API | Uses Fastify's `reply.send()` instead of Express's `res.json()` |
| Middleware | Fastify uses `preHandler` hooks — pass standard Fastify middleware functions |
| Body parsing | Fastify parses JSON bodies automatically — no `app.use(express.json())` needed |
| Error handling | Uses Fastify's built-in error handling — no separate `registerErrorHandlers` call |
| `maxBodySize` | Enforced via Content-Length header check, same two-path guard as Express adapter |

---

## License

MIT
