/**
 * @file adapter-utils.ts
 * @description Shared utilities used by all SchemaRoute framework adapters
 * (Express, Fastify, etc.). Centralises logic that is identical across adapters
 * so it is written and tested once.
 *
 * Exports:
 *   - `deriveModelName`      — plural resource name → singular PascalCase model name
 *   - `isValidObjectId`      — 24-char hex ObjectId format check
 *   - `toMongoosePopulate`   — normalises a `PopulateOption` to a Mongoose populate arg
 *   - `registerModel`        — registers a schema on both global and connection registries
 *   - `makeResolveModel`     — creates a lazy model factory with a typed disconnect error
 *   - `assertConnected`      — throws a clear error when called before mongoose.connect()
 */

import type { Schema, Model, Mongoose } from 'mongoose'
import type { PopulateOption } from './types'

// ─── Model Name ───────────────────────────────────────────────────────────────

/**
 * Derives the singular PascalCase Mongoose model name from a plural resource name.
 * Matches Mongoose's `ref` convention so cross-model `populate` works correctly.
 *
 * @example
 * deriveModelName('categories') // → 'Category'
 * deriveModelName('products')   // → 'Product'
 * deriveModelName('users')      // → 'User'
 */
export function deriveModelName(pluralResourceName: string): string {
  const singularName = pluralResourceName
    .replace(/ies$/i, 'y')  // categories → category
    .replace(/s$/i,   '')   // products   → product
  return singularName.charAt(0).toUpperCase() + singularName.slice(1)
}

// ─── ObjectId Validation ──────────────────────────────────────────────────────

/**
 * Validates that a string is a valid 24-character hexadecimal MongoDB ObjectId.
 * Used to return a clean 400 response instead of letting Mongoose throw a
 * `CastError` which would result in a 500.
 */
export function isValidObjectId(candidateId: string): boolean {
  return /^[a-f\d]{24}$/i.test(candidateId)
}

// ─── Populate ─────────────────────────────────────────────────────────────────

/**
 * Normalises a `PopulateOption` (string or `{ path, select }` object) to the
 * Mongoose-compatible populate argument shape.
 */
export function toMongoosePopulate(option: PopulateOption): { path: string; select?: string } {
  return typeof option === 'string' ? { path: option } : option
}

// ─── Connection Guard ─────────────────────────────────────────────────────────

/**
 * Throws a descriptive error when `createAPI` is called before
 * `mongoose.connect()` has resolved. Prevents silent query failures caused
 * by registering routes on a disconnected connection.
 *
 * @param resourceName  - Used in the error message for clarity.
 * @param mongooseRef   - The mongoose instance to check.
 */
export function assertConnected(resourceName: string, mongooseRef: Mongoose): void {
  const readyState = mongooseRef.connection?.readyState
  if (readyState === 1) return

  const stateLabel = ['disconnected', 'connected', 'connecting', 'disconnecting'][readyState ?? 0]
  throw new Error(
    `[schemaroute] createAPI('${resourceName}') was called while mongoose connection is "${stateLabel}".\n` +
    `You must call createAPI inside the .then() callback of mongoose.connect(), ` +
    `after the connection is fully open.\n\n` +
    `Example:\n` +
    `  mongoose.connect(process.env.MONGO_URI).then(() => {\n` +
    `    createAPI(app, ${resourceName[0]!.toUpperCase() + resourceName.slice(1)}Schema, '${resourceName}', config, mongoose)\n` +
    `  })`
  )
}

// ─── Model Registration ───────────────────────────────────────────────────────

/**
 * Registers a Mongoose schema on both the global model registry and the active
 * connection's model registry. Both registrations are needed so that
 * cross-model `populate` works correctly with Atlas connections.
 *
 * Safe to call multiple times — skips registration if the model already exists.
 *
 * @param mongooseRef  - The mongoose instance.
 * @param modelName    - The PascalCase model name (e.g. `'Product'`).
 * @param schema       - The Mongoose schema to register.
 */
export function registerModel(mongooseRef: Mongoose, modelName: string, schema: Schema): void {
  if (!mongooseRef.models[modelName]) {
    mongooseRef.model(modelName, schema)
  }
  if (mongooseRef.connection && !mongooseRef.connection.models[modelName]) {
    try {
      mongooseRef.connection.model(modelName, schema)
    } catch {
      // Model already registered on this connection — safe to ignore
    }
  }
}

// ─── Lazy Model Factory ───────────────────────────────────────────────────────

/**
 * Creates a lazy model factory that resolves the Mongoose model at request time
 * rather than at registration time. This ensures the active connection is always
 * used, even if the connection drops and reconnects between requests.
 *
 * Throws a typed `MONGOOSE_DISCONNECTED` error when the connection is not open
 * so adapters can return a `503` instead of letting Mongoose hang or surface a
 * cryptic internal error.
 *
 * @param mongooseRef - The mongoose instance.
 * @param modelName   - The PascalCase model name to resolve.
 */
export function makeResolveModel(mongooseRef: Mongoose, modelName: string): () => Model<unknown> {
  return (): Model<unknown> => {
    if (mongooseRef.connection?.readyState !== 1) {
      const err = new Error(
        `[schemaroute] MongoDB connection lost — readyState: ${mongooseRef.connection?.readyState ?? 0}`
      )
      ;(err as Error & { code: string }).code = 'MONGOOSE_DISCONNECTED'
      throw err
    }
    return mongooseRef.connection.models[modelName] ?? mongooseRef.models[modelName]!
  }
}
