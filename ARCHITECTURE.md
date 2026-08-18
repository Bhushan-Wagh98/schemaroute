# SchemaRoute — Architecture

## What is SchemaRoute?

A framework-agnostic abstraction layer between a Mongoose schema and an HTTP resource. SchemaRoute parses your schema into a normalised intermediate representation (`SchemaRouteInstance`) and uses it to drive route registration, request validation, query resolution, OpenAPI spec generation, and a typed SDK — all from the same source of truth.

The result: define your schema once, get a fully working API with no boilerplate, and retain full control over auth, response shape, hooks, and escape hatches.

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
Mongoose Schema  (or Mongoose Model)
      │
      ▼
 @schemaroute/core        ← parses schema, builds normalised SchemaRouteInstance
      │                      (routes, parsedSchema, resourceName, config)
      ├──────────────────────────────────────────┐
      ▼                                          ▼
 Framework Adapter                         @schemaroute/docs
 (@schemaroute/express,                    @schemaroute/sdk
  @schemaroute/fastify, etc.)              (consume the same instance)
      │
      ▼
 HTTP routes registered on the framework
```

The `SchemaRouteInstance` is the central object. Adapters, docs, and the SDK all consume it — meaning the route definitions, OpenAPI spec, and typed SDK client are always in sync with the same config.

---

## Package Structure (Monorepo)

```
schemaroute-lib/
├── packages/
│   ├── common/           ← shared TypeScript types (zero runtime deps)
│   ├── core/             ← schema parser, route builder, validation, adapter utilities
│   │   └── src/
│   │       ├── parsing/          ← schema-parser.ts, validator.ts
│   │       ├── routing/          ← route-builder.ts
│   │       ├── soft-delete/      ← index.ts (all soft-delete helpers)
│   │       ├── utils/            ← adapter-utils.ts, inspect.ts
│   │       └── query/            ← filter, sort, projection, populate, search, pagination
│   ├── express/          ← Express adapter
│   │   └── src/
│   │       ├── handlers/         ← get-all, get-one, create, update, patch, delete, restore, purge
│   │       ├── http/             ← context.ts, response.ts
│   │       ├── middleware/       ← body-size.ts, rate-limiter.ts
│   │       └── utils/            ← document.ts, logger.ts, resolve-mongoose.ts
│   ├── fastify/          ← Fastify adapter (mirrors express structure)
│   │   └── src/
│   │       ├── handlers/         ← get-all, get-one, create, update, patch, delete, restore, purge
│   │       ├── http/             ← response.ts
│   │       └── utils/            ← body-size.ts, logger.ts, resolve-mongoose.ts
│   ├── docs/             ← OpenAPI 3.0 spec generator + Swagger UI
│   ├── sdk/              ← TypeScript client SDK (typed generics, patch method)
│   └── schemaroute/      ← umbrella package
├── apps/
│   ├── test-api/             ← Express test server (not published)
│   └── test-api fastify/     ← Fastify test server (not published)
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
  ├── @schemaroute/fastify  ← depends on core
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

**SchemaRoute automates CRUD-heavy resources without trying to become your application framework.**

Complex domain logic stays in your own controllers. Auth stays in your own middleware. SchemaRoute owns only the routes you give it.

Trying to push complex orchestration logic into hooks is a sign that the resource has outgrown SchemaRoute — not a sign that SchemaRoute needs more features. For resources with complex domain logic, the correct pattern is to use SchemaRoute for the simple resources and write plain controllers or custom routes for the complex ones.

**Never force one option — always let user choose per resource, per route.**

### SchemaRoute does not own your API

SchemaRoute owns only the CRUD routes you give it. Everything else on the same Express or Fastify app is yours:

```js
// SchemaRoute handles these
createAPI(app, ProductSchema, 'products', {}, mongoose)
createAPI(app, CategorySchema, 'categories', {}, mongoose)

// Your own handlers coexist on the same app — no conflict
app.post('/products/:id/publish', requireAuth, publishProduct)
app.get('/reports/summary', requireAdmin, generateReport)
```

This is the intended adoption pattern. Start with the CRUD-heavy resources. Keep complex domain logic in your own handlers. Migrate more resources to SchemaRoute over time as confidence grows.

### Gradual adoption

SchemaRoute is designed to be adopted incrementally — you do not need to convert your whole backend:

