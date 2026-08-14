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

### Future Packages (to be added)
- `@schemaroute/fastify`
- `@schemaroute/koa`
- `@schemaroute/hono`

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
- Validates `required`, `type`, `enum`, `min`, `max`, `minlength`, `maxlength`
- Returns structured error response on failure

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    { "field": "email", "message": "email is required" },
    { "field": "age", "message": "age must be a number" }
  ]
}
```

---

## V1 Scope

- [x] Schema parser
- [x] Route builder (framework agnostic)
- [x] 3-layer override system (global → resource → route)
- [x] Per-route config (enabled, public, middleware, validation)
- [x] Input validation from schema
- [x] Filtering, sorting, field selection
- [x] Pagination (page + cursor + both)
- [x] Search (all-fields + single-field)
- [x] Population (mongoose refs)
- [x] Hooks (before/after per operation)
- [x] Custom routes
- [x] Response shape (default + customizable)
- [x] Rate limiting (built-in + bring your own)
- [x] Standard error handling
- [x] Express adapter
- [x] OpenAPI 3.0 spec generation (`@schemaroute/docs`)
- [x] Swagger UI mount (`/api-docs`)
- [x] TypeScript client SDK (`@schemaroute/sdk`)

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
