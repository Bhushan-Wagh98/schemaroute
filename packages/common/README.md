# @schemaroute/common

[![npm](https://img.shields.io/npm/v/@schemaroute/common)](https://www.npmjs.com/package/@schemaroute/common)

Shared TypeScript types for the SchemaRoute ecosystem. Zero runtime dependencies — types only.

You do not need to install this package directly. It is automatically installed as a dependency of any `@schemaroute/*` package you use.

---

## What's in here

All shared interfaces and types used across the SchemaRoute ecosystem:

**Instances & Config**
- `SchemaRouteInstance` — return value of `createAPI` / `createSchemaRoute`
- `ResourceConfig` — full config object passed to `createAPI` (`pagination`, `search`, `populate`, `exclude`, `expose`, `prefix`, `maxBodySize`, `scope`, `softDelete`, `transform`, `debug`, `routes`, `custom`)
- `GetAllRouteConfig`, `GetOneRouteConfig`, `CreateRouteConfig`, `UpdateRouteConfig`, `PatchRouteConfig`, `DeleteRouteConfig`
- `CustomRoute`

**Schema**
- `ParsedSchema`, `ParsedField`, `FieldType` — normalised schema representation

**Routes**
- `RouteDefinition` — framework-agnostic route descriptor
- `HttpMethod` — `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'`

**Hooks & Context**
- `Hooks` — `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete` — all receive `(data/doc, ctx)`
- `RequestContext` — hook context (`headers`, `query`, `params`, `user`, `req`)

**Response**
- `ResponseMeta` — pagination metadata in list responses
- `DefaultResponse` — `{ success, data, meta? }`
- `ErrorResponse` — `{ success: false, error, details? }`
- `ResponseShapeFn` — custom response envelope function type
- `TransformFn` — per-document transform function type

**Validation**
- `ValidationError` — `{ field, message }`

**Middleware & Rate Limiting**
- `MiddlewareFn` — `(req, res, next) => void`
- `RateLimitOption` — `BuiltInRateLimit | MiddlewareFn[]`
- `BuiltInRateLimit` — `{ max: number, window: string }`

**Pagination & Search**
- `PaginationMode` — `'page' | 'cursor' | 'both' | false`
- `SearchMode` — `'all-fields' | 'single-field' | false`

---

## Install

```bash
npm install @schemaroute/common
```

---

## Usage

```ts
import type {
  SchemaRouteInstance,
  ResourceConfig,
  ParsedSchema,
  ParsedField,
  FieldType,
  RouteDefinition,
  RequestContext,
  Hooks,
  ResponseMeta,
  DefaultResponse,
  ErrorResponse,
  ValidationError,
  TransformFn,
  ResponseShapeFn,
  MiddlewareFn,
  RateLimitOption,
  BuiltInRateLimit,
  PaginationMode,
  SearchMode,
  HttpMethod,
  GetAllRouteConfig,
  GetOneRouteConfig,
  CreateRouteConfig,
  UpdateRouteConfig,
  DeleteRouteConfig,
  CustomRoute,
} from '@schemaroute/common'
```

---

## Links

- [GitHub](https://github.com/Bhushan-Wagh98/schemaroute)
- [@schemaroute/core](https://www.npmjs.com/package/@schemaroute/core)
- [@schemaroute/express](https://www.npmjs.com/package/@schemaroute/express)
- [@schemaroute/fastify](https://www.npmjs.com/package/@schemaroute/fastify)
- [@schemaroute/docs](https://www.npmjs.com/package/@schemaroute/docs)
- [@schemaroute/sdk](https://www.npmjs.com/package/@schemaroute/sdk)

---

## License

MIT
