# SchemaRoute — Architecture

## What is SchemaRoute?

A framework-agnostic npm library that automatically generates CRUD API routes from a Mongoose schema.
No boilerplate. No repetition. Just define your schema and get a fully working API.

---

## The Problem

Every Node.js developer repeats the same steps for every resource:

```
schema → model → controller → routes → validation → middleware → docs → SDK
```

SchemaRoute eliminates all of that.

---

## How It Works

```
Mongoose Schema
      │
      ▼
 @schemaroute/core        ← parses schema, builds route definitions
      │
      ▼
 Framework Adapter        ← translates route definitions to framework-specific routes
(@schemaroute/express, @schemaroute/fastify, etc.)
```

---

## Package Structure (Monorepo)

```
schemaroute-lib/
├── packages/
│   ├── common/           ← shared TypeScript types (zero runtime deps)
│   ├── core/             ← schema parser, route builder, validation logic (framework-agnostic)
│   ├── express/          ← express adapter
│   ├── docs/             ← OpenAPI 3.0 spec generator + Swagger UI
│   └── sdk/              ← TypeScript client SDK
├── package.json          ← turborepo root
├── turbo.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── ARCHITECTURE.md
```

### Package dependency graph

```
schemaroute (umbrella)
  ├── @schemaroute/common   ← types only, no deps
  ├── @schemaroute/core     ← depends on common
  ├── @schemaroute/express  ← depends on core
  ├── @schemaroute/docs     ← depends on common
  └── @schemaroute/sdk      ← depends on common
```

---

## Tooling Decisions

| Tool | Choice | Reason |
|---|---|---|
| Monorepo | Turborepo | Industry standard, fast caching |
| Build | tsup | Zero config, ESM + CJS dual build |
| Language | TypeScript strict | Type safe, IntelliSense support |
| Testing | Vitest | Fast, TS native |
| Package manager | pnpm | Fast, monorepo friendly |
| Registry | npm | Widest reach |
| CI/CD | GitHub Actions | Free, industry standard |
| Releases | Changesets | Monorepo friendly |

---

## Design Philosophy

**Never force one option — always let user choose per resource, per route.**

### 3-Layer Override System

```
Global config (defaults)
    ↓ can be overridden by
Resource config (per schema)
    ↓ can be overridden by
Route config (per route)       ← most specific, always wins
```

| Layer | Scope |
|---|---|
| Global defaults | applies to all resources across the whole app |
| Resource config | applies to all routes of this schema |
| Route config | applies to this specific route only |

---

## Installation

```bash
# only install what you need
npm install @schemaroute/core @schemaroute/express
```

---

## Complete API Design

### Basic Usage
```js
import { createAPI } from '@schemaroute/express'
import mongoose from 'mongoose'

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  age: Number
})

createAPI(app, UserSchema, 'users')
```

Generates:
- `GET    /users`
- `GET    /users/:id`
- `POST   /users`
- `PUT    /users/:id`
- `DELETE /users/:id`

---

### Full Config Example

```js
createAPI(app, UserSchema, 'users', {

  // --- resource-level defaults (can be overridden per route) ---
  pagination: 'page',
  search: 'all-fields',
  populate: ['role'],
  response: (data, meta) => ({ success: true, data, ...meta }),

  routes: {

    getAll: {
      enabled: true,
      public: true,
      pagination: 'cursor',              // override resource default
      search: 'single-field',            // override resource default
      searchField: 'name',
      sort: true,
      fields: true,                      // allow ?fields=name,email
      populate: ['role', 'department'],  // override resource default
      rateLimit: { max: 100, window: '1m' },
      middleware: [],
    },

    getOne: {
      enabled: true,
      public: true,
      populate: ['role'],
      middleware: [],
    },

    create: {
      enabled: true,
      public: false,
      middleware: [authMiddleware, roleMiddleware('admin')],
      validation: true,
      rateLimit: { max: 20, window: '1m' },
      beforeCreate: async (data) => {
        data.password = await hash(data.password)
        return data                       // modified data goes to DB
      },
      afterCreate: async (doc) => {
        await sendWelcomeEmail(doc.email)
      },
    },

    update: {
      enabled: true,
      public: false,
      middleware: [authMiddleware],
      validation: true,
      beforeUpdate: async (data) => {
        return data
      },
      afterUpdate: async (doc) => {},
    },

    delete: {
      enabled: true,
      public: false,
      middleware: [authMiddleware, roleMiddleware('superadmin')],
      beforeDelete: async (doc) => {},
      afterDelete: async (doc) => {},
    },

  },

  // --- custom routes outside CRUD ---
  custom: [
    {
      method: 'POST',
      path: '/users/login',
      handler: loginHandler,
      middleware: [rateLimitMiddleware],
      validation: true,
    },
    {
      method: 'GET',
      path: '/users/me',
      handler: getMeHandler,
      middleware: [authMiddleware],
    }
  ]

})
```

