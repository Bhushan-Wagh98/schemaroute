/**
 * @file index.ts
 * @description Public API for @schemaroute/sdk.
 *
 * `createSDK` is the single entry point — it accepts the API base URL, an
 * array of `SchemaRouteInstance` objects (returned by `createAPI`), and
 * optional default headers. It returns a typed object where each key is a
 * resource name and each value is a `ResourceClient` with full CRUD methods.
 *
 * Pass a type map as the generic parameter to get fully typed responses:
 *
 * @example
 * import { createSDK } from '@schemaroute/sdk'
 *
 * interface Product { _id: string; name: string; price: number }
 * interface Category { _id: string; name: string; slug: string }
 *
 * const api = createSDK<{ products: Product; categories: Category }>(
 *   'http://localhost:3000',
 *   [productsInstance, categoriesInstance],
 *   { headers: { 'x-api-key': 'secret123' } }
 * )
 *
 * const { data } = await api.products.getAll({ page: 1 })
 * // data is Product[] — fully typed
 *
 * const product = await api.products.getOne('abc123')
 * // product.data is Product
 *
 * const patched = await api.products.patch('abc123', { price: 799 })
 * // patched.data is Product
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
  PatchParams,
  DeleteParams,
  ListResponse,
  SingleResponse,
  DeleteResponse,
  ResourceClient,
} from './types'

// ─── SDK Type ─────────────────────────────────────────────────────────────────

/**
 * The SDK object returned by `createSDK`.
 * Each key is a resource name mapped to its fully typed `ResourceClient<T>`.
 *
 * @example
 * const api: SchemaRouteSDK<{ products: Product; categories: Category }>
 *   = createSDK<{ products: Product; categories: Category }>(baseUrl, instances)
 */
export type SchemaRouteSDK<TResources extends Record<string, Record<string, unknown>>> = {
  [K in keyof TResources]: ResourceClient<TResources[K]>
}

// ─── createSDK ────────────────────────────────────────────────────────────────

/**
 * Creates a fully typed SDK client from an array of `SchemaRouteInstance`
 * objects. Each instance becomes a named resource on the returned object.
 *
 * Pass a type map as the generic parameter to get fully typed responses.
 * Without the generic, all methods return `Record<string, unknown>`.
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
 * // Untyped — all methods return Record<string, unknown>
 * const api = createSDK('http://localhost:3000', [productsInstance])
 *
 * // Typed — pass your document interfaces as a type map
 * interface Product { _id: string; name: string; price: number }
 * const api = createSDK<{ products: Product }>('http://localhost:3000', [productsInstance])
 *
 * const { data, meta } = await api.products.getAll({ page: 1, limit: 10 })
 * // data is Product[]
 *
 * const patched = await api.products.patch('abc123', { price: 799 })
 * // patched.data is Product
 */
export function createSDK<
  TResources extends Record<string, Record<string, unknown>> = Record<string, Record<string, unknown>>
>(
  baseUrl:   string,
  instances: SchemaRouteInstance[],
  options:   SDKOptions = {}
): SchemaRouteSDK<TResources> {
  const defaultHeaders = options.headers ?? {}
  const sdk: Record<string, ResourceClient<Record<string, unknown>>> = {}

  for (const instance of instances) {
    sdk[instance.resourceName] = createResourceClient(
      baseUrl,
      instance.resourceName,
      defaultHeaders
    )
  }

  return sdk as SchemaRouteSDK<TResources>
}
