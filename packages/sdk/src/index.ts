/**
 * @file index.ts
 * @description Public API for @schemaroute/sdk.
 *
 * `createSDK` is the single entry point — it accepts the API base URL, an
 * array of `SchemaRouteInstance` objects (returned by `createAPI`), and
 * optional default headers. It returns a typed object where each key is a
 * resource name and each value is a `ResourceClient` with full CRUD methods.
 *
 * @example
 * import { createSDK } from '@schemaroute/sdk'
 *
 * const api = createSDK('http://localhost:3000', [categoriesInstance, productsInstance], {
 *   headers: { 'x-api-key': 'secret123' },
 * })
 *
 * const { data, meta } = await api.categories.getAll({ page: 1, search: 'elec' })
 * const product        = await api.products.getOne('abc123')
 * const created        = await api.products.create({ name: 'Laptop', price: 999 })
 * await api.products.delete('abc123')
 */

import type { SchemaRouteInstance } from '@schemaroute/common'
import { createResourceClient }     from './resource-client'
import type { SDKOptions, ResourceClient } from './types'

export { SDKError } from './types'
export type {
  SDKOptions,
  GetAllParams,
  GetOneParams,
  CreateParams,
  UpdateParams,
  DeleteParams,
  ListResponse,
  SingleResponse,
  DeleteResponse,
  ResourceClient,
} from './types'

// ─── SDK Type ─────────────────────────────────────────────────────────────────

/**
 * The SDK object returned by `createSDK`.
 * Each key is a resource name mapped to its `ResourceClient`.
 *
 * @example
 * const api: SchemaRouteSDK<{ categories: Category; products: Product }>
 *   = createSDK(baseUrl, instances)
 */
export type SchemaRouteSDK<TResources extends Record<string, Record<string, unknown>>> = {
  [K in keyof TResources]: ResourceClient<TResources[K]>
}

// ─── createSDK ────────────────────────────────────────────────────────────────

/**
 * Creates a fully typed SDK client from an array of `SchemaRouteInstance`
 * objects. Each instance becomes a named resource on the returned object.
 *
 * Uses native `fetch` — no additional HTTP dependencies required.
 * Throws `SDKError` on non-2xx responses with structured error information.
 *
 * @param baseUrl   - Base URL of the API server (e.g. `'http://localhost:3000'`).
 * @param instances - Array of `SchemaRouteInstance` objects returned by `createAPI`.
 * @param options   - Optional SDK configuration (default headers, etc.).
 * @returns         An object keyed by resource name, each with CRUD methods.
 *
 * @example
 * // With auth headers
 * const api = createSDK('http://localhost:3000', [categoriesInstance, productsInstance], {
 *   headers: { 'x-api-key': 'secret123', 'x-role': 'admin' },
 * })
 *
 * // getAll with filters, search, pagination
 * const { data, meta } = await api.products.getAll({
 *   filter: { status: 'active' },
 *   sort:   'price',
 *   order:  'asc',
 *   page:   1,
 *   limit:  5,
 * })
 *
 * // Per-request header override
 * const created = await api.products.create(
 *   { name: 'Laptop', price: 999, stock: 10 },
 *   { headers: { 'x-api-key': 'secret123' } }
 * )
 */
export function createSDK(
  baseUrl:   string,
  instances: SchemaRouteInstance[],
  options:   SDKOptions = {}
): Record<string, ResourceClient<Record<string, unknown>>> {
  const defaultHeaders = options.headers ?? {}
  const sdk: Record<string, ResourceClient<Record<string, unknown>>> = {}

  for (const instance of instances) {
    sdk[instance.resourceName] = createResourceClient(
      baseUrl,
      instance.resourceName,
      defaultHeaders
    )
  }

  return sdk
}
