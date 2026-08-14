/**
 * @file index.ts
 * @description Public API for @schemaroute/docs.
 *
 * Provides two functions:
 *   - `generateOpenAPISpec` — builds an OpenAPI 3.0 spec from SchemaRoute instances
 *   - `mountSwaggerUI`      — mounts Swagger UI on an Express app
 *
 * @example
 * import { generateOpenAPISpec, mountSwaggerUI } from '@schemaroute/docs'
 *
 * const spec = generateOpenAPISpec([categoriesInstance, productsInstance], {
 *   title:     'My API',
 *   version:   '1.0.0',
 *   serverUrl: 'http://localhost:3000',
 * })
 * mountSwaggerUI(app, spec)
 */

export { generateOpenAPISpec } from './spec-builder'
export { mountSwaggerUI }      from './ui'
export type { DocsOptions, OpenAPISpec } from './types'
