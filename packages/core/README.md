# @schemaroute/core

[![npm](https://img.shields.io/npm/v/@schemaroute/core)](https://www.npmjs.com/package/@schemaroute/core)

Framework-agnostic core for SchemaRoute. Parses Mongoose schemas, builds route descriptors, validates request bodies, and resolves the full query pipeline (filter, sort, search, pagination, projection, population).

Used internally by adapters like `@schemaroute/express` and `@schemaroute/fastify`. You only need to install this directly if you are building your own framework adapter.

---

## Install

```bash
npm install @schemaroute/core
```

---

## API

### `inspectAPI(instance)`

Prints a human-readable route table for a `SchemaRouteInstance` to stdout. Directly attacks the "magic" problem by making every route, middleware, and capability visible at a glance.

```ts
import { inspectAPI } from '@schemaroute/core'

inspectAPI(instance)
// [schemaroute] products
//
//   GET    /products                      public
//   POST   /products                      middleware: [requireAuth]
//   ...
//
//   Query:    filter ✓  sort ✓  pagination: page  search: all-fields
//   Exposed:  name, price, status
//   Writable: name, price, status
```

---

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
// instance.schema        → Mongoose Schema
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

Supported field types: `string`, `number`, `boolean`, `date`, `objectid`, `array`, `object`, `mixed`.

Supported constraints: `required`, `min`, `max`, `minlength`, `maxlength`, `enum`, `ref`.

---

### `buildRoutes(resourceName, config)`

Builds the array of framework-agnostic `RouteDefinition` objects from a `ResourceConfig`. Used internally by `createSchemaRoute`. Useful when building a custom adapter.

```ts
import { buildRoutes } from '@schemaroute/core'

const routes = buildRoutes('products', {
  routes: {
    create: { validation: true, middleware: [requireAuth] },
    delete: { enabled: false },
  },
})
// routes → RouteDefinition[]
```

Custom routes are appended last in the array but must be registered by the adapter **before** `/:id` routes to prevent named paths (e.g. `/products/active`) being caught by the id param.

When `prefix` is set (e.g. `prefix: '/v1'`), it is prepended to every auto-generated CRUD path. Custom routes define their own full path and are unaffected.

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

Validates: `required`, `type`, `min`, `max`, `minlength`, `maxlength`, `enum`, `objectid` format.

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
// resolved.errors      → []  — non-empty means the query params were invalid (return 400)
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
| Field filter | `?status=active` | Filter by any schema field. Returns `400` if value is not a valid enum member |
| `sort` | `?sort=price&order=desc` | Sort by field (`asc` / `desc`). Returns `400` for unknown field names |
| `fields` | `?fields=name,price` | Select specific fields on `getAll` and `getOne`. Returns `400` for unknown field names. Ref fields not listed are not populated |
| `search` | `?search=laptop` | Search across all string fields. Empty/whitespace values are ignored |
| `searchField` | `?searchField=name` | Restrict search to a specific field |
| `page` | `?page=2&limit=10` | Page-based pagination. Returns `400` if `page < 1` |
| `limit` | `?limit=10` | Page size. Returns `400` if non-numeric or non-positive. Clamped to max `100` |
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
  expose?:      string[]          // read whitelist — only these fields ever leave the API
  writable?:    string[]          // write whitelist — only these fields are accepted in POST/PUT/PATCH bodies
  prefix?:      string            // e.g. '/v1' — prepended to all auto-generated paths
  maxBodySize?: string | number   // e.g. '100kb' — rejects oversized POST/PUT/PATCH bodies
  scope?:       (req: any) => Record<string, unknown>
  softDelete?:  boolean | { field?: string; flagField?: string }
  transform?:   (doc: any) => any
  response?:    (data: any, meta: any) => any
  debug?:       boolean
  routes?: {
    getAll?:   GetAllRouteConfig
    getOne?:   GetOneRouteConfig
    create?:   CreateRouteConfig
    update?:   UpdateRouteConfig
    patch?:    PatchRouteConfig
    delete?:   DeleteRouteConfig
    restore?:  RestoreRouteConfig  // only active when softDelete is enabled; disabled by default
    purge?:    PurgeRouteConfig    // only active when softDelete is enabled; disabled by default
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
  FieldType,
  RouteDefinition,
  SchemaRouteInstance,
  RequestContext,
  ValidationError,
  ResolvedQuery,
  QueryParams,
  PagePagination,
  CursorPagination,
  PaginationMode,
  SearchMode,
  TransformFn,
  ResponseShapeFn,
  ResponseMeta,
  DefaultResponse,
  ErrorResponse,
  Hooks,
  GetAllRouteConfig,
  GetOneRouteConfig,
  CreateRouteConfig,
  UpdateRouteConfig,
  PatchRouteConfig,
  DeleteRouteConfig,
  RestoreRouteConfig,
  PurgeRouteConfig,
  CustomRoute,
  MiddlewareFn,
  RateLimitOption,
  BuiltInRateLimit,
  HttpMethod,
  ScopeFn,
  SoftDeleteOption,
  PopulateOption,
  PopulateFieldConfig,
} from '@schemaroute/core'
```

### FieldType

```ts
type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'objectid'
  | 'array'
  | 'object'    // embedded sub-document
  | 'mixed'
```

---

## Building a Framework Adapter

`@schemaroute/core` is designed to be framework-agnostic. To build an adapter:

1. Call `createSchemaRoute(schema, resourceName, config)` to get the instance
2. Iterate `instance.routes` — each `RouteDefinition` has `method`, `path`, `operation`, and resolved config
3. Register custom routes **before** CRUD routes to prevent `/:id` catching named paths
4. In each handler, call `resolveQuery`, run the Mongoose query, call `buildMeta`, and send the response

See [`@schemaroute/express`](https://www.npmjs.com/package/@schemaroute/express) as a reference implementation.

---

## Testing

```bash
pnpm test
pnpm test --coverage
```

214 unit tests · 99% statement coverage · 100% function coverage

---

## Links

- [GitHub](https://github.com/Bhushan-Wagh98/schemaroute)
- [@schemaroute/express](https://www.npmjs.com/package/@schemaroute/express)
- [@schemaroute/fastify](https://www.npmjs.com/package/@schemaroute/fastify)

---

## License

MIT