```
Existing application

  /users       → your existing controller
  /orders      → your existing controller
  /products    → SchemaRoute
  /categories  → SchemaRoute

Later...

  /users       → your existing controller  (complex auth logic — keep it)
  /orders      → your existing controller  (payment hooks — keep it)
  /products    → SchemaRoute
  /categories  → SchemaRoute
  /reviews     → SchemaRoute               (new resource — zero boilerplate)
  /tags        → SchemaRoute               (new resource — zero boilerplate)
```

The adoption risk is low because SchemaRoute never touches routes you don't give it.

### Behavioral contract

Adopting SchemaRoute means adopting a set of API behaviors. Every behavior is either configurable or escapable — nothing is imposed silently. The items marked "not configurable" are intentional constraints, not oversights.

| Behavior | Default | Override |
|---|---|---|
| Response envelope | `{ success, data, meta }` | `response: (data, meta) => ({ ... })` |
| Validation | off | `routes.create: { validation: true }` — opt in per route. Off by default because Mongoose validates on save — SchemaRoute validation runs before the DB write and returns structured `422` errors with field-level detail, which is additive not duplicative. |
| All routes active | all 6 registered | `routes.delete: { enabled: false }` |
| All routes open | no auth | `routes.create: { middleware: [requireAuth] }` |
| All fields returned | full document | `expose: ['name', 'price']` |
| Any field filterable | all schema fields | non-schema fields ignored; enum values validated |
| Pagination | off | `pagination: 'page' \| 'cursor' \| 'both'` |
| Search | off | `search: 'all-fields' \| 'single-field'` |
| Population | off | `populate: [{ path: 'category', select: 'name' }]` |
| Sort | off | `routes.getAll: { sort: true }` |
| Soft delete | hard delete | `softDelete: true` |
| Scope | none | `scope: (req) => ({ tenantId: ... })` |
| Error shape | `{ success: false, error, details }` | not configurable — consistent across all routes |
| PATCH semantics | `$set` — only sent fields written | not configurable — use PUT for full replacement |
| ObjectId validation | invalid IDs return `400` | not configurable — always on |
| Enum filter validation | invalid enum values return `400` | not configurable — always on |
| Type coercion in filters | `?price=99` → number | not configurable — always on |
| Body size limit | Express default | `maxBodySize: '50kb'` |
| Rate limiting | none | `rateLimit: { max, window }` or bring your own |
| Debug logging | silent | `debug: true` |

If any non-configurable behavior conflicts with a resource's requirements, the correct response is to use a custom route or a plain controller for that resource — not to add a config flag. SchemaRoute is not the right tool for every resource in every application.

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
- `PATCH  /users/:id`
- `DELETE /users/:id`

---

### Full Config Example

