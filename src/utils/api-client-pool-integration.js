'use strict';

/**
 * API Client Connection Pool Integration
 *
 * Provides seamless integration of connection pooling with popular
 * API clients (OpenAI, Anthropic, Pinecone, etc.) and HTTP libraries.
 *
 * @module utils/api-client-pool-integration
 * @since 2.3.0
 */

const { getGlobalPool } = require('./connection-pool');

/**
 * Create OpenAI client with connection pooling
 *
 * @param {Object} OpenAI - OpenAI constructor
 * @param {Object} config - OpenAI configuration
 * @param {ConnectionPoolManager} pool - Connection pool (optional, uses global if not provided)
 * @returns {Object} OpenAI client with pooling
 *
 * @example
 * const { OpenAI } = require('openai');
 * const { createPooledOpenAIClient } = require('./api-client-pool-integration');
 *
 * const client = createPooledOpenAIClient(OpenAI, {
 *   apiKey: process.env.OPENAI_API_KEY,
 * });
 */
function createPooledOpenAIClient(OpenAI, config = {}, pool = null) {
  const connectionPool =
    pool ||
    getGlobalPool({
      maxSockets: 30,
      maxFreeSockets: 10,
      timeout: 60000, // 60s for LLM calls
    });

  // Get HTTPS agent from pool
  const httpsAgent = connectionPool.getHttpsAgent();

  // Create OpenAI client with pooled agent
  const client = new OpenAI({
    ...config,
    httpAgent: httpsAgent,
    // Some OpenAI SDKs might use different property names
    fetch: createPooledFetchWrapper(connectionPool),
  });

  // Wrap methods to track metrics
  return wrapClientWithMetrics(client, connectionPool, 'openai');
}

/**
 * Create Anthropic client with connection pooling
 *
 * @param {Object} Anthropic - Anthropic constructor
 * @param {Object} config - Anthropic configuration
 * @param {ConnectionPoolManager} pool - Connection pool (optional)
 * @returns {Object} Anthropic client with pooling
 */
function createPooledAnthropicClient(Anthropic, config = {}, pool = null) {
  const connectionPool =
    pool ||
    getGlobalPool({
      maxSockets: 30,
      maxFreeSockets: 10,
      timeout: 60000,
    });

  const httpsAgent = connectionPool.getHttpsAgent();

  const client = new Anthropic({
    ...config,
    httpAgent: httpsAgent,
    fetch: createPooledFetchWrapper(connectionPool),
  });

  return wrapClientWithMetrics(client, connectionPool, 'anthropic');
}

/**
 * Create pooled fetch wrapper
 *
 * @param {ConnectionPoolManager} pool - Connection pool
 * @returns {Function} Fetch function with pooling
 */
function createPooledFetchWrapper(pool) {
  return async function pooledFetch(url, options = {}) {
    const agent = pool.getAgentForUrl(url);
    const startTime = Date.now();

    try {
      // Check if native fetch is available
      if (typeof fetch === 'undefined') {
        // Fallback to https/http module
        return makeRequestWithAgent(url, options, agent);
      }

      // Use native fetch with agent
      const response = await fetch(url, {
        ...options,
        agent,
      });

      // Track successful request
      const duration = Date.now() - startTime;
      pool.trackRequest(duration);

      return response;
    } catch (error) {
      // Track error
      const errorType =
        error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT'
          ? 'timeout'
          : 'error';
      pool.trackError(error, errorType);

      throw error;
    }
  };
}

/**
 * Make HTTP request with agent (fallback for environments without fetch)
 * @private
 */
async function makeRequestWithAgent(url, options, agent) {
  const https = require('https');
  const http = require('http');
  const { URL } = require('url');

  const parsedUrl = new URL(url);
  const protocol = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const requestOptions = {
      ...options,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      agent,
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          statusText: res.statusMessage,
          headers: res.headers,
          json: async () => JSON.parse(data),
          text: async () => data,
        });
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(
        typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body),
      );
    }

    req.end();
  });
}

/**
 * Wrap client methods with metrics tracking
 * @private
 */
function wrapClientWithMetrics(client, pool, clientName) {
  // Create proxy to intercept method calls
  return new Proxy(client, {
    get(target, prop) {
      const original = target[prop];

      // Only wrap async methods
      if (typeof original === 'function') {
        return async function (...args) {
          const startTime = Date.now();

          try {
            const result = await original.apply(target, args);

            // Track successful call
            const duration = Date.now() - startTime;
            pool.trackRequest(duration);

            return result;
          } catch (error) {
            // Track error
            pool.trackError(error, 'api_error');
            throw error;
          }
        };
      }

      return original;
    },
  });
}

/**
 * Create pooled HTTP client (generic)
 *
 * @param {Object} options - HTTP client options
 * @param {ConnectionPoolManager} pool - Connection pool (optional)
 * @returns {Object} HTTP client with pooling
 */
