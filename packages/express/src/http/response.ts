/**
 * @file http/response.ts
 * @description Normalised HTTP response helpers used by all route handlers.
 * Centralises the success/error envelope shape so every handler responds
 * consistently without duplicating JSON structure logic.
 */

import type { Response } from 'express'
import type { ResponseShapeFn } from '@schemaroute/core'

/**
 * Sends a normalised success response.
 *
 * When a custom `responseEnvelopeFn` is provided it takes full control of the
 * response shape. Otherwise the default envelope is:
 * `{ success: true, data, meta? }` — `meta` is omitted when empty.
 *
 * @param expressResponse   - The Express response object.
 * @param responseData      - The document(s) or payload to send.
 * @param responseMeta      - Pagination / collection metadata (optional).
 * @param responseEnvelopeFn- Optional custom envelope function from resource config.
 * @param httpStatusCode    - HTTP status code (defaults to 200).
 */
export function sendSuccessResponse(
  expressResponse:    Response,
  responseData:       unknown,
  responseMeta:       Record<string, unknown> = {},
  responseEnvelopeFn?: ResponseShapeFn,
  httpStatusCode:     number = 200
): void {
  const hasMetaContent = Object.keys(responseMeta).length > 0

  const responseBody = responseEnvelopeFn
    ? responseEnvelopeFn(responseData, responseMeta)
    : { success: true, data: responseData, ...(hasMetaContent ? { meta: responseMeta } : {}) }

  expressResponse.status(httpStatusCode).json(responseBody)
}

/**
 * Sends a normalised error response.
 *
 * @param expressResponse - The Express response object.
 * @param httpStatusCode  - HTTP status code (e.g. 400, 404, 422, 500).
 * @param errorMessage    - Human-readable error description.
 * @param errorDetails    - Optional structured details (e.g. validation error array).
 */
export function sendErrorResponse(
  expressResponse: Response,
  httpStatusCode:  number,
  errorMessage:    string,
  errorDetails?:   unknown
): void {
  expressResponse.status(httpStatusCode).json({
    success: false,
    error:   errorMessage,
    ...(errorDetails !== undefined ? { details: errorDetails } : {}),
  })
}