```js
createAPI(app, UserSchema, 'users', {

  // --- resource-level defaults (can be overridden per route) ---
  pagination:  'page',
  search:      'all-fields',
  populate:    ['role'],
  expose:      ['name', 'email', 'role'],   // whitelist — only these fields ever leave the API
  prefix:      '/v1',                       // all routes registered under /v1/users
  maxBodySize: '100kb',                     // reject POST/PUT/PATCH bodies over this size
  response:    (data, meta) => ({ success: true, data, ...meta }),

  // scope — auto-applied to every query and create/update body
  scope: (req) => ({ tenantId: req.headers['x-tenant-id'] }),

  // softDelete — DELETE sets deletedAt/isDeleted instead of removing
  softDelete: true,  // or: { field: 'archivedAt', flagField: 'archived' }

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
      beforeCreate: async (data, ctx) => {
        data.password = await hash(data.password)
        // ctx.req is the raw request — access ip, user, custom middleware props
        console.log('created from ip:', ctx.req.ip)
        return data                       // modified data goes to DB
      },
      afterCreate: async (doc, ctx) => {
        await sendWelcomeEmail(doc.email)
      },
    },

    update: {
      enabled: true,
      public: false,
      middleware: [authMiddleware],
      validation: true,
      beforeUpdate: async (data, ctx) => {
        return data
      },
      afterUpdate: async (doc, ctx) => {},
    },

    patch: {
      enabled: true,
      public: false,
      middleware: [authMiddleware],
      validation: true,          // only validates fields present in the body
      beforeUpdate: async (data, ctx) => {
        return data
      },
      afterUpdate: async (doc, ctx) => {},
    },

    delete: {
      enabled: true,
      public: false,
      middleware: [authMiddleware, roleMiddleware('superadmin')],
      beforeDelete: async (doc, ctx) => {},
      afterDelete: async (doc, ctx) => {},
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
| Route | Method | Path | Description |
|---|---|---|---|
| getAll | GET | `/resource` | List documents with filtering, search, sort, pagination |
| getOne | GET | `/resource/:id` | Single document by ID with population |
| create | POST | `/resource` | Insert a new document |
| update | PUT | `/resource/:id` | Full document replacement |
| patch | PATCH | `/resource/:id` | Partial update — only sent fields are written |
| delete | DELETE | `/resource/:id` | Hard delete (or soft delete when `softDelete` is enabled) |

---

### HTTP Methods

SchemaRoute uses the standard REST subset for auto-generated routes:

| Method | Used by | Behaviour |
|---|---|---|
| GET | getAll, getOne | Read-only, no body |
| POST | create | Insert new document |
| PUT | update | Full replacement — all required fields must be present |
| PATCH | patch | Partial update via `$set` — only sent fields are written |
| DELETE | delete | Hard delete |
| HEAD | custom routes only | Like GET but response body is omitted — useful for existence checks and cache validation |

Not supported and why:

| Method | Reason |
|---|---|
| OPTIONS | Express handles CORS preflight automatically. No app-level ownership needed. |
| CONNECT | TCP tunnel for SSL proxies. Not an application-layer concern. |
| TRACE | Diagnostic loop-back. Disabled by default in most frameworks for security reasons. |

---

### Route Config Options

| Option | Type | Scope | Description |
|---|---|---|---|
| `enabled` | `boolean` | route | Whether this route is active |
| `public` | `boolean` | route | Skip all middleware/auth |
| `middleware` | `array` | route | Any middleware, user provides their own |
| `validation` | `boolean` | route | Auto-validate request body against schema |
| `rateLimit` | `object \| array` | route | `{ max, window }` or bring your own middleware |
| `transform` | `TransformFn` | route/resource | Reshape each document before sending |
| `expose` | `string[]` | resource | Read whitelist — only these fields ever leave the API (applied after transform/populate) |
| `writable` | `string[]` | resource | Write whitelist — only these fields are accepted in POST/PUT/PATCH bodies |
| `prefix` | `string` | resource | URL prefix for all routes, e.g. `'/v1'` |
| `maxBodySize` | `string \| number` | resource | Reject POST/PUT/PATCH bodies over this size |
| `debug` | `boolean` | resource | Enable diagnostic logging |

**Read vs write field control:**

```
             Mongoose schema
                   │
       ┌───────────┴───────────┐
       ▼                       ▼
    READ API                WRITE API
       │                       │
    expose                  writable
 (response gate)         (input gate)
```

`expose` and `writable` are independent. A field can be readable but not writable (e.g. `createdBy` set by a hook), writable but not readable (unlikely but possible), or both.

---

### Querying (getAll)

| Query Param | Example | Description |
|---|---|---|
| Filter | `?name=john&age=25` | Filter by any schema field |
| Sort | `?sort=createdAt&order=desc` | Sort by field |
| Fields | `?fields=name,email` | Select specific fields — works on both `getAll` and `getOne` |
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
Every hook receives a second `ctx` argument with `ctx.user`, `ctx.req`, `ctx.headers`, `ctx.query`, and `ctx.params`.

| Hook | Runs | Can modify data |
|---|---|---|
| `beforeCreate(data, ctx)` | before insert | ✅ return modified data |
| `afterCreate(doc, ctx)` | after insert | ❌ side effects only |
| `beforeUpdate(data, ctx)` | before update | ✅ return modified data |
| `afterUpdate(doc, ctx)` | after update | ❌ side effects only |
| `beforeDelete(doc, ctx)` | before delete | ❌ side effects only |
| `afterDelete(doc, ctx)` | after delete | ❌ side effects only |

---

### Population

```js
// plain string — returns the full referenced document
populate: ['author', 'category']

// object form — restricts which fields are returned from the ref
// prevents sensitive fields (e.g. password, tokens) from leaking
populate: [{ path: 'author', select: 'name email' }]

// route level override
getOne: {
  populate: [{ path: 'author', select: 'name' }, 'category']
}

