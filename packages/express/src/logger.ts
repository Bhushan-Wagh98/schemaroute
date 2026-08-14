/**
 * @file logger.ts
 * @description Internal logger for @schemaroute/express.
 *
 * Silent by default. Pass `debug: true` in the resource config or the
 * global createAPI options to enable diagnostic output.
 *
 * Libraries should never log to stdout unconditionally — this utility
 * ensures all output is opt-in.
 */

let debugEnabled = false

export function enableDebug() {
  debugEnabled = true
}

export function log(message: string) {
  if (debugEnabled) console.log(`[schemaroute] ${message}`)
}

export function logError(message: string, error: unknown) {
  if (debugEnabled) console.error(`[schemaroute] ${message}`, error)
}
