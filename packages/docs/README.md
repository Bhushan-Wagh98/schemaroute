# @schemaroute/docs

OpenAPI 3.0 spec generator and Swagger UI for SchemaRoute. Auto-generates interactive API documentation from your registered resources — no manual spec writing required.

---

## Install

```bash
npm install @schemaroute/docs
```

---

## Quick Start

```js
import { createAPI } from '@schemaroute/express'
import { generateOpenAPISpec, mountSwaggerUI } from '@schemaroute/docs'

mongoose.connect(process.env.MONGO_URI).then(() => {
  const productsInstance  = createAPI(app, ProductSchema,  'products',  config, mongoose)
  const categoriesInstance = createAPI(app, CategorySchema, 'categories', config, mongoose)

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

| Param | Type | Description |
|---|---|---|
| `instances` | `SchemaRouteInstance[]` | Instances returned by `createAPI` |
| `options.title` | `string` | API title. Default: `'SchemaRoute API'` |
| `options.version` | `string` | API version. Default: `'1.0.0'` |
| `options.description` | `string` | Short description shown in Swagger UI |
| `options.serverUrl` | `string` | Base server URL. Default: `'http://localhost:3000'` |

For each resource the spec includes:

- Reusable schema component under `components/schemas` — field types, required fields, enum values, min/max constraints
- Path items for every enabled CRUD route
- Query parameters for `getAll` — filter fields, sort, search, pagination, fields, populate
- Request body schemas for `create` and `update`
- Standard response envelopes — 200, 201, 400, 404, 422, 500
- Custom routes with readable summaries

---

## `mountSwaggerUI(app, spec, path?)`

Mounts Swagger UI on an Express app.

| Param | Type | Description |
|---|---|---|
| `app` | `Application` | Express app instance |
| `spec` | `OpenAPISpec` | Spec object from `generateOpenAPISpec` |
| `path` | `string` | URL path for Swagger UI. Default: `'/api-docs'` |

```js
mountSwaggerUI(app, spec)
// → http://localhost:3000/api-docs

mountSwaggerUI(app, spec, '/docs')
// → http://localhost:3000/docs
```

> Call `mountSwaggerUI` after all routes are registered so the spec reflects the full API surface.

---

## What Gets Generated

Given a `ProductSchema` with fields `name`, `price`, `stock`, `status`, `category`:

**Paths:**
```
GET    /products           — List all products (with filter, sort, search, pagination, populate params)
POST   /products           — Create a product (with request body schema)
GET    /products/{id}      — Get a product by ID
PUT    /products/{id}      — Update a product by ID
DELETE /products/{id}      — Delete a product by ID
```

**Schema component:**
```json
{
  "Product": {
    "type": "object",
    "properties": {
      "_id":   { "type": "string" },
      "name":  { "type": "string", "minLength": 2, "maxLength": 100 },
      "price": { "type": "number", "minimum": 0 },
      "status": { "type": "string", "enum": ["active", "inactive", "out_of_stock"] }
    },
    "required": ["name", "price", "stock", "category"]
  }
}
```