// via query param on getAll or getOne
// note: config entries take precedence — a config select restriction
// cannot be overridden by the client via ?populate=
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
    method: 'POST',           // GET | POST | PUT | PATCH | DELETE | HEAD
    path: '/users/login',     // full path
    handler: loginHandler,    // your own handler
    middleware: [],           // optional
    validation: true,         // optional
  },
  {
    // HEAD — returns headers only, no body
    // useful for existence checks without transferring data
    method: 'HEAD',
    path: '/users/:id/exists',
    handler: async (req, res) => {
      const exists = await User.exists({ _id: req.params.id })
      res.status(exists ? 200 : 404).end()
    },
  },
]
```

---

### Soft Delete

When `softDelete: true` is set on a resource, `DELETE /:id` sets `deletedAt` and `isDeleted`
on the document instead of removing it. All reads automatically exclude soft-deleted documents.

The fields must exist on the Mongoose schema before enabling soft delete:

```js
const ProductSchema = new Schema({
  name:      String,
  deletedAt: { type: Date,    default: null },
  isDeleted: { type: Boolean, default: false },
})

createAPI(app, ProductSchema, 'products', { softDelete: true }, mongoose)
```

Custom field names:

```js
softDelete: { field: 'archivedAt', flagField: 'archived' }
```

**Soft delete edge cases:**

| Case | Behaviour |
|---|---|
| `DELETE` on a live document | Sets `deletedAt` + `isDeleted: true`. Returns `{ id }`. |
| `DELETE` on an already-soft-deleted document | Returns `404` — not a no-op |
| `GET /:id` on a soft-deleted document | Returns `404` |
| `GET /` list | Soft-deleted documents excluded automatically |
| Documents without `isDeleted` field (pre-existing) | Still returned — filter uses `$ne: true`, not `=== false` |
| Restore via `PATCH` | Set `{ isDeleted: false, deletedAt: null }` — document reappears in reads |

---

### Scope (Multitenancy)

The `scope` function is called on every request and its return value is merged into
every query filter and every create/update body. Use it to restrict all operations
to the current tenant or user without repeating the filter in every hook.

```js
createAPI(app, PostSchema, 'posts', {
  scope: (req) => ({ userId: req.headers['x-user-id'] }),
}, mongoose)
```

Scope is applied to:

| Operation | Effect |
|---|---|
| `getAll` | Merged into MongoDB filter — only matching docs returned |
| `getOne` | Merged into find filter — cross-scope reads return `404` |
| `create` | Merged into document body — new docs auto-tagged |
| `update` (PUT) | Merged into find filter — cross-scope writes return `404` |
| `patch` (PATCH) | Merged into find filter — cross-scope writes return `404` |
| `delete` | Merged into find filter — cross-scope deletes return `404` |

When `scope` returns `{}` (e.g. no header present), no filter is applied — all documents are accessible.

---

### SDK Generics

Pass a type map to `createSDK` to get fully typed responses across all methods:

```ts
interface Product  { _id: string; name: string; price: number; [key: string]: unknown }
interface Category { _id: string; name: string; slug: string;  [key: string]: unknown }

const api = createSDK<{ products: Product; categories: Category }>(
  'http://localhost:3000',
  [productsInstance, categoriesInstance]
)

const { data } = await api.products.getAll({ page: 1 })
// data is Product[] — fully typed

const patched = await api.products.patch('abc123', { price: 799 })
// patched.data is Product
```

Without the generic, all methods return `Record<string, unknown>`.

---

### Validation

- Auto-generated from Mongoose schema — no extra config needed
- Validates `required`, `type`, `enum`, `min`, `max`, `minlength`, `maxlength`, `objectid` format
- Validates that ObjectId ref fields point to existing documents
- Recurses into embedded sub-documents — both explicit `new Schema({})` and inline object forms
- Error field names use dot-notation for nested fields (e.g. `address.street`)
- Returns structured error response on failure

**Nested validation edge cases:**

| Case | Behaviour |
|---|---|
| Required nested object missing entirely | `422` — `address is required` |
| Required nested object is `null` | `422` — `address is required` |
| Nested object value is an array | `422` — `address must be an object` |
| Nested object is `{}` (empty) | `422` — one error per missing required child field |
| Optional nested object omitted | passes — no child fields validated |
| Nested child constraint violation | `422` — `address.postcode must be at least 3 characters` |
| PATCH with nested field absent | passes — absent fields are not validated |
| PUT with nested required fields missing | `422` — all required nested fields must be present |
| Inline object `required` flag | not supported by Mongoose at the parent level — only child fields carry required constraints |

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

### Authorization pattern

SchemaRoute does not implement authorization — it provides the hooks for you to plug in your own. The intended pattern:

```
Authentication middleware  (e.g. passport, JWT verify)
         ↓