---

## Feature Breakdown

### CRUD Routes
| Route | Method | Path |
|---|---|---|
| getAll | GET | `/resource` |
| getOne | GET | `/resource/:id` |
| create | POST | `/resource` |
| update | PUT | `/resource/:id` |
| delete | DELETE | `/resource/:id` |

---

### Route Config Options

| Option | Type | Description |
|---|---|---|
| `enabled` | `boolean` | Whether this route is active |
| `public` | `boolean` | Skip all middleware/auth |
| `middleware` | `array` | Any middleware, user provides their own |
| `validation` | `boolean` | Auto-validate request body against schema |
| `rateLimit` | `object \| array` | `{ max, window }` or bring your own middleware |
| `transform` | `TransformFn` | Reshape each document before sending |
| `debug` | `boolean` | Enable diagnostic logging (resource config only) |

---

### Querying (getAll)

| Query Param | Example | Description |
|---|---|---|
| Filter | `?name=john&age=25` | Filter by any schema field |
| Sort | `?sort=createdAt&order=desc` | Sort by field |
| Fields | `?fields=name,email` | Select specific fields |
| Search | `?search=john` | Search across string fields |
| Search field | `?search=john&searchField=name` | Search in specific field |
| Page pagination | `?page=1&limit=10` | Page based pagination |
| Cursor pagination | `?cursor=xyz&limit=10` | Cursor based pagination |
| Populate | `?populate=author` | Populate mongoose refs |

---

### Pagination Options

| Value | Description |
|---|---|
| `'page'` | Page based — `?page=1&limit=10` |
| `'cursor'` | Cursor based — `?cursor=xyz&limit=10` |
| `'both'` | User can use either |
| `false` | Disabled |

---

### Search Options

| Value | Description |
|---|---|
| `'all-fields'` | Search across all string fields automatically |
| `'single-field'` | Search in field specified by `?searchField=` |
| `false` | Disabled |

---

### Hooks

Hooks run before or after DB operations. They can modify data.

| Hook | Runs | Can modify data |
|---|---|---|
| `beforeCreate(data)` | before insert | ✅ return modified data |
| `afterCreate(doc)` | after insert | ❌ side effects only |
| `beforeUpdate(data)` | before update | ✅ return modified data |
| `afterUpdate(doc)` | after update | ❌ side effects only |
| `beforeDelete(doc)` | before delete | ❌ side effects only |
| `afterDelete(doc)` | after delete | ❌ side effects only |

---

### Population

```js
// resource level
populate: ['author', 'category']

// route level override
getOne: {
  populate: ['author', 'category', 'comments']
}

// via query param (if enabled)
GET /posts?populate=author
```

---

### Response Shape

```js
// default envelope
{
  success: true,
  data: [...],
  meta: {
    page: 1,
    limit: 10,
    total: 100,
    totalPages: 10
  }
}

// customize per resource
response: (data, meta) => ({
  status: 'ok',
  result: data,
  ...meta
})
```

---

### Rate Limiting

```js
// built-in (object syntax)
rateLimit: { max: 100, window: '1m' }

// bring your own middleware (array syntax)
rateLimit: [myExpressRateLimitMiddleware]
```

---

### Custom Routes

```js
custom: [
  {
    method: 'POST',           // GET | POST | PUT | PATCH | DELETE
    path: '/users/login',     // full path
    handler: loginHandler,    // your own handler
    middleware: [],           // optional
    validation: true,         // optional
  }
]
```

---