function createPooledHttpClient(options = {}, pool = null) {
  const connectionPool = pool || getGlobalPool();

  return {
    get: (url, config) => makePooledRequest('GET', url, config, connectionPool),
    post: (url, data, config) =>
      makePooledRequest('POST', url, { ...config, data }, connectionPool),
    put: (url, data, config) =>
      makePooledRequest('PUT', url, { ...config, data }, connectionPool),
    patch: (url, data, config) =>
      makePooledRequest('PATCH', url, { ...config, data }, connectionPool),
    delete: (url, config) =>
      makePooledRequest('DELETE', url, config, connectionPool),
    request: (config) =>
      makePooledRequest(
        config.method || 'GET',
        config.url,
        config,
        connectionPool,
      ),
  };
}

/**
 * Make pooled HTTP request
 * @private
 */
async function makePooledRequest(method, url, config = {}, pool) {
  const agent = pool.getAgentForUrl(url);
  const startTime = Date.now();

  try {
    const options = {
      method,
      headers: config.headers || {},
      agent,
    };

    if (config.data) {
      options.body =
        typeof config.data === 'string'
          ? config.data
          : JSON.stringify(config.data);

      if (!options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
      }
    }

    const response = await makeRequestWithAgent(url, options, agent);

    // Track successful request
    const duration = Date.now() - startTime;
    pool.trackRequest(duration);

    return response;
  } catch (error) {
    // Track error
    const errorType =
      error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT'
        ? 'timeout'
        : 'error';
    pool.trackError(error, errorType);

    throw error;
  }
}

/**
 * Axios interceptor for connection pooling
 *
 * @param {Object} axios - Axios instance
 * @param {ConnectionPoolManager} pool - Connection pool (optional)
 * @returns {Object} Axios instance with pooling
 *
 * @example
 * const axios = require('axios');
 * const { addAxiosPoolingInterceptor } = require('./api-client-pool-integration');
 *
 * const pooledAxios = addAxiosPoolingInterceptor(axios);
 */
function addAxiosPoolingInterceptor(axios, pool = null) {
  const connectionPool = pool || getGlobalPool();

  // Add default agents
  axios.defaults.httpAgent = connectionPool.getHttpAgent();
  axios.defaults.httpsAgent = connectionPool.getHttpsAgent();

  // Add request interceptor to track timing
  axios.interceptors.request.use(
    (config) => {
      config.metadata = { startTime: Date.now() };
      return config;
    },
    (error) => {
      return Promise.reject(error);
    },
  );

  // Add response interceptor to track metrics
  axios.interceptors.response.use(
    (response) => {
      const duration = Date.now() - response.config.metadata.startTime;
      connectionPool.trackRequest(duration);
      return response;
    },
    (error) => {
      if (error.config && error.config.metadata) {
        const duration = Date.now() - error.config.metadata.startTime;

        const errorType =
          error.code === 'ECONNABORTED' || error.message.includes('timeout')
            ? 'timeout'
            : 'error';

        connectionPool.trackError(error, errorType);
      }

      return Promise.reject(error);
    },
  );

  return axios;
}

/**
 * node-fetch wrapper with connection pooling
 *
 * @param {Function} nodeFetch - node-fetch function
 * @param {ConnectionPoolManager} pool - Connection pool (optional)
 * @returns {Function} Pooled fetch function
 *
 * @example
 * const fetch = require('node-fetch');
 * const { createPooledNodeFetch } = require('./api-client-pool-integration');
 *
 * const pooledFetch = createPooledNodeFetch(fetch);
 */
function createPooledNodeFetch(nodeFetch, pool = null) {
  const connectionPool = pool || getGlobalPool();

  return async function pooledNodeFetch(url, options = {}) {
    const agent = connectionPool.getAgentForUrl(url);
    const startTime = Date.now();

    try {
      const response = await nodeFetch(url, {
        ...options,
        agent,
      });

      // Track successful request
      const duration = Date.now() - startTime;
      connectionPool.trackRequest(duration);

      return response;
    } catch (error) {
      // Track error
      const errorType =
        error.type === 'request-timeout' || error.code === 'ETIMEDOUT'
          ? 'timeout'
          : 'error';
      connectionPool.trackError(error, errorType);

      throw error;
    }
  };
}

/**
 * Get connection pool metrics for monitoring
 *
 * @param {ConnectionPoolManager} pool - Connection pool (optional)
 * @returns {Object} Pool metrics
 */
function getPoolMetrics(pool = null) {
  const connectionPool = pool || getGlobalPool();
  return connectionPool.getMetrics();
}

/**
 * Get connection pool status
 *
 * @param {ConnectionPoolManager} pool - Connection pool (optional)
 * @returns {Object} Pool status
 */
function getPoolStatus(pool = null) {
  const connectionPool = pool || getGlobalPool();
  return connectionPool.getStatus();
}

/**
 * Get connection pool report
 *
 * @param {ConnectionPoolManager} pool - Connection pool (optional)
 * @returns {string} Human-readable pool report
 */
function getPoolReport(pool = null) {
  const connectionPool = pool || getGlobalPool();
  return connectionPool.getReport();
}

module.exports = {
  createPooledOpenAIClient,
  createPooledAnthropicClient,
  createPooledHttpClient,
  createPooledFetchWrapper,
  createPooledNodeFetch,
  addAxiosPoolingInterceptor,
  getPoolMetrics,
  getPoolStatus,
  getPoolReport,
};
