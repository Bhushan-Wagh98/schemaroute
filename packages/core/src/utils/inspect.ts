/**
 * @file utils/inspect.ts
 * @description `inspectAPI` — prints a human-readable route table for a
 * `SchemaRouteInstance` to stdout. Directly attacks the "magic" problem by
 * making every route, middleware, and capability visible at a glance.
 *
 * All data comes from the existing `SchemaRouteInstance` — no new internals needed.
 */

import type { SchemaRouteInstance, GetAllRouteConfig } from '../types'

/**
 * Prints a formatted route table for a `SchemaRouteInstance` to stdout.
 *
 * @example
 * const instance = createAPI(app, ProductSchema, 'products', { ... }, mongoose)
 * inspectAPI(instance)
 *
 * // [schemaroute] products
 * //
 * //   GET    /products                      public
 * //   POST   /products                      middleware: [requireAuth]
 * //   ...
 * //   Query:    filter ✓  sort ✓  pagination: page  search: all-fields
 * //   Exposed:  name, price, status
 * //   Writable: name, price, status
 */
export function inspectAPI(instance: SchemaRouteInstance): void {
  const { routes, config, resourceName } = instance
  const lines: string[] = [`\n[schemaroute] ${resourceName}\n`]

  // ── Route table ───────────────────────────────────────────────────────────
  for (const route of routes) {
    const method = route.method.padEnd(6)
    const path   = route.path.padEnd(30)

    let detail: string
    if (route.operation === 'custom') {
      detail = 'custom'
    } else if (route.operation === 'restore' || route.operation === 'purge') {
      detail = route.middleware.length > 0
        ? `middleware: [${route.middleware.map(fn => fn.name || 'anonymous').join(', ')}]`
        : 'no middleware'
    } else if ((route.config as { public?: boolean }).public) {
      detail = 'public'
    } else if (route.middleware.length > 0) {
      detail = `middleware: [${route.middleware.map(fn => fn.name || 'anonymous').join(', ')}]`
    } else {
      detail = 'no middleware'
    }

    lines.push(`  ${method} ${path} ${detail}`)
  }

  // ── Query capabilities ────────────────────────────────────────────────────
  const getAllRoute  = routes.find(r => r.operation === 'getAll')
  const getAllConfig = getAllRoute?.config as GetAllRouteConfig | undefined
  const pagination  = getAllConfig?.pagination ?? config.pagination ?? false
  const search      = getAllConfig?.search     ?? config.search     ?? false
  const sort        = getAllConfig?.sort       ?? false

  lines.push(`\n  Query:    filter ✓  ${sort ? 'sort ✓' : 'sort ✗'}  ${getAllConfig?.fields ? 'fields ✓' : 'fields ✗'}  pagination: ${pagination || 'off'}  search: ${search || 'off'}`)

  // ── Populate ──────────────────────────────────────────────────────────────
  const populate = getAllConfig?.populate ?? config.populate
  if (populate?.length) {
    const str = populate.map(p =>
      typeof p === 'string' ? p : `${p.path}${p.select ? ` (select: ${p.select})` : ''}`
    ).join(', ')
    lines.push(`  Populate: ${str}`)
  }

  // ── Expose / Writable ─────────────────────────────────────────────────────
  if (config.expose?.length)   lines.push(`  Exposed:  ${config.expose.join(', ')}`)
  if (config.writable?.length) lines.push(`  Writable: ${config.writable.join(', ')}`)

  console.log(lines.join('\n'))
}
