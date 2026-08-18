/**
 * @file utils/resolve-mongoose.ts
 * @description Resolves the Mongoose schema and instance from either a raw
 * Mongoose Schema or an already-registered Mongoose Model.
 * Mirrors @schemaroute/express/src/utils/resolve-mongoose.ts exactly.
 */

import type { Schema, Model as MongooseModel, Mongoose } from 'mongoose'

export interface ResolvedMongoose {
  schema:      Schema
  mongooseRef: Mongoose
  modelName:   string | null
  isModel:     boolean
}

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
