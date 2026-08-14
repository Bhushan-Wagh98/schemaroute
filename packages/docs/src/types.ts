/**
 * @file types.ts
 * @description TypeScript interfaces for the OpenAPI 3.0 spec object and
 * the options accepted by `generateOpenAPISpec`.
 */

// ─── Docs Options ─────────────────────────────────────────────────────────────

/** Options passed to `generateOpenAPISpec` to configure the spec metadata. */
export interface DocsOptions {
  /** API title shown in Swagger UI. Defaults to `'SchemaRoute API'`. */
  title?:       string
  /** API version string. Defaults to `'1.0.0'`. */
  version?:     string
  /** Short description shown below the title in Swagger UI. */
  description?: string
  /** Base server URL. Defaults to `'http://localhost:3000'`. */
  serverUrl?:   string
}

// ─── OpenAPI 3.0 Object Interfaces ───────────────────────────────────────────

/** Root OpenAPI 3.0 document object. */
export interface OpenAPISpec {
  openapi:    '3.0.0'
  info:       OpenAPIInfo
  servers:    OpenAPIServer[]
  paths:      Record<string, OpenAPIPathItem>
  components: OpenAPIComponents
}

export interface OpenAPIInfo {
  title:        string
  version:      string
  description?: string
}

export interface OpenAPIServer {
  url: string
}

/** All operations on a single path (GET, POST, PUT, DELETE). */
export type OpenAPIPathItem = Partial<Record<'get' | 'post' | 'put' | 'delete' | 'patch', OpenAPIOperation>>

export interface OpenAPIOperation {
  summary:     string
  operationId: string
  tags:        string[]
  parameters?: OpenAPIParameter[]
  requestBody?: OpenAPIRequestBody
  responses:   Record<string, OpenAPIResponse>
}

export interface OpenAPIParameter {
  name:        string
  in:          'query' | 'path' | 'header'
  required:    boolean
  description?: string
  schema:      OpenAPISchema
}

export interface OpenAPIRequestBody {
  required: true
  content:  { 'application/json': { schema: OpenAPISchema } }
}

export interface OpenAPIResponse {
  description: string
  content?:    { 'application/json': { schema: OpenAPISchema } }
}

/** Subset of JSON Schema / OpenAPI Schema Object used in this generator. */
export interface OpenAPISchema {
  type?:                 string
  format?:               string
  description?:          string
  properties?:           Record<string, OpenAPISchema>
  required?:             string[]
  items?:                OpenAPISchema
  enum?:                 unknown[]
  minimum?:              number
  maximum?:              number
  minLength?:            number
  maxLength?:            number
  example?:              unknown
  additionalProperties?: boolean
  $ref?:                 string
}

export interface OpenAPIComponents {
  schemas: Record<string, OpenAPISchema>
}
