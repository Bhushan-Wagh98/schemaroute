/**
 * @file spec-builder.ts
 * @description Converts an array of `SchemaRouteInstance` objects into a
 * complete OpenAPI 3.0 specification object.
 *
 * For each registered resource it generates:
 *   - A reusable schema component under `components/schemas`
 *   - Path items for every enabled CRUD route
 *   - Query parameters for getAll (filter, sort, pagination, search, fields, populate)
 *   - Request body schemas for create and update
 *   - Standard response envelopes (200, 201, 400, 404, 422, 500)
 */

import type { SchemaRouteInstance, ParsedField, FieldType } from '@schemaroute/common'
import type {
  DocsOptions,
  OpenAPISpec,
  OpenAPIPathItem,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
  OpenAPISchema,
} from './types'

// ─── Field Type → OpenAPI Schema ─────────────────────────────────────────────

/**
 * Maps a SchemaRoute `FieldType` to an OpenAPI schema fragment.
 */
function fieldTypeToSchema(fieldType: FieldType): OpenAPISchema {
  switch (fieldType) {
    case 'string':   return { type: 'string' }
    case 'number':   return { type: 'number' }
    case 'boolean':  return { type: 'boolean' }
    case 'date':     return { type: 'string', format: 'date-time' }
    case 'objectid': return { type: 'string', description: 'MongoDB ObjectId' }
    case 'array':    return { type: 'array', items: { type: 'string' } }
    case 'object':   return { type: 'object', additionalProperties: true }
    default:         return {}
  }
}

/**
 * Converts a single `ParsedField` into an OpenAPI schema property object,
 * including constraints (enum, min, max, minLength, maxLength).
 */
function parsedFieldToSchema(field: ParsedField): OpenAPISchema {
  const base = fieldTypeToSchema(field.type)

  if (field.enum)      base.enum      = field.enum
  if (field.min       !== undefined) base.minimum   = field.min
  if (field.max       !== undefined) base.maximum   = field.max
  if (field.minlength !== undefined) base.minLength = field.minlength
  if (field.maxlength !== undefined) base.maxLength = field.maxlength

  if (field.isArray) {
    return { type: 'array', items: base }
  }

  return base
}

// ─── Schema Component Builder ─────────────────────────────────────────────────

/**
 * Builds a reusable OpenAPI schema object from a `SchemaRouteInstance`.
 * Used under `components/schemas/<ModelName>`.
 */
function buildSchemaComponent(instance: SchemaRouteInstance): OpenAPISchema {
  const properties: Record<string, OpenAPISchema> = {
    _id: { type: 'string', description: 'MongoDB ObjectId' },
  }
  const requiredFields: string[] = []

  for (const field of instance.parsedSchema.fields) {
    properties[field.name] = parsedFieldToSchema(field)
    if (field.required) requiredFields.push(field.name)
  }

  properties['createdAt'] = { type: 'string', format: 'date-time' }
  properties['updatedAt'] = { type: 'string', format: 'date-time' }

  return {
    type:       'object',
    properties,
    ...(requiredFields.length ? { required: requiredFields } : {}),
  }
}

// ─── Standard Responses ───────────────────────────────────────────────────────

function successListResponse(schemaRef: string): OpenAPIResponse {
  return {
    description: 'Success',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data:    { type: 'array', items: { $ref: schemaRef } },
            meta: {
              type: 'object',
              properties: {
                page:       { type: 'number' },
                limit:      { type: 'number' },
                total:      { type: 'number' },
                totalPages: { type: 'number' },
              },
            },
          },
        },
      },
    },
  }
}

function successSingleResponse(schemaRef: string): OpenAPIResponse {
  return {
    description: 'Success',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data:    { $ref: schemaRef },
          },
        },
      },
    },
  }
}

function errorResponse(description: string): OpenAPIResponse {
  return {
    description,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error:   { type: 'string' },
          },
        },
      },
    },
  }
}

