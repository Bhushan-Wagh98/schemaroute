/**
 * @file resource-client.ts
 * @description `ResourceClient` — a typed HTTP client for a single SchemaRoute
 * resource. Wraps native `fetch` and maps CRUD operations to the correct
 * HTTP method and path.
 *
 * All methods throw `SDKError` on non-2xx responses so callers can catch
 * structured error information (status, message, validation details).
 */

import type {
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
import { SDKError } from './types'

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Serialises a `GetAllParams` object into a URL query string.
 * `filter` fields are spread directly into the query string alongside
 * the reserved params (sort, search, pagination, etc.).
 */
function buildQueryString(params: GetAllParams): string {
  const queryEntries: [string, string][] = []

  // Spread filter fields directly into query params
  if (params.filter) {
    for (const [key, value] of Object.entries(params.filter)) {
      if (value !== undefined && value !== null) {
        queryEntries.push([key, String(value)])
      }
    }
  }

  const reservedParams: Array<[string, string | number | undefined]> = [
    ['sort',        params.sort],
    ['order',       params.order],
    ['fields',      params.fields],
    ['search',      params.search],
    ['searchField', params.searchField],
    ['page',        params.page],
    ['limit',       params.limit],
    ['cursor',      params.cursor],
    ['populate',    params.populate],
  ]

  for (const [key, value] of reservedParams) {
    if (value !== undefined && value !== null) {
      queryEntries.push([key, String(value)])
    }
  }

  if (queryEntries.length === 0) return ''
  return '?' + new URLSearchParams(queryEntries).toString()
}

/**
 * Merges SDK-level default headers with per-request header overrides.
 */
function mergeHeaders(
  defaultHeaders: Record<string, string>,
  requestHeaders?: Record<string, string>
): Record<string, string> {
  return { ...defaultHeaders, ...requestHeaders }
}

/**
 * Executes a fetch request and returns the parsed JSON body.
 * Throws `SDKError` when the response status is not in the 2xx range.
 */
async function executeRequest<T>(
  url:     string,
  options: RequestInit
): Promise<T> {
  const response = await fetch(url, options)

  // Consume the body once as text, then attempt a JSON parse.
  // This avoids the double-read bug: response.body is a ReadableStream that
  // can only be consumed once — calling response.json() and then
  // response.text() in the catch block would return an empty string.
  const rawText = await response.text().catch(() => '')

  let body: Record<string, unknown> | null = null
  try {
    body = JSON.parse(rawText) as Record<string, unknown>
  } catch {
    // Non-JSON body (e.g. 502 HTML error page from a proxy)
    throw new SDKError(response.status, rawText.trim() || response.statusText)
  }

  if (!response.ok) {
    throw new SDKError(
      response.status,
      (body['error'] as string) ?? response.statusText,
      body['details'] as { field: string; message: string }[] | undefined
    )
  }

  return body as T
}

// ─── ResourceClient Factory ───────────────────────────────────────────────────

/**
 * Creates a typed `ResourceClient` for a single resource.
 *
 * @param baseUrl        - Base URL of the API (e.g. `'http://localhost:3000'`).
 * @param resourceName   - Plural resource name (e.g. `'products'`).
 * @param defaultHeaders - SDK-level headers merged into every request.
 */
export function createResourceClient<T extends Record<string, unknown>>(
  baseUrl:        string,
  resourceName:   string,
  defaultHeaders: Record<string, string>
): ResourceClient<T> {
  const resourceUrl = `${baseUrl.replace(/\/$/, '')}/${resourceName}`

  const jsonHeaders = { 'Content-Type': 'application/json', ...defaultHeaders }

  return {
    /**
     * `GET /:resource` — fetch a paginated, filtered list of documents.
     */
    async getAll(params: GetAllParams = {}): Promise<ListResponse<T>> {
      const { headers: requestHeaders, ...queryParams } = params
      const url     = `${resourceUrl}${buildQueryString(queryParams)}`
      const headers = mergeHeaders(defaultHeaders, requestHeaders)

      const responseBody = await executeRequest<{ data: T[]; meta: Record<string, unknown> }>(
        url, { method: 'GET', headers }
      )

      return {
        data: responseBody.data ?? [],
        meta: responseBody.meta ?? {},
      }
    },

    /**
     * `GET /:resource/:id` — fetch a single document by ObjectId.
     */
    async getOne(id: string, params: GetOneParams = {}): Promise<SingleResponse<T>> {
      const url     = `${resourceUrl}/${id}`
      const headers = mergeHeaders(defaultHeaders, params.headers)

      const responseBody = await executeRequest<{ data: T }>(
        url, { method: 'GET', headers }
      )

      return { data: responseBody.data }
    },

    /**
     * `POST /:resource` — create a new document.
     */
    async create(body: Partial<T>, params: CreateParams = {}): Promise<SingleResponse<T>> {
      const headers = mergeHeaders(jsonHeaders, params.headers)

      const responseBody = await executeRequest<{ data: T }>(
        resourceUrl,
        { method: 'POST', headers, body: JSON.stringify(body) }
      )

      return { data: responseBody.data }
    },

    /**
     * `PUT /:resource/:id` — full document replacement.
     */
    async update(id: string, body: Partial<T>, params: UpdateParams = {}): Promise<SingleResponse<T>> {
      const url     = `${resourceUrl}/${id}`
      const headers = mergeHeaders(jsonHeaders, params.headers)

      const responseBody = await executeRequest<{ data: T }>(
        url,
        { method: 'PUT', headers, body: JSON.stringify(body) }
      )

      return { data: responseBody.data }
    },

    /**
     * `PATCH /:resource/:id` — partial document update (only sent fields written).
     */
    async patch(id: string, body: Partial<T>, params: PatchParams = {}): Promise<SingleResponse<T>> {
      const url     = `${resourceUrl}/${id}`
      const headers = mergeHeaders(jsonHeaders, params.headers)

      const responseBody = await executeRequest<{ data: T }>(
        url,
        { method: 'PATCH', headers, body: JSON.stringify(body) }
      )

      return { data: responseBody.data }
    },

    /**
     * `DELETE /:resource/:id` — delete a document by ObjectId.
     */
    async delete(id: string, params: DeleteParams = {}): Promise<DeleteResponse> {
      const url     = `${resourceUrl}/${id}`
      const headers = mergeHeaders(defaultHeaders, params.headers)

      const responseBody = await executeRequest<{ data: { id: string } }>(
        url, { method: 'DELETE', headers }
      )

      return { data: responseBody.data }
    },
  }
}
