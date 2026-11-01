'use strict';

/**
 * @opentelemetry/api in the /edge build, where the library cannot require()
 * it: pass it in instead, `telemetry: { api, tracer? }`.
 */
const error = new Error('Cannot find module \'@opentelemetry/api\'');
error.code = 'MODULE_NOT_FOUND';
throw error;
