'use strict';

/**
 * @opentelemetry/api-logs in the /edge build, where the library cannot
 * require() it: pass `telemetry: { api }` with @opentelemetry/api 1.10 or
 * later (which has the logs API), or `telemetry: { logs }`.
 */
const error = new Error('Cannot find module \'@opentelemetry/api-logs\'');
error.code = 'MODULE_NOT_FOUND';
throw error;
