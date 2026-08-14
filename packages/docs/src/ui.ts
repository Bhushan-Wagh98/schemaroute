/**
 * @file ui.ts
 * @description Mounts Swagger UI on an Express application using
 * `swagger-ui-express`. Serves the interactive API explorer at the
 * specified path (default: `/api-docs`).
 */

import type { Application } from 'express'
import swaggerUi from 'swagger-ui-express'
import type { OpenAPISpec } from './types'

/**
 * Mounts Swagger UI on an Express app at the given path.
 *
 * Must be called after all routes are registered so the spec reflects
 * the full API surface.
 *
 * @param expressApp  - Express application instance.
 * @param spec        - OpenAPI spec object from `generateOpenAPISpec`.
 * @param docsPath    - URL path to serve Swagger UI. Defaults to `'/api-docs'`.
 *
 * @example
 * mountSwaggerUI(app, spec)
 * // → http://localhost:3000/api-docs
 *
 * mountSwaggerUI(app, spec, '/docs')
 * // → http://localhost:3000/docs
 */
export function mountSwaggerUI(
  expressApp: Application,
  spec:       OpenAPISpec,
  docsPath:   string = '/api-docs'
): void {
  expressApp.use(docsPath, swaggerUi.serve, swaggerUi.setup(spec))
}
