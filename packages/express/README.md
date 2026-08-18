# @schemaroute/express

[![npm](https://img.shields.io/npm/v/@schemaroute/express)](https://www.npmjs.com/package/@schemaroute/express)

Express adapter for SchemaRoute. One function call registers a fully working CRUD API on your Express app — with validation, filtering, pagination, search, population, hooks, rate limiting, and custom routes.

---

## Install

```bash
npm install @schemaroute/core @schemaroute/express
```

---

## How the DB connection works

SchemaRoute **does not connect to MongoDB**. It never reads `MONGO_URI` or calls `mongoose.connect()`. That is entirely your responsibility.

What SchemaRoute does:
1. Takes the `mongoose` instance you pass in (5th argument)
2. Registers a Mongoose model on your **already-open** connection
3. At request time, runs queries on that connection

Two rules to follow:

**1. Always call `createAPI` after `mongoose.connect()` resolves**

```js
// ✅ correct
mongoose.connect(process.env.MONGO_URI).then(() => {
  createAPI(app, ProductSchema, 'products', {}, mongoose)
  app.listen(3000)
})

// ❌ wrong — throws: mongoose connection is "disconnected"
createAPI(app, ProductSchema, 'products', {}, mongoose)
mongoose.connect(process.env.MONGO_URI)
```

**2. Always pass your mongoose instance as the 5th argument**

```js
// ✅ correct — SchemaRoute uses your connected instance
createAPI(app, ProductSchema, 'products', {}, mongoose)

// ❌ wrong — SchemaRoute falls back to require('mongoose') which may
//            be a different instance with no active connection
createAPI(app, ProductSchema, 'products', {})
```

If you call `createAPI` before connecting, SchemaRoute throws a clear error:

```
[schemaroute] createAPI('products') was called while mongoose connection is "disconnected".
You must call createAPI inside the .then() callback of mongoose.connect(), after the connection is fully open.
```

---

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
PATCH  /products/:id
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

### Model naming

`createAPI` derives the Mongoose model name from the plural resource name using these rules:

- `categories` → `Category`
- `products` → `Product`
- `users` → `User`

This matches Mongoose's `ref` convention so cross-model `populate` works correctly.

### JSON error handling

`createAPI` automatically registers a JSON parse error handler on the Express app the first time it is called. Malformed request bodies return `400 { success: false, error: 'Invalid JSON body' }` instead of Express's default HTML error page. This handler is registered only once per app instance.

If you need explicit control over registration order, call `registerErrorHandlers` before any `createAPI` calls:

```js
import { registerErrorHandlers, createAPI } from '@schemaroute/express'

const app = express()
app.use(express.json())
registerErrorHandlers(app)  // explicit — registers before any routes

mongoose.connect(process.env.MONGO_URI).then(() => {
  createAPI(app, ProductSchema, 'products', {}, mongoose)
  app.listen(3000)
})
```

Safe to call multiple times — registers only once per app instance.

---

## Full Config Example

```js
createAPI(app, ProductSchema, 'products', {

  // resource-level defaults (apply to all routes unless overridden)
  pagination:  'page',
  search:      'all-fields',
  populate:    ['category'],
  exclude:     ['__v'],
  expose:      ['name', 'price', 'stock', 'status', 'category'],  // whitelist — only these fields ever leave the API
  prefix:      '/v1',          // all routes registered under /v1/products
  maxBodySize: '100kb',        // reject POST/PUT/PATCH bodies over this size
  transform:   (doc) => ({ id: doc._id, ...doc }),
  debug:       false,

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
| `sort` | `boolean` | `false` | Allow `?sort=field&order=asc\|desc` (getAll only) |
| `fields` | `boolean` | `false` | Allow `?fields=name,price` field selection (getAll only) |
| `populate` | `string[]` | — | Ref fields to populate |
| `exclude` | `string[]` | — | Fields to strip from the response |
| `select` | `string[]` | — | Fields to include in the response |
| `transform` | `TransformFn` | — | Reshape each document before sending |
| `expose` | `string[]` | — | Resource-level whitelist — only these fields ever leave the API (applied after transform) |
| `prefix` | `string` | — | URL prefix for all routes, e.g. `'/v1'` |
| `maxBodySize` | `string \| number` | — | Reject POST/PUT/PATCH bodies over this size, e.g. `'50kb'` |

---

## Hooks

All hooks receive `(data/doc, ctx)` where `ctx` is a `RequestContext` snapshot containing `req.headers`, `req.params`, `req.query`, and any user context set by auth middleware on `req.user`.

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

Hook execution order for `create`:
1. `beforeCreate` — runs **before** validation so computed fields are present when required-field checks run
2. Schema validation (when `validation: true`)
3. Persist to MongoDB
4. `afterCreate` — receives the saved document for side-effects

---

## Pagination

| Value | Query params | Description |
|---|---|---|
| `'page'` | `?page=1&limit=10` | Offset-based |
| `'cursor'` | `?cursor=<id>&limit=10` | Cursor-based (efficient for large datasets) |
| `'both'` | either | Cursor when `?cursor` present, page otherwise |
| `false` | — | Disabled — returns all matching documents |

Default limit: `10`. Maximum limit: `100` (clamped automatically).

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
// built-in sliding window (in-memory, single-process)
rateLimit: { max: 100, window: '1m' }
rateLimit: { max: 10,  window: '30s' }
rateLimit: { max: 5,   window: '1h' }

// bring your own middleware
rateLimit: [expressRateLimit({ windowMs: 60_000, max: 100 })]
```

> The built-in rate limiter is in-memory and per-process. For multi-instance or distributed deployments, use the array syntax to bring a Redis-backed solution (e.g. `rate-limiter-flexible`).

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
| Field filter | `?status=active&category=abc` | Filter by any schema field. Returns `400` if value is not a valid enum member |
| `sort` | `?sort=price&order=desc` | Sort by field. Returns `400` for unknown field names |
| `fields` | `?fields=name,price` | Select specific fields — works on both `getAll` and `getOne`. Returns `400` for unknown field names. Ref fields not listed are not populated |
| `search` | `?search=laptop` | Full-text search. Empty/whitespace values are ignored |
| `searchField` | `?searchField=name` | Restrict search to one field |
| `page` | `?page=2&limit=10` | Page-based pagination. Returns `400` if `page < 1` |
| `limit` | `?limit=10` | Page size. Returns `400` if non-numeric or non-positive. Clamped to max `100` |
| `cursor` | `?cursor=<id>&limit=10` | Cursor-based pagination |
| `populate` | `?populate=category` | Populate ref fields |

Field filter values are automatically coerced to their schema type — `?price=99` produces `{ price: 99 }` (number), not `{ price: '99' }` (string).

---

## Error Responses

| Status | Cause |
|---|---|
| `400` | Invalid MongoDB ObjectId format in URL param |
| `400` | Malformed JSON request body |
| `400` | Invalid query param — unknown sort field, unknown `?fields=` field, invalid enum filter value, `page < 1`, non-numeric/non-positive `limit` |
| `404` | Document not found |
| `422` | Validation failed — required field missing, type error, constraint violation, invalid ObjectId in body, ref points to non-existent document |
| `429` | Rate limit exceeded |
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

## Debug Logging

Pass `debug: true` in the resource config to enable diagnostic output from SchemaRoute. Logs model registration and handler errors to stdout. Silent by default — libraries should never log unconditionally.

```js
createAPI(app, ProductSchema, 'products', { debug: true }, mongoose)
```

---

## License

MIT
