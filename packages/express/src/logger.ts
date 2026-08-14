/**
 * @file logger.ts
 * @description Internal logger for @schemaroute/express.
 *
 * Silent by default. Pass `debug: true` in the resource config to enable
 * diagnostic output for that specific resource only.
 *
 * Uses a per-instance logger created by `createLogger` so that enabling debug
 * on one resource does not affect others registered on the same process.
 *
 * Libraries should never log to stdout unconditionally — this utility
 * ensures all output is opt-in and scoped.
 */

export interface Logger {
  log:      (message: string) => void
  logError: (message: string, error: unknown) => void
}

/**
 * Creates a logger scoped to a single resource instance.
 * When `debug` is false the returned functions are no-ops.
 *
 * @param resourceName - Used as a prefix in log output.
 * @param debug        - Whether diagnostic output is enabled for this resource.
 */
export function createLogger(resourceName: string, debug: boolean): Logger {
  if (!debug) {
    return {
      log:      () => undefined,
      logError: () => undefined,
    }
  }
  return {
    log:      (message) => console.log(`[schemaroute:${resourceName}] ${message}`),
    logError: (message, error) => console.error(`[schemaroute:${resourceName}] ${message}`, error),
  }
}
