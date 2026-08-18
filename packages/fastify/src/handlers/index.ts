/**
 * @file handlers/index.ts
 * @description Re-exports all CRUD handler factories for the Fastify adapter.
 */

export { makeGetAllHandler } from './get-all'
export { makeGetOneHandler } from './get-one'
export { makeCreateHandler } from './create'
export { makeUpdateHandler } from './update'
export { makePatchHandler  } from './patch'
export { makeDeleteHandler } from './delete'
export { makeRestoreHandler } from './restore'
export { makePurgeHandler   } from './purge'
