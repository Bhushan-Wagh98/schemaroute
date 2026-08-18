/**
 * @file utils/logger.ts
 * @description Internal logger for @schemaroute/fastify.
 * Silent by default. Pass `debug: true` in the resource config to enable
 * diagnostic output for that specific resource only.
 */

export interface Logger {
  log:      (message: string) => void
  logError: (message: string, error: unknown) => void
}

export function createLogger(resourceName: string, debug: boolean): Logger {
  if (!debug) return { log: () => undefined, logError: () => undefined }
  return {
    log:      (message) => console.log(`[schemaroute:${resourceName}] ${message}`),
    logError: (message, error) => console.error(`[schemaroute:${resourceName}] ${message}`, error),
  }
}
