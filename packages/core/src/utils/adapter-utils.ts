/**
 * @file utils/adapter-utils.ts
 * @description Shared utilities used by all SchemaRoute framework adapters.
 * Centralises logic that is identical across adapters so it is written and
 * tested once.
 *
 * Exports:
 *   - `deriveModelName`    — plural resource name → singular PascalCase model name
 *   - `isValidObjectId`    — 24-char hex ObjectId format check
 *   - `toMongoosePopulate` — normalises a `PopulateOption` to a Mongoose populate arg
 *   - `assertConnected`    — throws a clear error when called before mongoose.connect()
 *   - `registerModel`      — registers a schema on both global and connection registries
 *   - `makeResolveModel`   — creates a lazy model factory with a typed disconnect error
 */

import type { Schema, Model, Mongoose } from 'mongoose'
import type { PopulateOption } from '../types'

/**
 * Derives the singular PascalCase Mongoose model name from a plural resource name.
 * Matches Mongoose's `ref` convention so cross-model `populate` works correctly.
 *
 * @example
 * deriveModelName('categories') // → 'Category'
 * deriveModelName('products')   // → 'Product'
 */
export function deriveModelName(pluralResourceName: string): string {
  const singularName = pluralResourceName
    .replace(/ies$/i, 'y')
    .replace(/s$/i,   '')
  return singularName.charAt(0).toUpperCase() + singularName.slice(1)
}

/**
 * Validates that a string is a valid 24-character hexadecimal MongoDB ObjectId.
 * Used to return a clean 400 instead of letting Mongoose throw a `CastError` 500.
 */
export function isValidObjectId(candidateId: string): boolean {
  return /^[a-f\d]{24}$/i.test(candidateId)
}

/**
 * Normalises a `PopulateOption` (string or `{ path, select }` object) to the
 * Mongoose-compatible populate argument shape.
 */
export function toMongoosePopulate(option: PopulateOption): { path: string; select?: string } {
  return typeof option === 'string' ? { path: option } : option
}

/**
 * Throws a descriptive error when `createAPI` is called before
 * `mongoose.connect()` has resolved. Prevents silent query failures.
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

/**
 * Registers a Mongoose schema on both the global model registry and the active
 * connection's model registry. Both registrations are needed so that
 * cross-model `populate` works correctly with Atlas connections.
 *
 * Safe to call multiple times — skips registration if the model already exists.
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

/**
 * Creates a lazy model factory that resolves the Mongoose model at request time.
 * Ensures the active connection is always used, even after reconnects.
 *
 * Throws a typed `MONGOOSE_DISCONNECTED` error when the connection is not open
 * so adapters can return 503 instead of a cryptic internal error.
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
