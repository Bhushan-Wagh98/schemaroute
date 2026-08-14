# @schemaroute/common

[![npm](https://img.shields.io/npm/v/@schemaroute/common)](https://www.npmjs.com/package/@schemaroute/common)

Shared TypeScript types for the SchemaRoute ecosystem. Zero runtime dependencies — types only.

You do not need to install this package directly. It is automatically installed as a dependency of any `@schemaroute/*` package you use.

---

## What's in here

All shared interfaces and types used across the SchemaRoute ecosystem:

- `SchemaRouteInstance` — return value of `createAPI` / `createSchemaRoute`
- `ResourceConfig` — full config object passed to `createAPI`
- `ParsedSchema`, `ParsedField`, `FieldType` — normalised schema representation
- `RouteDefinition` — framework-agnostic route descriptor
- `RequestContext` — hook context (headers, query, params, user)
- `Hooks` — `beforeCreate`, `afterCreate`, `beforeUpdate`, etc.
- `ResponseMeta` — pagination metadata in list responses
- `ValidationError` — field-level validation error shape
- `PaginationMode`, `SearchMode` — config union types
- `GetAllRouteConfig`, `GetOneRouteConfig`, `CreateRouteConfig`, `UpdateRouteConfig`, `DeleteRouteConfig`
- `CustomRoute`, `MiddlewareFn`, `RateLimitOption`, `BuiltInRateLimit`

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
  ResponseMeta,
  ValidationError,
  RequestContext,
} from '@schemaroute/common'
```

---

## Links

- [GitHub](https://github.com/Bhushan-Wagh98/schemaroute)
- [@schemaroute/core](https://www.npmjs.com/package/@schemaroute/core)
- [@schemaroute/express](https://www.npmjs.com/package/@schemaroute/express)
- [@schemaroute/docs](https://www.npmjs.com/package/@schemaroute/docs)
- [@schemaroute/sdk](https://www.npmjs.com/package/@schemaroute/sdk)

---

## License

MIT
