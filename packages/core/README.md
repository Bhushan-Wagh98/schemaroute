# @schemaroute/core

[![npm](https://img.shields.io/npm/v/@schemaroute/core)](https://www.npmjs.com/package/@schemaroute/core)

Framework-agnostic core for SchemaRoute. Parses Mongoose schemas, builds route descriptors, validates request bodies, and resolves the full query pipeline (filter, sort, search, pagination, projection, population).

Used internally by adapters like `@schemaroute/express`. You only need to install this directly if you are building your own framework adapter.

---

## Install

```bash
npm install @schemaroute/core
```

---

## API

### `createSchemaRoute(schema, resourceName, config?)`

Parses a Mongoose schema and returns a `SchemaRouteInstance` — the central object used by adapters, docs, and the SDK.

```ts
import { createSchemaRoute } from '@schemaroute/core'
import mongoose from 'mongoose'

const ProductSchema = new mongoose.Schema({
  name:  { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
})

const instance = createSchemaRoute(ProductSchema, 'products', {
  pagination: 'page',
  routes: {
    create: { validation: true },
  },
})

// instance.routes        → RouteDefinition[]
// instance.parsedSchema  → ParsedSchema
// instance.resourceName  → 'products'
// instance.config        → ResourceConfig
```

---

### `parseSchema(schema)`

Parses a Mongoose schema into a normalised `ParsedSchema`.

```ts
import { parseSchema } from '@schemaroute/core'

const parsed = parseSchema(ProductSchema)
// parsed.fields        → [{ name, type, required, min, max, enum, ref, ... }]
// parsed.stringFields  → ['name', 'description']
// parsed.refFields     → ['category']
```

Supported field types: `string`, `number`, `boolean`, `date`, `objectid`, `array`, `mixed`.

Supported constraints: `required`, `min`, `max`, `minlength`, `maxlength`, `enum`, `ref`.

---

### `validate(body, parsedSchema)`

Validates a request body against the parsed schema constraints. Returns an array of `ValidationError` — empty array means valid.

```ts
import { validate } from '@schemaroute/core'

const errors = validate({ name: '', price: 'abc' }, parsedSchema)
// [
//   { field: 'name',  message: 'name is required' },
//   { field: 'price', message: 'price must be a number' }
// ]
```

Validates: `required`, `type`, `min`, `max`, `minlength`, `maxlength`, `enum`.

---

### `resolveQuery(queryParams, parsedSchema, options)`

Resolves raw HTTP query parameters into a structured `ResolvedQuery` ready for Mongoose.

```ts
import { resolveQuery } from '@schemaroute/core'

const resolved = resolveQuery(req.query, parsedSchema, {
  pagination:  'page',
  search:      'all-fields',
  sort:        true,
  fields:      true,
  populate:    ['category'],
  exclude:     ['__v'],
})

// resolved.filter      → { status: 'active' }
// resolved.sort        → { price: -1 }
// resolved.projection  → { name: 1, price: 1 }
// resolved.populate    → ['category']
// resolved.pagination  → { type: 'page', page: 1, limit: 10, skip: 0 }
// resolved.search      → { $or: [{ name: /laptop/i }, { description: /laptop/i }] }
```

---

### `buildMeta(pagination, total, nextCursor?)`

Builds the `meta` object for list responses.

```ts
import { buildMeta } from '@schemaroute/core'

// page-based
const meta = buildMeta(resolved.pagination, 42)
// { page: 1, limit: 10, total: 42, totalPages: 5 }

// cursor-based
const meta = buildMeta(resolved.pagination, 42, lastDoc._id.toString())
// { limit: 10, total: 42, nextCursor: 'abc123' }
```

---

## Query Parameters

When `resolveQuery` is used, the following query params are supported on list endpoints:

| Param | Example | Description |
|---|---|---|
| Field filter | `?status=active` | Filter by any schema field |
| `sort` | `?sort=price&order=desc` | Sort by field (`asc` / `desc`) |
| `fields` | `?fields=name,price` | Select specific fields |
| `search` | `?search=laptop` | Search across all string fields |
| `searchField` | `?searchField=name` | Restrict search to a specific field |
| `page` | `?page=2&limit=10` | Page-based pagination |
| `cursor` | `?cursor=<id>&limit=10` | Cursor-based pagination |
| `populate` | `?populate=category` | Populate ref fields |

---

## Config Reference

```ts
interface ResourceConfig {
  pagination?:  'page' | 'cursor' | 'both' | false
  search?:      'all-fields' | 'single-field' | false
  populate?:    string[]
  exclude?:     string[]
  select?:      string[]
  transform?:   (doc: any) => any
  response?:    (data: any, meta: any) => any
  routes?: {
    getAll?:  GetAllRouteConfig
    getOne?:  GetOneRouteConfig
    create?:  CreateRouteConfig
    update?:  UpdateRouteConfig
    delete?:  DeleteRouteConfig
  }
  custom?: CustomRoute[]
}
```

---

## Types

```ts
import type {
  ResourceConfig,
  ParsedSchema,
  ParsedField,
  RouteDefinition,
  SchemaRouteInstance,
  RequestContext,
  ValidationError,
  ResolvedQuery,
  PaginationMode,
  SearchMode,
} from '@schemaroute/core'
```

---

## Building a Framework Adapter

`@schemaroute/core` is designed to be framework-agnostic. To build an adapter:

1. Call `createSchemaRoute(schema, resourceName, config)` to get the instance
2. Iterate `instance.routes` — each `RouteDefinition` has `method`, `path`, `type`, and resolved config
3. Register each route on your framework
4. In each handler, call `resolveQuery`, run the Mongoose query, call `buildMeta`, and send the response

See [`@schemaroute/express`](https://www.npmjs.com/package/@schemaroute/express) as a reference implementation.

---

## Testing

```bash
pnpm test
pnpm test --coverage
```

116 tests · 99.63% statement coverage · 100% function coverage

---

## License

MIT
