# @schemaroute/docs

[![npm](https://img.shields.io/npm/v/@schemaroute/docs)](https://www.npmjs.com/package/@schemaroute/docs)

OpenAPI 3.0 spec generator and Swagger UI for SchemaRoute. Auto-generates interactive API documentation from your registered resources — no manual spec writing required.

---

## Install

```bash
npm install @schemaroute/docs
```

---

## Quick Start

```js
import express  from 'express'
import mongoose from 'mongoose'
import { createAPI } from '@schemaroute/express'
import { generateOpenAPISpec, mountSwaggerUI } from '@schemaroute/docs'

const app = express()
app.use(express.json())

mongoose.connect(process.env.MONGO_URI).then(() => {
  const productsInstance   = createAPI(app, ProductSchema,  'products',  {}, mongoose)
  const categoriesInstance = createAPI(app, CategorySchema, 'categories', {}, mongoose)

  const spec = generateOpenAPISpec([productsInstance, categoriesInstance], {
    title:       'My API',
    version:     '1.0.0',
    description: 'Auto-generated API documentation',
    serverUrl:   'http://localhost:3000',
  })

  mountSwaggerUI(app, spec)
  // → Swagger UI at http://localhost:3000/api-docs

  app.listen(3000)
})
```

---

## `generateOpenAPISpec(instances, options?)`

Builds a complete OpenAPI 3.0 spec object from an array of `SchemaRouteInstance` objects.

```ts
const spec = generateOpenAPISpec(instances, {
  title:       'My API',       // default: 'SchemaRoute API'
  version:     '1.0.0',        // default: '1.0.0'
  description: 'My API docs',  // optional
  serverUrl:   'https://api.myapp.com',  // default: 'http://localhost:3000'
})
```

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | `string` | `'SchemaRoute API'` | API title shown in Swagger UI |
| `version` | `string` | `'1.0.0'` | API version |
| `description` | `string` | — | Short description shown in Swagger UI |
| `serverUrl` | `string` | `'http://localhost:3000'` | Base server URL |

---

## `mountSwaggerUI(app, spec, path?)`

Mounts Swagger UI on an Express app.

```js
mountSwaggerUI(app, spec)
// → http://localhost:3000/api-docs

mountSwaggerUI(app, spec, '/docs')
// → http://localhost:3000/docs
```

| Param | Type | Default | Description |
|---|---|---|---|
| `app` | `Application` | — | Express app instance |
| `spec` | `OpenAPISpec` | — | Spec object from `generateOpenAPISpec` |
| `path` | `string` | `'/api-docs'` | URL path for Swagger UI |

> Call `mountSwaggerUI` after all `createAPI` calls so the spec reflects the full API surface.

---

## What Gets Generated

Given a `ProductSchema` with fields `name`, `price`, `stock`, `status`, `category`:

### Paths

```
GET    /products           — List all products
POST   /products           — Create a product
GET    /products/{id}      — Get a product by ID
PUT    /products/{id}      — Update a product by ID
DELETE /products/{id}      — Delete a product by ID
```

### Query parameters on `GET /products`

All filter, sort, search, pagination, fields, and populate params are documented automatically:

```
?status=active
?sort=price&order=desc
?fields=name,price,stock
?search=laptop
?page=1&limit=10
?cursor=<id>&limit=10
?populate=category
```

### Schema component

```json
{
  "Product": {
    "type": "object",
    "properties": {
      "_id":    { "type": "string" },
      "name":   { "type": "string" },
      "price":  { "type": "number", "minimum": 0 },
      "stock":  { "type": "number", "minimum": 0 },
      "status": { "type": "string", "enum": ["active", "inactive"] }
    },
    "required": ["name", "price", "stock"]
  }
}
```

### Response envelopes

All responses are documented with the standard SchemaRoute envelope:

```json
{
  "success": true,
  "data": [...],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

### Status codes documented

| Code | Meaning |
|---|---|
| `200` | Success |
| `201` | Created |
| `400` | Bad request |
| `404` | Not found |
| `422` | Validation failed |
| `500` | Internal server error |

---

## Serving the Raw Spec

If you need the raw JSON spec (e.g. for Postman or Redoc):

```js
app.get('/openapi.json', (req, res) => res.json(spec))
```

---

## License

MIT
