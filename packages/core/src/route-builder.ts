/**
 * @file route-builder.ts
 * @description Builds an array of framework-agnostic `RouteDefinition` objects
 * from a `ResourceConfig`. Adapters (e.g. `@schemaroute/express`) consume
 * these descriptors to register routes on their respective router.
 *
 * Route registration order:
 *   1. Custom routes  — registered first to prevent `/:id` catching named paths
 *   2. CRUD routes    — getAll, getOne, create, update, patch, delete
 *
 * Prefix:
 *   When `config.prefix` is set (e.g. `'/v1'`), it is prepended to every
 *   auto-generated CRUD path. Custom routes define their own full path and
 *   are not affected by prefix.
 */

import type {
  ResourceConfig,
  RouteDefinition,
  MiddlewareFn,
  GetAllRouteConfig,
  GetOneRouteConfig,
  CreateRouteConfig,
  UpdateRouteConfig,
  PatchRouteConfig,
  DeleteRouteConfig,
} from './types'

/** Default route options applied when the user does not provide a route config. */
const ROUTE_DEFAULTS = {
  getAll: { enabled: true, public: false },
  getOne: { enabled: true, public: false },
  create: { enabled: true, public: false },
  update: { enabled: true, public: false },
  patch:  { enabled: true, public: false },
  delete: { enabled: true, public: false },
} as const

/**
 * Extracts the middleware array from a route config, returning an empty array
 * when no middleware is defined.
 */
function resolveMiddleware(routeConfig: { middleware?: MiddlewareFn[] }): MiddlewareFn[] {
  return routeConfig.middleware ?? []
}

/**
 * Builds the complete list of `RouteDefinition` objects for a resource.
 * Each CRUD operation is included unless explicitly disabled via `enabled: false`.
 * Custom routes are appended at the end of the array but must be registered
 * by the adapter before `/:id` routes.
 *
 * @param resourceName - Plural resource name used as the URL base path (e.g. `'products'`).
 * @param config       - Resource-level configuration including per-route overrides.
 * @returns            Array of framework-agnostic route descriptors.
 *
 * @example
 * const routes = buildRoutes('products', {
 *   routes: {
 *     create: { validation: true, middleware: [requireAuth] },
 *     delete: { enabled: false },
 *   },
 * })
 */
export function buildRoutes(resourceName: string, config: ResourceConfig): RouteDefinition[] {
  const routeOverrides = config.routes ?? {}
  // Strip trailing slash so prefix '/v1/' and '/v1' both produce '/v1/products'
  const prefix         = config.prefix ? config.prefix.replace(/\/+$/, '') : ''
  const basePath       = `${prefix}/${resourceName}`
  const definitions: RouteDefinition[] = []

  // ── GET /:resource ────────────────────────────────────────────────────────
  const getAllConfig: GetAllRouteConfig = { ...ROUTE_DEFAULTS.getAll, ...routeOverrides.getAll }
  if (getAllConfig.enabled) {
    definitions.push({
      method:     'GET',
      path:       basePath,
      operation:  'getAll',
      middleware: resolveMiddleware(getAllConfig),
      rateLimit:  getAllConfig.rateLimit,
      config:     getAllConfig,
    })
  }

  // ── GET /:resource/:id ────────────────────────────────────────────────────
  const getOneConfig: GetOneRouteConfig = { ...ROUTE_DEFAULTS.getOne, ...routeOverrides.getOne }
  if (getOneConfig.enabled) {
    definitions.push({
      method:     'GET',
      path:       `${basePath}/:id`,
      operation:  'getOne',
      middleware: resolveMiddleware(getOneConfig),
      rateLimit:  getOneConfig.rateLimit,
      config:     getOneConfig,
    })
  }

  // ── POST /:resource ───────────────────────────────────────────────────────
  const createConfig: CreateRouteConfig = { ...ROUTE_DEFAULTS.create, ...routeOverrides.create }
  if (createConfig.enabled) {
    definitions.push({
      method:     'POST',
      path:       basePath,
      operation:  'create',
      middleware: resolveMiddleware(createConfig),
      rateLimit:  createConfig.rateLimit,
      config:     createConfig,
    })
  }

  // ── PUT /:resource/:id ────────────────────────────────────────────────────
  const updateConfig: UpdateRouteConfig = { ...ROUTE_DEFAULTS.update, ...routeOverrides.update }
  if (updateConfig.enabled) {
    definitions.push({
      method:     'PUT',
      path:       `${basePath}/:id`,
      operation:  'update',
      middleware: resolveMiddleware(updateConfig),
      rateLimit:  updateConfig.rateLimit,
      config:     updateConfig,
    })
  }

  // ── PATCH /:resource/:id ──────────────────────────────────────────────────
  const patchConfig: PatchRouteConfig = { ...ROUTE_DEFAULTS.patch, ...routeOverrides.patch }
  if (patchConfig.enabled) {
    definitions.push({
      method:     'PATCH',
      path:       `${basePath}/:id`,
      operation:  'patch',
      middleware: resolveMiddleware(patchConfig),
      rateLimit:  patchConfig.rateLimit,
      config:     patchConfig,
    })
  }

  // ── DELETE /:resource/:id ─────────────────────────────────────────────────
  const deleteConfig: DeleteRouteConfig = { ...ROUTE_DEFAULTS.delete, ...routeOverrides.delete }
  if (deleteConfig.enabled) {
    definitions.push({
      method:     'DELETE',
      path:       `${basePath}/:id`,
      operation:  'delete',
      middleware: resolveMiddleware(deleteConfig),
      rateLimit:  deleteConfig.rateLimit,
      config:     deleteConfig,
    })
  }

  // ── Custom routes ─────────────────────────────────────────────────────────
  // Appended last in the array; adapters must register these BEFORE /:id routes
  // to prevent named paths (e.g. /products/active) being caught by the id param.
  for (const customRoute of config.custom ?? []) {
    definitions.push({
      method:     customRoute.method,
      path:       customRoute.path,
      operation:  'custom',
      // handler is appended after middleware so it runs last in the chain
      middleware: [...(customRoute.middleware ?? []), customRoute.handler],
      config:     customRoute,
    })
  }

  return definitions
}
