/**
 * Version: 0.1.0
 * Path: /src/utils/logger.js
 * Description: Centralized structured logger using Pino
 * Author: Ali Kahwaji
 */

import pino from 'pino';

/**
 * Create a structured JSON logger instance with sensible defaults.
 * Output can be redirected or formatted in dev/prod contexts.
 */
const logger = pino({
  name: 'rag-pipeline-utils',
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  } : undefined
});

export { logger };