Authorization middleware   (e.g. RBAC, permission check)
         ↓
Scope function             (e.g. tenant isolation)
         ↓
SchemaRoute CRUD handler
```

```js
createAPI(app, ProductSchema, 'products', {
  scope: req => ({ organizationId: req.user.organizationId }),  // tenant isolation
  routes: {
    create: { middleware: [requireAuth, can('product:create')] },
    update: { middleware: [requireAuth, can('product:update')] },
    delete: { middleware: [requireAuth, can('product:delete')] },
  },
}, mongoose)
```

SchemaRoute's responsibility ends at the CRUD boundary. Auth is yours.

---

### inspectAPI

`inspectAPI(instance)` prints a human-readable summary of what SchemaRoute has registered for a resource — directly attacking the "magic" problem:

```
GET    /products           public
GET    /products/:id       public
POST   /products           middleware: [requireAuth]
PUT    /products/:id       middleware: [requireAuth]
PATCH  /products/:id       middleware: [requireAuth]
DELETE /products/:id       middleware: [requireAuth, requireAdmin]

Query:   filter ✓  sort ✓  fields ✓  pagination: page  search: all-fields
Populate: category (select: name slug)

Exposed:  name, price, status, category
Writable: name, price, status, category
```

The data is already available on `SchemaRouteInstance` — this is a formatting layer over existing internals.

---

## Shipped

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
- [x] Custom routes (supports GET, POST, PUT, PATCH, DELETE, HEAD)
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
- [x] `PATCH /:id` route — partial updates via `$set`; partial validation skips required checks for absent fields
- [x] `?populate=` query param on `getOne` — parity with `getAll`
- [x] Populate field selection — `populate: [{ path: 'category', select: 'name slug' }]` prevents sensitive field leaking
- [x] Nested schema validation — recurses into embedded sub-documents; dot-notation error paths (e.g. `address.street`)
- [x] Soft delete — `softDelete: true` sets `deletedAt`/`isDeleted`; reads auto-exclude deleted docs; full lifecycle via `restore` and `purge` routes
- [x] Transform output validation — `debug: true` warns when transform silently drops fields
- [x] `@schemaroute/fastify` adapter — full feature parity with Express adapter
- [x] TypeScript generics on SDK — `createSDK<{ products: Product }>()` returns fully typed responses; `patch()` method added
- [x] Multitenancy / query scoping — `scope: (req) => ({ tenantId })` auto-applied to every query, create, update, patch, delete
- [x] Shared adapter utilities in `@schemaroute/core` — `deriveModelName`, `isValidObjectId`, `toMongoosePopulate`, `assertConnected`, `registerModel`, `makeResolveModel`, soft-delete helpers; both adapters import from core, no duplication
- [x] Hook `ctx` second argument — every hook receives `ctx` with `ctx.user`, `ctx.req`, `ctx.headers`, `ctx.query`, `ctx.params`; hooks can now access the authenticated user and raw request without workarounds
- [x] `?fields=` query param on `getOne` — `GET /:id?fields=name,price` now works; full parity with `getAll`
- [x] `expose` field whitelist — resource-level `expose: ['name', 'price']` applied as the final gate on every response; DB-only fields (password, tokens, internal flags) can never leak regardless of transform or populate
- [x] `maxBodySize` per resource — rejects oversized POST/PUT/PATCH bodies via Content-Length header (fast path) with a parsed-body byte-count fallback for chunked transfers; GET and DELETE unaffected
- [x] `prefix` for API versioning — `prefix: '/v1'` prepends to all auto-generated CRUD paths; custom routes use their own full path and are unaffected
- [x] Accept a Mongoose Model as the second argument — detects `model.schema` and `model.db`, extracts both, falls back to Schema behaviour; removes the need to pass `mongoose` as a 5th argument when a Model is provided; no breaking change
- [x] `writable` field whitelist — resource-level `writable: ['name', 'price']` strips any fields not in the list from POST/PUT/PATCH bodies before they reach hooks or the DB; closes the read/write security symmetry gap
- [x] `inspectAPI(instance)` utility — prints a formatted route table (method, path, middleware, exposed fields, writable fields, query capabilities) to stdout; uses existing `SchemaRouteInstance` data; no new internals needed
- [x] Soft delete full lifecycle — `restore` (`POST /:id/restore`) and `purge` (`DELETE /:id/purge`) routes; both disabled by default, opt in via `routes.restore.enabled` / `routes.purge.enabled`; restore returns 404 on live docs; purge returns 404 on live docs; second delete returns 404
- [x] Fastify adapter parity — middleware enforcement via `preHandler`, `prefix` support, `maxBodySize` guard, `transform` applied in all write handlers and `get-all`, `?fields=` on `getOne`, ref existence check in create/update/patch; full feature parity with Express adapter
- [x] Industry-standard folder structure — core split into `parsing/`, `routing/`, `soft-delete/`, `utils/`; express split into `handlers/`, `http/`, `middleware/`, `utils/`; fastify split into `handlers/`, `http/`, `utils/`

## Remaining

### Immediate — fixable now, no design decisions needed

**API ergonomics**
- `auth` shorthand — **intentionally not implemented**. SchemaRoute does not auto-attach middleware to routes. Middleware control stays with the user. Use a plain JS variable to share middleware without repetition: `const writeAuth = [requireAuth]; routes: { create: { middleware: writeAuth }, update: { middleware: writeAuth } }`. SchemaRoute is a library, not a framework.

**Infrastructure**
- [ ] GitHub Actions CI/CD pipeline — run tests on every PR, publish on version tag via Changesets
- [ ] `CHANGELOG.md` — consumers cannot tell what changed between versions without reading raw commits
- [ ] Integration test suite — unit tests cover modules at 99% but no real HTTP end-to-end coverage; needs `mongodb-memory-server` so CI runs without external deps
- [ ] `npm pkg fix` — normalise `repository.url` in all `package.json` files (noisy on every publish)

**Docs**
- [ ] Documentation site — Docusaurus or VitePress with getting-started guide, full config reference, migration guide, and live examples; searchable navigable docs are critical for library adoption
- [ ] `413` status code in generated OpenAPI spec — `maxBodySize` rejections are not currently documented in the spec; add when `maxBodySize` is set on the resource config

**Observability**
- [ ] Request ID / tracing — read `x-request-id` from request (or generate one), attach to hook `ctx`, include in every error response and debug log line; without this a failed request in production cannot be correlated back to a specific operation
- [ ] Structured log output — `debug: true` currently writes unstructured `console.log` output; production observability requires structured JSON logs with consistent fields (`requestId`, `resourceName`, `operation`, `durationMs`) that can be ingested by log aggregators (Datadog, CloudWatch, etc.)

**API — small surface, high value**
- [ ] Built-in health endpoint — `health: true` in `createAPI` auto-registers `GET /health`; needed for k8s liveness/readiness probes
- [ ] SDK retry logic — `{ retries: 3, backoff: 'exponential', timeout: 5000 }` option; retry on transient errors (503, network timeout), not on client errors (400, 422)

---

### Longer term — require design decisions or significant scope

**API Features**
- [ ] Input schema decoupling — `inputSchema` option per route to define validation and filtering independently of the Mongoose schema; today the API contract is structurally coupled to the DB shape, which breaks down when the two need to diverge as the system evolves
- [ ] Bulk operations — `POST /resource/bulk` and `DELETE /resource/bulk` with hooks and scope support
- [ ] Transaction support — `ctx.session` passed to every hook so multi-step writes can be wrapped in a Mongoose session; without this, hook sequences have no atomicity guarantee and a failure mid-chain leaves the DB in a partial state
- [ ] Response caching hooks — `afterGetAll` / `afterGetOne` hooks for cache population; `cacheKey` option so SchemaRoute can check cache before hitting MongoDB
- [ ] File upload support — `upload` option per route; multer-compatible; files available in hooks via request context
- [ ] Response compression — `compression: true` option at resource or global level; applies to read routes only

**Reliability**
- [ ] Connection circuit breaker — open on repeated failures, half-open on recovery; prevents thundering-herd reconnect storms
- [ ] Distributed rate limiting — built-in Redis-backed option; current in-memory limiter is per-instance so effective limit is `max × instances`

**Extensibility**
- [ ] Global event system — `schemaroute.on('create', auditLog)` to subscribe to events across all resources from one place
- [ ] Plugin system — `use(plugin)` API for third-party packages to hook into the request lifecycle or extend config

**Framework adapters**
- [ ] `@schemaroute/koa` — Koa adapter; see Future adapter guidance section for implementation steps
- [ ] `@schemaroute/hono` — Hono adapter; lightweight, edge-compatible

---

## Engineering Best Practices

### What's done well

- **Hook `ctx` includes `ctx.req`** — every hook receives the full raw framework request object via `ctx.req`. This means hooks can access `req.ip`, `req.socket`, custom properties set by auth middleware, and anything else on the request without being coupled to Express types. `ctx.user` is read from `req.user` (set by auth middleware). `ctx.headers`, `ctx.query`, and `ctx.params` are serialisable snapshots.
- **`expose` is the final gate** — `applyExposeFilter` runs after transform and populate, so sensitive fields cannot leak regardless of what earlier pipeline stages return. `_id` is always included unless explicitly listed. Applied to all 6 CRUD operations on both adapters.
- **`maxBodySize` uses a two-path guard** — a Content-Length header check (fast path, rejects before body is read) plus a parsed-body byte-count fallback for chunked transfers that omit Content-Length. A second `express.json({ limit })` parser would not work because Express skips re-parsing if `req.body` is already set by the app-level parser.
- **`prefix` strips trailing slash** — `'/v1/'` and `'/v1'` both produce `/v1/products`, not `/v1//products`. Custom routes define their own full path and are not affected.
- **`?fields=` on `getOne`** — query param takes precedence over `routeConfig.select` and `resourceConfig.select`. When active, only the listed fields are fetched from MongoDB via projection. `expose` is still applied after, so requesting a field outside the whitelist via `?fields=` still strips it.
- **Soft delete uses `$ne: true`** — the exclusion filter is `{ isDeleted: { $ne: true } }` rather than `{ isDeleted: false }`. This means documents created before soft delete was enabled (which have no `isDeleted` field) are still returned — `null` and `undefined` both satisfy `$ne: true`. A second `DELETE` on an already-soft-deleted document returns `404` because the find filter includes the soft-delete exclusion.
- **Scope is applied at the find-filter level** — not as middleware. This means cross-tenant reads and writes return `404` (not `403`), which avoids leaking the existence of other tenants' documents.
- **Transform output validation is debug-only** — `applyTransformWithValidation` only fires the dropped-fields warning when `debug: true`. In production it is a zero-cost pass-through. `__v` is excluded from the check since it is always stripped from responses anyway.
- **SDK generics use a type map** — `createSDK<{ products: Product }>()` maps resource names to document types. The constraint `Record<string, unknown>` is required on the type map entries so TypeScript can safely index them. Without the generic the SDK falls back to `Record<string, unknown>` for all resources.
- **Nested schema validation** — the validator recurses into embedded sub-document fields. Both explicit sub-schemas (`address: new Schema({ street: String })`) and inline objects (`address: { street: { type: String } }`) are supported. Error field names use dot-notation (e.g. `address.street`) so clients know exactly which nested field failed. Absent fields are left unchanged. Validation is also partial — required-field checks are skipped for fields not included in the body.
- **PATCH uses `$set`** — partial updates only write the fields present in the request body. Config entries take precedence over `?populate=` query param entries for the same path, so a server-side select restriction cannot be overridden by the client.
- **`?populate=` on getOne** — `getOne` now supports `?populate=` query param with the same deduplication and validation logic as `getAll`. Config entries win over query param entries for the same path.
- **HEAD in custom routes** — `HttpMethod` includes `HEAD` for custom routes that need to return headers only (e.g. existence checks, cache validation) without a response body. HEAD is not auto-generated for CRUD routes.
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
| **Update validation** | `validation: true` on `update` (PUT) runs full schema validation — all required fields must be present. For partial updates, use `patch` (PATCH) instead, which only validates the fields present in the body. |
| **`object` FieldType** | Embedded sub-documents are parsed as `'object'` type. Both explicit sub-schemas and inline objects are recursed into for validation. |
| **Koa / Hono adapters** | Only Express and Fastify are supported. Koa, Hono, and others require a custom adapter — see Future adapter guidance. |
| **Middleware is user-controlled** | SchemaRoute does not provide an `auth` shorthand or any mechanism to auto-attach middleware to routes. Middleware is always configured explicitly per-route via `routes.create.middleware`, etc. This is intentional — SchemaRoute is a library, not a framework. Use a plain JS variable to share middleware across routes without repetition: `const writeAuth = [requireAuth]; routes: { create: { middleware: writeAuth }, update: { middleware: writeAuth } }`. |
| **No CI/CD pipeline** | No GitHub Actions workflow exists yet. Tests and publish are run manually. |
| **No CHANGELOG** | No `CHANGELOG.md` exists. Consumers cannot tell what changed between versions without reading raw commits. |
| **Integration test gap** | Unit tests cover individual modules at 99% but do not cover real HTTP request/response scenarios end-to-end. The `test-api` integration tests require a live MongoDB Atlas connection and are not run in CI. |
| **`repository.url` warning on publish** | All `package.json` files have a non-normalised `repository.url` that npm auto-corrects on every publish. Minor but noisy. |
| **SDK has no retry or timeout** | The SDK throws immediately on network failure. There is no retry logic, no configurable timeout, and no exponential backoff. |
| **No request ID / tracing** | There is no `x-request-id` propagation or built-in request correlation. Failed requests cannot be traced through logs back to a specific API call. |
| **No built-in health endpoint** | There is no `health: true` option in `createAPI`. Every user must manually add `GET /health` to their app. |
| **No connection circuit breaker** | SchemaRoute returns 503 when MongoDB disconnects but does not queue or retry requests when the connection recovers. No circuit breaker pattern at the handler level. |
| **No global event system** | There is no way to subscribe to events across all resources globally (e.g. `schemaroute.on('create', auditLog)`). Hooks must be added individually to every resource. |
| **No file upload support** | `multipart/form-data` is completely unsupported. Resources that need file uploads must bypass SchemaRoute entirely with a custom route. |
| **No response compression** | No built-in `gzip`/`brotli` option. For large list responses this matters in production. Users must add `compression` middleware themselves. |
| **No documentation site** | There is no dedicated docs website (e.g. Docusaurus or VitePress). Only a README and ARCHITECTURE.md exist. Searchable, navigable docs are critical for library adoption. |

