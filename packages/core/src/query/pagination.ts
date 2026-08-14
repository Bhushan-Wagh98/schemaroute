/**
 * @file query/pagination.ts
 * @description Resolves pagination state from query params and builds the
 * response meta object for list endpoints.
 *
 * Supports two strategies:
 *   - Page-based   (`?page=2&limit=10`)  — offset/skip approach
 *   - Cursor-based (`?cursor=<id>&limit=10`) — _id greater-than approach
 */

import type { PaginationMode, ResponseMeta } from '../types'
import type { QueryParams, PagePagination, CursorPagination } from './types'

const DEFAULT_PAGE_LIMIT = 10
const MAX_PAGE_LIMIT     = 100

/**
 * Resolves the pagination state from query params and the configured strategy.
 * Returns `null` when pagination is disabled (`false`) or not configured.
 *
 * @param queryParams       - Raw query params containing `page`, `limit`, `cursor`.
 * @param paginationMode    - The pagination strategy from route/resource config.
 * @returns                 Resolved pagination state, or `null` if disabled.
 */
export function resolvePagination(
  queryParams:    QueryParams,
  paginationMode: PaginationMode | undefined
): PagePagination | CursorPagination | null {
  if (!paginationMode) return null

  const rawLimit        = queryParams.limit
  const requestedLimit  = parseInt(rawLimit ?? String(DEFAULT_PAGE_LIMIT))
  if (rawLimit !== undefined && (isNaN(requestedLimit) || requestedLimit <= 0)) {
    return { type: 'error', message: 'limit must be a positive integer' } as unknown as null
  }
  const clampedPageLimit = Math.min(
    isNaN(requestedLimit) ? DEFAULT_PAGE_LIMIT : requestedLimit,
    MAX_PAGE_LIMIT
  )

  const shouldUseCursorPagination =
    paginationMode === 'cursor' ||
    (paginationMode === 'both' && !!queryParams.cursor)

  const shouldUsePagePagination =
    paginationMode === 'page' ||
    (paginationMode === 'both' && !queryParams.cursor)

  if (shouldUsePagePagination) {
    const rawPage        = queryParams.page
    const requestedPage  = parseInt(rawPage ?? '1')
    if (rawPage !== undefined && (isNaN(requestedPage) || requestedPage < 1)) {
      return { type: 'error', message: 'page must be a positive integer' } as unknown as null
    }
    const currentPage    = isNaN(requestedPage) ? 1 : requestedPage
    const skipCount      = (currentPage - 1) * clampedPageLimit

    return {
      type:  'page',
      page:  currentPage,
      limit: clampedPageLimit,
      skip:  skipCount,
    }
  }

  if (shouldUseCursorPagination) {
    return {
      type:   'cursor',
      cursor: queryParams.cursor ?? null,
      limit:  clampedPageLimit,
    }
  }

  return null
}

/**
 * Builds the `meta` object included in list responses.
 * Returns an empty object when pagination is disabled.
 *
 * @param resolvedPagination - Pagination state from `resolvePagination`.
 * @param totalDocumentCount - Total documents matching the current filter.
 * @param nextPageCursor     - Cursor for the next page (cursor pagination only).
 * @returns                  A `ResponseMeta` object for the response envelope.
 */
export function buildResponseMeta(
  resolvedPagination: PagePagination | CursorPagination | null,
  totalDocumentCount: number,
  nextPageCursor?:    string
): ResponseMeta {
  if (!resolvedPagination) return {}

  if (resolvedPagination.type === 'page') {
    return {
      page:       resolvedPagination.page,
      limit:      resolvedPagination.limit,
      total:      totalDocumentCount,
      totalPages: Math.ceil(totalDocumentCount / resolvedPagination.limit),
    }
  }

  // Cursor pagination meta
  return {
    limit:      resolvedPagination.limit,
    total:      totalDocumentCount,
    ...(nextPageCursor !== undefined ? { nextCursor: nextPageCursor } : {}),
  }
}
