# @schemaroute/sdk

[![npm](https://img.shields.io/npm/v/@schemaroute/sdk)](https://www.npmjs.com/package/@schemaroute/sdk)

Auto-generated TypeScript client SDK for SchemaRoute APIs. Get a fully typed HTTP client with zero boilerplate — methods map 1:1 to your routes, inferred from the same schema instances used to register them.

Uses native `fetch` — no extra HTTP dependencies.

> The SDK is a client-side convenience layer. It does not bypass any server-side security — `expose`, `scope`, middleware, and validation all apply normally to every request the SDK makes.

---

## Install

```bash
npm install @schemaroute/sdk
```

---

## Quick Start

```ts
import { createAPI } from '@schemaroute/express'
import { createSDK } from '@schemaroute/sdk'

// server side — createAPI returns the instance
const productsInstance   = createAPI(app, ProductSchema,  'products',  {}, mongoose)
const categoriesInstance = createAPI(app, CategorySchema, 'categories', {}, mongoose)

// create the SDK
const api = createSDK('http://localhost:3000', [productsInstance, categoriesInstance])

// fully typed CRUD methods
const { data, meta } = await api.products.getAll({ page: 1, limit: 10 })
const product        = await api.products.getOne('abc123')
const created        = await api.products.create({ name: 'Laptop', price: 999, stock: 10 })
const updated        = await api.products.update('abc123', { price: 899 })  // PUT — full replace
const patched        = await api.products.patch('abc123', { price: 799 })   // PATCH — partial update
await api.products.delete('abc123')
```

---

## `createSDK(baseUrl, instances, options?)`

| Param | Type | Description |
|---|---|---|
| `baseUrl` | `string` | Base URL of the API server |
| `instances` | `SchemaRouteInstance[]` | Instances returned by `createAPI` |
| `options.headers` | `Record<string, string>` | Default headers sent with every request |

```ts
// with auth headers applied to every request
const api = createSDK('http://localhost:3000', [productsInstance], {
  headers: {
    'Authorization': 'Bearer <token>',
    'x-api-key':     'secret123',
  },
})
```

---

## Resource Methods

Each resource on the SDK object exposes six methods:

### `getAll(params?)`

Fetches a list of documents. Supports all query options.

```ts
const { data, meta } = await api.products.getAll({
  filter:   { status: 'active' },    // filter by any schema field — spread into query string
  sort:     'price',
  order:    'asc',
  fields:   'name,price,stock',      // field selection
  search:   'laptop',                // full-text search
  page:     1,
  limit:    10,
  populate: 'category',
  headers:  { 'x-api-key': 'secret' }, // per-request header override
})
// data → Product[]
// meta → { page, limit, total, totalPages }
```

`filter` fields are spread directly into the query string alongside the reserved params. For example `{ filter: { status: 'active' } }` produces `?status=active`.

### `getOne(id, params?)`

Fetches a single document by ID.

```ts
const { data } = await api.products.getOne('507f1f77bcf86cd799439011')
const { data } = await api.products.getOne('abc123', {
  headers: { 'Authorization': 'Bearer <token>' },
})
// data → Product
```

### `create(body, params?)`

Creates a new document.

```ts
const { data } = await api.products.create(
  { name: 'Laptop', price: 999, stock: 10, category: 'abc123' },
  { headers: { 'Authorization': 'Bearer <token>' } }
)
// data → created Product
```

### `update(id, body, params?)`

Updates an existing document by ID.

```ts
const { data } = await api.products.update('abc123', { price: 899, stock: 5 })
// data → updated Product
```

### `patch(id, body, params?)`

Partially updates a document by ID via `PATCH`. Only the fields in `body` are written — absent fields are left unchanged.

```ts
const { data } = await api.products.patch('abc123', { price: 799 })
// data → updated Product (only price changed, all other fields unchanged)
```

### `delete(id, params?)`

Deletes a document by ID.

```ts
const { data } = await api.products.delete('abc123')
// data → { id: 'abc123' }
```

---

## Error Handling

All methods throw `SDKError` on non-2xx responses.

```ts
import { SDKError } from '@schemaroute/sdk'

try {
  await api.products.create({ name: '' })
} catch (err) {
  if (err instanceof SDKError) {
    console.log(err.status)   // 422
    console.log(err.error)    // 'Validation failed'
    console.log(err.details)  // [{ field: 'name', message: 'name is required' }]
    console.log(err.message)  // '[SchemaRoute SDK] 422: Validation failed'
  }
}
```

| Property | Type | Description |
|---|---|---|
| `err.status` | `number` | HTTP status code |
| `err.error` | `string` | Server error message |
| `err.details` | `array \| undefined` | Validation errors (422 only) |
| `err.message` | `string` | Formatted error string: `[SchemaRoute SDK] <status>: <error>` |

Non-JSON responses (e.g. 502 HTML error pages from a proxy) are also caught and wrapped in `SDKError`.

---

## Per-Request Headers

Override default headers on any individual request:

```ts
// default headers set at SDK level
const api = createSDK('http://localhost:3000', instances, {
  headers: { 'x-api-key': 'global-key' },
})

// override for a specific request
await api.products.create(data, {
  headers: { 'x-api-key': 'different-key', 'x-trace-id': 'abc' },
})
```

---

## TypeScript Types

```ts
import type {
  SDKOptions,
  GetAllParams,
  GetOneParams,
  CreateParams,
  UpdateParams,
  PatchParams,
  DeleteParams,
  ListResponse,
  SingleResponse,
  DeleteResponse,
  ResourceClient,
} from '@schemaroute/sdk'

import { SDKError } from '@schemaroute/sdk'
```

### `SchemaRouteSDK<TResources>`

The return type of `createSDK` when you want to type the full SDK object:

```ts
import type { SchemaRouteSDK } from '@schemaroute/sdk'

type MyAPI = SchemaRouteSDK<{
  products:   { name: string; price: number }
  categories: { name: string; slug: string }
}>
```

---

## Links

- [GitHub](https://github.com/Bhushan-Wagh98/schemaroute)
- [@schemaroute/express](https://www.npmjs.com/package/@schemaroute/express)
- [@schemaroute/fastify](https://www.npmjs.com/package/@schemaroute/fastify)
- [@schemaroute/docs](https://www.npmjs.com/package/@schemaroute/docs)

---

## License

MIT
