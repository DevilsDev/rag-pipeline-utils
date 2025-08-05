/**
 * Standardized logging utility for scripts
 * Version: 1.0.0
 * Author: Ali Kahwaji
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const configPath = path.resolve(__dirname, '../scripts.config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const LOG_COLORS = {
  debug: '\x1b[36m', // Cyan
  info: '\x1b[32m',  // Green
  warn: '\x1b[33m',  // Yellow
  error: '\x1b[31m', // Red
  reset: '\x1b[0m'
};

const LOG_ICONS = {
  debug: '🔍',
  info: '✅',
  warn: '⚠️',
  error: '❌'
};

class Logger {
  constructor(scriptName = 'script', level = null) {
    this.scriptName = scriptName;
    this.level = level || config.logging.level || 'info';
    this.useColors = config.logging.colors !== false;
    this.useTimestamp = config.logging.timestamp !== false;
  }

  _shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  _formatMessage(level, message, ...args) {
    const timestamp = this.useTimestamp ? new Date().toISOString() : '';
    const icon = LOG_ICONS[level];
    const color = this.useColors ? LOG_COLORS[level] : '';
    const reset = this.useColors ? LOG_COLORS.reset : '';
    
    const prefix = [
      timestamp && `[${timestamp}]`,
      `[${this.scriptName}]`,
      `${color}${icon} ${level.toUpperCase()}${reset}`
    ].filter(Boolean).join(' ');

    return `${prefix}: ${message}`;
  }

  debug(message, ...args) {
    if (this._shouldLog('debug')) {
      console.log(this._formatMessage('debug', message), ...args);
    }
  }

  info(message, ...args) {
    if (this._shouldLog('info')) {
      console.log(this._formatMessage('info', message), ...args);
    }
  }

  warn(message, ...args) {
    if (this._shouldLog('warn')) {
      console.warn(this._formatMessage('warn', message), ...args);
    }
  }

  error(message, ...args) {
    if (this._shouldLog('error')) {
      console.error(this._formatMessage('error', message), ...args);
    }
  }

  // Convenience methods for common patterns
  success(message, ...args) {
    this.info(`🎉 ${message}`, ...args);
  }

  progress(message, ...args) {
    this.info(`🔄 ${message}`, ...args);
  }

  retry(attempt, maxAttempts, message, ...args) {
    this.warn(`🔄 Retry ${attempt}/${maxAttempts}: ${message}`, ...args);
  }

  dryRun(message, ...args) {
    this.info(`🏃‍♂️ [DRY-RUN] ${message}`, ...args);
  }
}

// Factory function for creating loggers
export function createLogger(scriptName, level = null) {
  return new Logger(scriptName, level);
}

// Default logger instance
export const logger = new Logger('default');

export default Logger;