### Future adapter guidance

When building a new framework adapter (e.g. `@schemaroute/koa`):
1. Import `createSchemaRoute` from `@schemaroute/core` — do not duplicate schema parsing
2. Import shared utilities from `@schemaroute/core`: `deriveModelName`, `isValidObjectId`, `toMongoosePopulate`, `assertConnected`, `registerModel`, `makeResolveModel`, `resolveSoftDeleteFields`, `buildSoftDeleteFilter`, `buildSoftDeleteUpdate`
3. Register custom routes **before** `/:id` routes
4. Call `makeResolveModel()` to get a lazy model factory — never resolve at registration time
5. The only framework-specific code should be reading `req.body`/`req.params`/`req.query` and calling the framework's response API
6. See `@schemaroute/fastify` as the reference implementation alongside `@schemaroute/express`

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
| Populate field selection | ❌ | ❌ | ✅ |
| Partial updates (PATCH) | ❌ | ❌ | ✅ |
| Soft delete | ❌ | ❌ | ✅ |
| Multitenancy / scope | ❌ | ❌ | ✅ |
| Hooks + full request ctx | ❌ | ❌ | ✅ |
| Custom routes | ❌ | ✅ | ✅ |
| HEAD method support | ❌ | ❌ | ✅ |
| Response shape | ❌ | ❌ | ✅ |
| Rate limiting | ❌ | ❌ | ✅ |
| 3-layer config override | ❌ | ❌ | ✅ |
| Expose field whitelist | ❌ | ❌ | ✅ |
| API versioning (prefix) | ❌ | ❌ | ✅ |
| Body size limiting | ❌ | ❌ | ✅ |
| OpenAPI docs | ❌ | ❌ | ✅ |
| TypeScript SDK (typed generics) | ❌ | ❌ | ✅ |
| Fastify adapter | ❌ | ❌ | ✅ |
| Zero boilerplate | ⚠️ | ❌ | ✅ |