function validationErrorResponse(): OpenAPIResponse {
  return {
    description: 'Validation failed',
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error:   { type: 'string', example: 'Validation failed' },
            details: {
              type:  'array',
              items: {
                type: 'object',
                properties: {
                  field:   { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  }
}

// ─── Query Parameters ─────────────────────────────────────────────────────────

/**
 * Builds the standard query parameters for a `getAll` route based on the
 * resource config (pagination mode, search mode, sort, fields, populate).
 */
function buildGetAllParameters(instance: SchemaRouteInstance): OpenAPIParameter[] {
  const params: OpenAPIParameter[] = []
  const config    = instance.config
  const routeConf = config.routes?.getAll

  const paginationMode = routeConf?.pagination ?? config.pagination
  const searchMode     = routeConf?.search     ?? config.search

  // ── Filtering — one param per schema field ────────────────────────────────
  for (const field of instance.parsedSchema.fields) {
    params.push({
      name:        field.name,
      in:          'query',
      required:    false,
      description: `Filter by ${field.name}`,
      schema:      fieldTypeToSchema(field.type),
    })
  }

  // ── Sorting ───────────────────────────────────────────────────────────────
  if (routeConf?.sort !== false) {
    params.push(
      {
        name:        'sort',
        in:          'query',
        required:    false,
        description: 'Field name to sort by',
        schema:      { type: 'string' },
      },
      {
        name:        'order',
        in:          'query',
        required:    false,
        description: 'Sort direction',
        schema:      { type: 'string', enum: ['asc', 'desc'] },
      }
    )
  }

  // ── Field selection ───────────────────────────────────────────────────────
  if (routeConf?.fields !== false) {
    params.push({
      name:        'fields',
      in:          'query',
      required:    false,
      description: 'Comma-separated list of fields to include (e.g. name,price)',
      schema:      { type: 'string' },
    })
  }

  // ── Search ────────────────────────────────────────────────────────────────
  if (searchMode) {
    params.push({
      name:        'search',
      in:          'query',
      required:    false,
      description: searchMode === 'all-fields'
        ? 'Search across all string fields'
        : 'Search in a specific field',
      schema: { type: 'string' },
    })

    if (searchMode === 'single-field') {
      params.push({
        name:        'searchField',
        in:          'query',
        required:    false,
        description: 'Field to search in (required when search=single-field)',
        schema:      { type: 'string' },
      })
    }
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  if (paginationMode === 'page' || paginationMode === 'both') {
    params.push(
      { name: 'page',  in: 'query', required: false, description: 'Page number (default: 1)',   schema: { type: 'number' } },
      { name: 'limit', in: 'query', required: false, description: 'Items per page (default: 10)', schema: { type: 'number' } }
    )
  }
  if (paginationMode === 'cursor' || paginationMode === 'both') {
    params.push(
      { name: 'cursor', in: 'query', required: false, description: 'Cursor value from previous page', schema: { type: 'string' } },
      { name: 'limit',  in: 'query', required: false, description: 'Items per page (default: 10)',    schema: { type: 'number' } }
    )
  }

  // ── Populate ──────────────────────────────────────────────────────────────
  if (instance.parsedSchema.refFields.length > 0) {
    params.push({
      name:        'populate',
      in:          'query',
      required:    false,
      description: `Comma-separated ref fields to populate (e.g. ${instance.parsedSchema.refFields.join(',')})`,
      schema:      { type: 'string' },
    })
  }

  return params
}

// ─── Request Body Builder ─────────────────────────────────────────────────────

/**
 * Builds the request body schema for create/update operations.
 * Uses the full schema component but marks only required fields for create,
 * and makes all fields optional for update (partial update pattern).
 */
function buildRequestBody(instance: SchemaRouteInstance, isCreate: boolean): OpenAPIRequestBody {
  const properties: Record<string, OpenAPISchema> = {}
  const requiredFields: string[] = []

  for (const field of instance.parsedSchema.fields) {
    properties[field.name] = parsedFieldToSchema(field)
    if (isCreate && field.required) requiredFields.push(field.name)
  }

  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties,
          ...(requiredFields.length ? { required: requiredFields } : {}),
        },
      },
    },
  }
}

// ─── Path Item Builder ────────────────────────────────────────────────────────

/**
 * Converts a single `SchemaRouteInstance` into OpenAPI path items.
 * Returns a map of `{ path: OpenAPIPathItem }` entries.
 */
/**
 * Converts a plural resource name to its singular form.
 * Handles the -ies → -y case before the generic -s removal.
 */
function toSingular(pluralName: string): string {
  return pluralName
    .replace(/ies$/i, 'y')
    .replace(/([^s])s$/i, '$1')
}

function buildPathItems(
  instance:  SchemaRouteInstance,
  schemaRef: string
): Record<string, OpenAPIPathItem> {
  const paths: Record<string, OpenAPIPathItem> = {}
  const tag          = instance.resourceName
  const basePath     = `/${instance.resourceName}`
  const idPath       = `${basePath}/{id}`
  const routeConfig  = instance.config.routes ?? {}

  const idParameter: OpenAPIParameter = {
    name:        'id',
    in:          'path',
    required:    true,
    description: 'MongoDB ObjectId of the document',
    schema:      { type: 'string' },
  }

  const singularTag = toSingular(tag)

  // ── GET /:resource ────────────────────────────────────────────────────────
  if (routeConfig.getAll?.enabled !== false) {
    paths[basePath] ??= {}
    const getAllOp: OpenAPIOperation = {
      summary:     `List all ${tag}`,
      operationId: `getAll_${tag}`,
      tags:        [tag],
      parameters:  buildGetAllParameters(instance),
      responses: {
        '200': successListResponse(schemaRef),
        '500': errorResponse('Internal server error'),
      },
    }
    paths[basePath]!.get = getAllOp
  }

  // ── POST /:resource ───────────────────────────────────────────────────────
  if (routeConfig.create?.enabled !== false) {
    paths[basePath] ??= {}
    const createOp: OpenAPIOperation = {
      summary:     `Create a ${singularTag}`,
      operationId: `create_${tag}`,
      tags:        [tag],
      requestBody: buildRequestBody(instance, true),
      responses: {
        '201': successSingleResponse(schemaRef),
        '422': validationErrorResponse(),
        '500': errorResponse('Internal server error'),
      },
    }
    paths[basePath]!.post = createOp
  }

  // ── GET /:resource/:id ────────────────────────────────────────────────────
  if (routeConfig.getOne?.enabled !== false) {
    paths[idPath] ??= {}
    const getOneOp: OpenAPIOperation = {
      summary:     `Get a ${singularTag} by ID`,
      operationId: `getOne_${tag}`,
      tags:        [tag],
      parameters:  [idParameter],
      responses: {
        '200': successSingleResponse(schemaRef),
        '400': errorResponse('Invalid id format'),
        '404': errorResponse('Resource not found'),
        '500': errorResponse('Internal server error'),
      },
    }
    paths[idPath]!.get = getOneOp
  }

  // ── PUT /:resource/:id ────────────────────────────────────────────────────
  if (routeConfig.update?.enabled !== false) {
    paths[idPath] ??= {}
    const updateOp: OpenAPIOperation = {
      summary:     `Update a ${singularTag} by ID`,
      operationId: `update_${tag}`,
      tags:        [tag],
      parameters:  [idParameter],
      requestBody: buildRequestBody(instance, false),
      responses: {
        '200': successSingleResponse(schemaRef),
        '400': errorResponse('Invalid id format'),
        '404': errorResponse('Resource not found'),
        '422': validationErrorResponse(),
        '500': errorResponse('Internal server error'),
      },
    }
    paths[idPath]!.put = updateOp
  }

  // ── DELETE /:resource/:id ─────────────────────────────────────────────────
  if (routeConfig.delete?.enabled !== false) {
    paths[idPath] ??= {}
    const deleteOp: OpenAPIOperation = {
      summary:     `Delete a ${singularTag} by ID`,
      operationId: `delete_${tag}`,
      tags:        [tag],
      parameters:  [idParameter],
      responses: {
        '200': {
          description: 'Deleted successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data:    { type: 'object', properties: { id: { type: 'string' } } },
                },
              },
            },
          },
        },
        '400': errorResponse('Invalid id format'),
        '404': errorResponse('Resource not found'),
        '500': errorResponse('Internal server error'),
      },
    }
    paths[idPath]!.delete = deleteOp
  }

  // ── Custom routes ─────────────────────────────────────────────────────────
  for (const customRoute of instance.config.custom ?? []) {
    paths[customRoute.path] ??= {}
    const method = customRoute.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete' | 'patch'
    // Derive a readable summary from the path (e.g. /products/out-of-stock → Get out of stock products)
    const pathSegment = customRoute.path.split('/').pop()?.replace(/-/g, ' ') ?? customRoute.path
    const customSummary = `${customRoute.method.charAt(0) + customRoute.method.slice(1).toLowerCase()} ${pathSegment} ${tag}`
    paths[customRoute.path]![method] = {
      summary:     customSummary,
      operationId: `${method}_${customRoute.path.replace(/\//g, '_').replace(/^_/, '')}`,
      tags:        [tag],
      responses: {
        '200': { description: 'Success' },
        '500': errorResponse('Internal server error'),
      },
    }
  }

  return paths
}

