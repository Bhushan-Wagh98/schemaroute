/**
 * @file hooks.ts
 * @description Request context and lifecycle hook types.
 *
 * Every hook receives a `RequestContext` as its second argument — a serialisable
 * snapshot of the current request. This keeps hooks decoupled from framework
 * request objects while still providing access to headers, query params, and
 * the authenticated user.
 */

/**
 * Serialisable snapshot of the current HTTP request passed to every hook.
 *
 * `req` is the raw framework request object — use it to access framework-specific
 * properties (e.g. `req.ip`, `req.socket`, custom middleware props) that are not
 * captured in the other fields. `user` is read from `req.user` as set by auth
 * middleware. `headers`, `query`, and `params` are plain-object snapshots.
 */
export interface RequestContext {
  headers: Record<string, string | string[] | undefined>
  query:   Record<string, unknown>
  params:  Record<string, string>
  user?:   Record<string, unknown>
  /** Raw framework request object — access ip, socket, custom middleware props. */
  req:     Record<string, unknown>
}

/**
 * Lifecycle hooks for CRUD operations. Hooks run before or after the DB
 * operation and receive a `RequestContext` as the second argument.
 *
 * `before*` hooks can modify data by returning the updated object.
 * `after*` hooks are for side-effects only — their return value is ignored.
 */
export interface Hooks {
  /** Runs before insert. Return modified data to change what is persisted. */
  beforeCreate?: (data: Record<string, unknown>, ctx: RequestContext) => Promise<Record<string, unknown>> | Record<string, unknown>
  /** Runs after insert. Side-effects only — return value ignored. */
  afterCreate?:  (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
  /** Runs before update (PUT or PATCH). Return modified data to change what is persisted. */
  beforeUpdate?: (data: Record<string, unknown>, ctx: RequestContext) => Promise<Record<string, unknown>> | Record<string, unknown>
  /** Runs after update. Side-effects only — return value ignored. */
  afterUpdate?:  (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
  /** Runs before delete. Side-effects only — return value ignored. */
  beforeDelete?: (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
  /** Runs after delete. Side-effects only — return value ignored. */
  afterDelete?:  (doc:  Record<string, unknown>, ctx: RequestContext) => Promise<void> | void
}
