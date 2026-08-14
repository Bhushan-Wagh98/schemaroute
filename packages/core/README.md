# @schemaroute/core

Framework-agnostic core for SchemaRoute. Parses Mongoose schemas, builds route descriptors, validates request bodies, and resolves query parameters.

Used internally by adapters like `@schemaroute/express`. You only need to install this directly if you are building your own framework adapter.

---

## Install

```bash
npm install @schemaroute/core
```

---

## API

### `createSchemaRoute(schema, resourceName, config?)`

Parses a Mongoose schema and builds framework-agnostic route descriptors.

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

// instance.routes       → RouteDefinition[]
// instance.parsedSchema → ParsedSchema
// instance.resourceName → 'products'
// instance.config       → ResourceConfig
```

---

### `parseSchema(schema)`

Parses a Mongoose schema into a normalised `ParsedSchema`.

```ts
import { parseSchema } from '@schemaroute/core'

const parsed = parseSchema(ProductSchema)
// parsed.fields       → [{ name: 'name', type: 'string', required: true, ... }]
// parsed.stringFields → ['name', 'description']
// parsed.refFields    → ['category']
```

---

### `validate(body, parsedSchema)`

Validates a request body against the parsed schema constraints. Returns an array of `ValidationError` objects — empty means valid.

```ts
import { validate } from '@schemaroute/core'

const errors = validate(req.body, parsedSchema)
// [{ field: 'name', message: 'name is required' }]
```

Supported constraints: `required`, `type`, `min`, `max`, `minlength`, `maxlength`, `enum`.

---

### `resolveQuery(queryParams, parsedSchema, options)`

Resolves raw HTTP query parameters into a structured `ResolvedQuery` for Mongoose.

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

// resolved.filter     → { status: 'active' }
// resolved.sort       → { price: -1 }
// resolved.projection → { name: 1, price: 1 }
// resolved.populate   → ['category']
// resolved.pagination → { type: 'page', page: 1, limit: 10, skip: 0 }
```

---

### `buildMeta(pagination, total, nextCursor?)`

Builds the `meta` object for list responses.

```ts
import { buildMeta } from '@schemaroute/core'

const meta = buildMeta(resolved.pagination, totalCount)
// { page: 1, limit: 10, total: 42, totalPages: 5 }
```

---

## Query Parameters

When `resolveQuery` is used, the following query params are supported on list endpoints:

| Param | Example | Description |
|---|---|---|
| Field filter | `?status=active` | Filter by any schema field |
| `sort` | `?sort=price&order=desc` | Sort by field |
| `fields` | `?fields=name,price` | Select specific fields |
| `search` | `?search=laptop` | Search across string fields |
| `searchField` | `?searchField=name` | Search in a specific field |
| `page` | `?page=2&limit=10` | Page-based pagination |
| `cursor` | `?cursor=<id>&limit=10` | Cursor-based pagination |
| `populate` | `?populate=category` | Populate ref fields |

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
  PaginationMode,
  SearchMode,
} from '@schemaroute/core'
```

---

## Tests

```bash
pnpm test
pnpm test --coverage
```

116 tests · ~100% coverage
