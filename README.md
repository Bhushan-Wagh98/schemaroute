# SchemaRoute

Auto-generate a fully working CRUD API from a Mongoose schema. No boilerplate. No repetition.

```js
const UserSchema = new mongoose.Schema({ name: String, email: String, age: Number })

createAPI(app, UserSchema, 'users')
// GET    /users
// GET    /users/:id
// POST   /users
// PUT    /users/:id
// DELETE /users/:id
```

---

## Packages

| Package | Description |
|---|---|
| [`@schemaroute/core`](./packages/core) | Framework-agnostic schema parser, route builder, validator, query pipeline |
| [`@schemaroute/express`](./packages/express) | Express adapter — registers routes on an Express app |
| [`@schemaroute/docs`](./packages/docs) | OpenAPI 3.0 spec generator + Swagger UI |
| [`@schemaroute/sdk`](./packages/sdk) | Auto-generated TypeScript client SDK |

---

## Install

```bash
npm install @schemaroute/core @schemaroute/express
```

Add optional packages as needed:

```bash
npm install @schemaroute/docs   # Swagger UI
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
  name:  { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, required: true, min: 0 },
})

mongoose.connect(process.env.MONGO_URI).then(() => {
  createAPI(app, ProductSchema, 'products', {
    pagination: 'page',
    search:     'all-fields',
    routes: {
      create: { validation: true, middleware: [requireAuth] },
      update: { validation: true, middleware: [requireAuth] },
      delete: { middleware: [requireAuth, requireAdmin] },
    },
  }, mongoose)

  app.listen(3000)
})
```

---

## Monorepo Structure

```
schemaroute-lib/
├── packages/
│   ├── core/       ← framework-agnostic core
│   ├── express/    ← Express adapter
│   ├── docs/       ← OpenAPI + Swagger UI
│   └── sdk/        ← TypeScript client SDK
├── apps/
│   └── test-api/   ← local test server
└── ARCHITECTURE.md
```

---

## Tooling

| Tool | Purpose |
|---|---|
| Turborepo | Monorepo build orchestration |
| tsup | ESM + CJS dual build |
| TypeScript strict | Type safety |
| Vitest | Unit tests |
| pnpm | Package manager |

---

## Development

```bash
pnpm install
pnpm build        # build all packages
pnpm test         # run all tests
```

Run the test API:

```bash
cd apps/test-api
pnpm dev
# → http://localhost:3000
# → http://localhost:3000/api-docs  (Swagger UI)
```
