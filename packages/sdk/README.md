# @schemaroute/sdk

Auto-generated TypeScript client SDK for SchemaRoute APIs. Get a fully typed HTTP client with zero boilerplate — methods map 1:1 to your routes, inferred from the same schema instances used to register them.

Uses native `fetch` — no extra HTTP dependencies.

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

// server side — createAPI now returns the instance
const productsInstance  = createAPI(app, ProductSchema,  'products',  config, mongoose)
const categoriesInstance = createAPI(app, CategorySchema, 'categories', config, mongoose)

// create the SDK — pass the same instances
const api = createSDK('http://localhost:3000', [productsInstance, categoriesInstance])

// fully typed CRUD methods
const { data, meta } = await api.products.getAll({ page: 1, limit: 10 })
const product        = await api.products.getOne('abc123')
const created        = await api.products.create({ name: 'Laptop', price: 999, stock: 10 })
const updated        = await api.products.update('abc123', { price: 899 })
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
  headers: { 'x-api-key': 'secret123', 'x-role': 'admin' },
})
```

---

## Resource Methods

Each resource on the SDK object exposes five methods:

### `getAll(params?)`

```ts
const { data, meta } = await api.products.getAll({
  filter:      { status: 'active' },   // filter by any schema field
  sort:        'price',
  order:       'asc',
  fields:      'name,price,stock',     // field selection
  search:      'laptop',               // full-text search
  page:        1,
  limit:       10,
  populate:    'category',
  headers:     { 'x-api-key': 'secret' }, // per-request header override
})
// data → Product[]
// meta → { page, limit, total, totalPages }
```

### `getOne(id, params?)`

```ts
const { data } = await api.products.getOne('507f1f77bcf86cd799439011')
// data → Product
```

### `create(body, params?)`

```ts
const { data } = await api.products.create(
  { name: 'Laptop', price: 999, stock: 10, category: 'abc123' },
  { headers: { 'x-api-key': 'secret' } }
)
// data → created Product
```

### `update(id, body, params?)`

```ts
const { data } = await api.products.update('abc123', { price: 899 })
// data → updated Product
```

### `delete(id, params?)`

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
  }
}
```

| Property | Type | Description |
|---|---|---|
| `err.status` | `number` | HTTP status code |
| `err.error` | `string` | Server error message |
| `err.details` | `array \| undefined` | Validation errors (422 only) |