// ─── generateOpenAPISpec ──────────────────────────────────────────────────────

/**
 * Generates a complete OpenAPI 3.0 specification object from an array of
 * `SchemaRouteInstance` objects returned by `createAPI`.
 *
 * @param instances - Array of `SchemaRouteInstance` objects, one per resource.
 * @param options   - Optional metadata (title, version, description, serverUrl).
 * @returns         A complete OpenAPI 3.0 spec object ready for Swagger UI.
 *
 * @example
 * const spec = generateOpenAPISpec([categoriesInstance, productsInstance], {
 *   title:     'My API',
 *   version:   '1.0.0',
 *   serverUrl: 'http://localhost:3000',
 * })
 */
export function generateOpenAPISpec(
  instances: SchemaRouteInstance[],
  options:   DocsOptions = {}
): OpenAPISpec {
  const {
    title       = 'SchemaRoute API',
    version     = '1.0.0',
    description,
    serverUrl   = 'http://localhost:3000',
  } = options

  const allPaths:   Record<string, OpenAPIPathItem> = {}
  const allSchemas: Record<string, OpenAPISchema>   = {}

  for (const instance of instances) {
    // Derive PascalCase model name from plural resource name (e.g. products → Product)
    const modelName = toSingular(instance.resourceName)
    const capitalisedModelName = modelName.charAt(0).toUpperCase() + modelName.slice(1)
    const schemaRef = `#/components/schemas/${capitalisedModelName}`

    allSchemas[capitalisedModelName] = buildSchemaComponent(instance)

    const pathItems = buildPathItems(instance, schemaRef)
    for (const [path, item] of Object.entries(pathItems)) {
      allPaths[path] = { ...(allPaths[path] ?? {}), ...item }
    }
  }

  return {
    openapi: '3.0.0',
    info: {
      title,
      version,
      ...(description ? { description } : {}),
    },
    servers: [{ url: serverUrl }],
    paths:   allPaths,
    components: { schemas: allSchemas },
  }
}
