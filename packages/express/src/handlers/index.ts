/**
 * @file handlers/index.ts
 * @description Re-exports all CRUD handler factories for consumption by the
 * Express adapter entry point (`index.ts`).
 */

export { makeGetAllHandler } from './get-all'
export { makeGetOneHandler } from './get-one'
export { makeCreateHandler } from './create'
export { makeUpdateHandler } from './update'
export { makeDeleteHandler } from './delete'