### Validation

- Auto-generated from Mongoose schema — no extra config needed
- Validates `required`, `type`, `enum`, `min`, `max`, `minlength`, `maxlength`, `objectid` format
- Validates that ObjectId ref fields point to existing documents
- Returns structured error response on failure

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    { "field": "email", "message": "email is required" },
    { "field": "age", "message": "age must be a number" },
    { "field": "category", "message": "category must be a valid ObjectId" }
  ]
}
```

---

## V1 Scope

- [x] Schema parser
- [x] Route builder (framework agnostic)
- [x] 3-layer override system (global → resource → route)
- [x] Per-route config (enabled, public, middleware, validation)
- [x] Input validation from schema (required, type, min, max, minlength, maxlength, enum, objectid format)
- [x] Ref existence validation (422 for non-existent referenced documents)
- [x] Filtering, sorting, field selection
- [x] Query param validation (400 for invalid sort field, unknown fields, bad page/limit, invalid enum filter)
- [x] Pagination (page + cursor + both)
- [x] Search (all-fields + single-field, empty/whitespace ignored)
- [x] Population (mongoose refs, respects ?fields= projection)
- [x] Hooks (before/after per operation)
- [x] Custom routes
- [x] Response shape (default + customizable)
- [x] Document transform (per-resource + per-route)
- [x] Rate limiting (built-in + bring your own)
- [x] Standard error handling
- [x] JSON 404 catch-all handler
- [x] Express adapter
- [x] OpenAPI 3.0 spec generation (`@schemaroute/docs`)
- [x] Swagger UI mount (`/api-docs`)
- [x] TypeScript client SDK (`@schemaroute/sdk`)
- [x] Shared types package (`@schemaroute/common`)
- [x] Debug logging (opt-in, silent by default)

## V1.1 Planned

- [ ] `PATCH /:id` route for partial updates
- [ ] `?populate=` query param support on `getOne`
- [ ] Soft delete (`deletedAt` / `isDeleted` flag)
- [ ] Nested schema validation (recurse into embedded sub-documents)
- [ ] GitHub Actions CI/CD pipeline (test on PR, publish on tag)
- [ ] `CHANGELOG.md`
- [ ] Integration test suite covering real HTTP scenarios end-to-end
- [ ] `npm pkg fix` — normalise `repository.url` in all `package.json` files
- [ ] Role-based access control at route level (`roles: ['admin']`)
- [ ] `maxBodySize` option per route
- [ ] Populate field selection — specify which fields to return from a populated ref (e.g. `populate: [{ path: 'category', select: 'name slug' }]`)
- [ ] Built-in health endpoint option (`health: true` in `createAPI`)
- [ ] Transform output validation — warn when transform silently drops required fields

## V1.2 Planned

- [ ] `@schemaroute/fastify` adapter
- [ ] Distributed rate limiting support (Redis-backed, built-in option)
- [ ] Bulk operations — `POST /resource/bulk`, `DELETE /resource/bulk`
- [ ] `select` query param on `getOne` (field selection parity with `getAll`)
- [ ] SDK retry logic with configurable timeout and exponential backoff
- [ ] Request ID / tracing — `x-request-id` propagation through hooks and logs
- [ ] Response caching hooks (e.g. `afterGetAll`, `afterGetOne` for cache invalidation)
- [ ] Plugin system — allow third-party packages to extend SchemaRoute behaviour
- [ ] API versioning — `version` / `prefix` option in `createAPI` (e.g. `/v1/products`)
- [ ] TypeScript generics on SDK — pass schema type to get fully typed responses (`Product[]`)
- [ ] Connection circuit breaker — queue or retry requests when MongoDB reconnects
- [ ] Multitenancy / query scoping — `scope: (req) => ({ userId: req.user.id })` auto-applied to every query
- [ ] Global event system — `schemaroute.on('create', handler)` across all resources
- [ ] File upload support — `multipart/form-data` handling
- [ ] Response compression — built-in `gzip`/`brotli` option
- [ ] Documentation site — Docusaurus or VitePress with searchable, navigable docs

---

## Engineering Best Practices

### What's done well

- **Silent by default logging** — `logger.ts` gates all output behind `debug: true`. Libraries must never log unconditionally.
- **Lazy model resolution** — `resolveModel()` is called at request time, not at registration time, so the active connection is always used.
- **Single JSON error handler** — the malformed-body handler is registered once per app instance via a `WeakSet` guard, preventing duplicate middleware.
- **Type coercion in filters** — `?price=99` is coerced to `{ price: 99 }` (number) before the Mongoose query, preventing silent type mismatches.
- **Enum filter validation** — `?status=badvalue` returns `400` instead of silently returning an empty result set.
- **Query param validation** — invalid `?sort=`, `?fields=`, `?page=`, and `?limit=` values return `400` with a clear error message instead of being silently ignored or normalised.
- **ObjectId validation in body** — invalid ObjectId format in request body returns `422` instead of a Mongoose `CastError` 500.
- **Ref existence check** — ObjectId ref fields are verified against the DB before insert/update, returning `422` if the referenced document does not exist.
- **Field projection respects populate** — when `?fields=` is active, ref fields not listed are not populated, preventing data leaking through the projection.
- **Custom routes registered first** — prevents Express matching `/products/active` as `/products/:id`.
- **`beforeCreate` runs before validation** — allows hooks to inject computed fields (e.g. slug) before required-field checks run.
- **Cursor pagination fetches `limit + 1`** — determines `hasNextPage` without a separate count query.
- **JSON 404 handler** — unknown routes return `{ success: false, error: 'Route not found' }` instead of Express's default HTML page.
- **`@schemaroute/common` has zero runtime deps** — types-only package keeps the dependency graph clean.

### Known trade-offs and limitations

| Area | Trade-off |
|---|---|
| **Rate limiter** | Built-in is in-memory and single-process. For multi-instance or distributed deployments, use the `rateLimit: [middleware]` array syntax with a Redis-backed solution (e.g. `rate-limiter-flexible`). |
| **`MiddlewareFn` uses `any`** | Intentional — keeps `@schemaroute/common` framework-agnostic without importing Express types. Adapters cast to `RequestHandler` at the boundary. |
| **Mongoose fallback** | If `mongoose` is not passed as the 5th argument, `createAPI` falls back to `require('mongoose')`. This may be a different instance than the one you connected with. Always pass your instance explicitly. |
| **Update validation** | `validation: true` on `update` runs the full schema validation (all required fields). For partial updates where only some fields are sent, consider using `beforeUpdate` to fill defaults or disable validation and rely on Mongoose's `runValidators`. |
| **`object` FieldType** | Embedded sub-documents are parsed as `'object'` type. The validator does not recurse into nested schemas — only top-level fields are validated. |
| **No PATCH route** | Only `PUT /:id` (full replace) is supported. There is no `PATCH /:id` for partial updates. Planned for v1.1. |
| **`?populate=` on getOne** | `getOne` only supports config-level populate, not `?populate=` as a query param. `getAll` supports both. Planned for v1.1. |
| **No soft delete** | Delete is hard — no `deletedAt` / `isDeleted` flag option. Planned for v1.1. |
| **No CI/CD pipeline** | No GitHub Actions workflow exists yet. Tests and publish are run manually. Planned for v1.1. |
| **No CHANGELOG** | No `CHANGELOG.md` exists. Consumers cannot tell what changed between versions without reading raw commits. Planned for v1.1. |
| **Integration test gap** | Unit tests cover individual modules at 99% but do not cover real HTTP request/response scenarios end-to-end. The `test-api` integration tests require a live MongoDB Atlas connection and are not run in CI. Planned for v1.1. |
| **Single adapter** | Only Express is supported. Fastify, Koa, Hono, and other frameworks require a custom adapter. `@schemaroute/fastify` planned for v1.2. |
| **`repository.url` warning on publish** | All `package.json` files have a non-normalised `repository.url` that npm auto-corrects on every publish. Minor but noisy. Fix planned for v1.1. |
| **No built-in auth/roles** | Auth is entirely user-supplied via middleware. There is no `roles` or `permissions` option at the route level (e.g. `create: { roles: ['admin'] }`). Users must write and wire their own auth middleware for every resource. Planned for v1.1. |
| **No request body size limit** | SchemaRoute does not enforce or document a `maxBodySize` per route. A malicious client can send a large payload and the server will attempt to parse it. Users must configure `express.json({ limit })` themselves. Planned for v1.1. |
| **Transform silently drops fields** | If a user-defined `transform` function omits fields like `createdAt`, they silently disappear from the response with no warning. No fallback or validation of transform output. Planned for v1.1. |
| **SDK has no retry or timeout** | The SDK throws immediately on network failure. There is no retry logic, no configurable timeout, and no exponential backoff. Planned for v1.2. |
| **No request ID / tracing** | There is no `x-request-id` propagation or built-in request correlation. Failed requests cannot be traced through logs back to a specific API call. Planned for v1.2. |
| **Populate leaks full sub-document** | When populating a ref, the entire referenced document is returned — all fields including potentially sensitive ones (e.g. `password`). There is no way to specify which fields to return from a populated ref at the config level. Planned for v1.1. |
| **No built-in health endpoint** | There is no `health: true` option in `createAPI`. Every user must manually add `GET /health` to their app. Planned for v1.1. |
| **No API versioning** | There is no `version` or `prefix` option in `createAPI`. When a schema changes, all consumers break immediately. No `/v1/` prefix support. Planned for v1.2. |
| **No TypeScript generics on SDK** | `api.products.getAll()` returns `unknown` typed data. There is no way to pass a schema type to the SDK and get back a typed response (e.g. `Product[]`). Type safety is lost entirely on the client side. Planned for v1.2. |
| **No connection circuit breaker** | SchemaRoute returns 503 when MongoDB disconnects but does not queue or retry requests when the connection recovers. No circuit breaker pattern at the handler level. Planned for v1.2. |
| **No multitenancy / query scoping** | There is no `scope` option to auto-apply per-request filters to every query (e.g. `scope: (req) => ({ userId: req.user.id })`). Users must manually add filters in every `beforeCreate`/`beforeUpdate` hook for every resource. Planned for v1.2. |
| **No global event system** | There is no way to subscribe to events across all resources globally (e.g. `schemaroute.on('create', auditLog)`). Hooks must be added individually to every resource. Planned for v1.2. |
| **No file upload support** | `multipart/form-data` is completely unsupported. Resources that need file uploads must bypass SchemaRoute entirely with a custom route. Planned for v1.2. |
| **No response compression** | No built-in `gzip`/`brotli` option. For large list responses this matters in production. Users must add `compression` middleware themselves. Planned for v1.2. |
| **No documentation site** | There is no dedicated docs website (e.g. Docusaurus or VitePress). Only a README and ARCHITECTURE.md exist. Searchable, navigable docs are critical for library adoption. Planned for v1.2. |

### Future adapter guidance

When building a new framework adapter (e.g. `@schemaroute/fastify`):
1. Import `createSchemaRoute` from `@schemaroute/core` — do not duplicate schema parsing
2. Register custom routes **before** `/:id` routes
3. Call `resolveModel()` lazily at request time
4. Use `buildRequestContext` pattern to keep hooks framework-agnostic
5. Register the JSON parse error handler once per app instance

---

## Comparison

| Feature | cruddy-cat | nestjsx/crud | SchemaRoute |
|---|---|---|---|
| Auto CRUD routes | ✅ | ✅ | ✅ |
| Framework agnostic | ❌ | ❌ (NestJS only) | ✅ |
| Per-route middleware | ❌ | ✅ | ✅ |
| Input validation | ❌ | ✅ | ✅ |
| Filtering + Sorting | ❌ | ✅ | ✅ |
| Pagination | ❌ | ✅ | ✅ |
| Search | ❌ | ❌ | ✅ |
| Population | ❌ | ❌ | ✅ |
| Hooks | ❌ | ❌ | ✅ |
| Custom routes | ❌ | ✅ | ✅ |
| Response shape | ❌ | ❌ | ✅ |
| Rate limiting | ❌ | ❌ | ✅ |
| 3-layer config override | ❌ | ❌ | ✅ |
| OpenAPI docs | ❌ | ❌ | ✅ |
| TypeScript SDK | ❌ | ❌ | ✅ |
| Zero boilerplate | ⚠️ | ❌ | ✅ |
