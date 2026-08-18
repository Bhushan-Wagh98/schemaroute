/**
 * @file utils/resolve-mongoose.ts
 * @description Resolves the Mongoose schema and instance from either a raw
 * Mongoose Schema or an already-registered Mongoose Model.
 *
 * When a Model is passed, SchemaRoute extracts its schema and connection
 * automatically — no need to pass `mongoose` as the 5th argument to `createAPI`.
 * When a Schema is passed, the caller must provide the mongoose instance.
 */

import type { Schema, Model as MongooseModel, Mongoose } from 'mongoose'

export interface ResolvedMongoose {
  schema:      Schema
  mongooseRef: Mongoose
  /** `null` when a Schema is passed — caller derives the name via `deriveModelName`. */
  modelName:   string | null
  isModel:     boolean
}

/**
 * Detects whether the second argument to `createAPI` is a Mongoose Model
 * or a plain Schema, then resolves the schema, mongoose instance, and model
 * name accordingly.
 */
export function resolveMongoose(
  schemaOrModel:    Schema | MongooseModel<unknown>,
  mongooseInstance?: Mongoose
): ResolvedMongoose {
  const isModel =
    schemaOrModel != null &&
    typeof (schemaOrModel as MongooseModel<unknown>).db === 'object' &&
    (schemaOrModel as MongooseModel<unknown>).schema instanceof Object

  const schema: Schema = isModel
    ? (schemaOrModel as MongooseModel<unknown>).schema as Schema
    : schemaOrModel as Schema

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mongooseRef: Mongoose =
    mongooseInstance ??
    (isModel ? (schemaOrModel as MongooseModel<unknown>).db?.base as Mongoose : null) ??
    (require('mongoose') as Mongoose)

  const modelName = isModel
    ? (schemaOrModel as MongooseModel<unknown>).modelName
    : null

  return { schema, mongooseRef, modelName, isModel }
}
