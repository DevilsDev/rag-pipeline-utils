'use strict';

/**
 * CacheBackend on Redis. Pass a connected client from `redis` (node-redis 4
 * and later) or `ioredis`; neither is a dependency of this package.
 *
 * Values are stored as JSON under `prefix + key`, with a millisecond expiry
 * when a time to live applies.
 */
class RedisCache {
  /**
   * @param {Object} options
   * @param {Object} options.client - Connected node-redis or ioredis client
   * @param {string} [options.prefix='rag:'] - Key prefix
   * @param {number} [options.ttlSeconds] - Default time to live
   */
  constructor({ client, prefix = 'rag:', ttlSeconds } = {}) {
    if (
      !client ||
      typeof client.get !== 'function' ||
      typeof client.set !== 'function'
    ) {
      throw new Error(
        'RedisCache needs a connected client from "redis" or "ioredis"',
      );
    }
    this.client = client;
    this.prefix = prefix;
    this.ttlSeconds = ttlSeconds;
    // node-redis 4+ exposes isOpen and takes set(key, value, { PX }); ioredis
    // takes set(key, value, 'PX', ms).
    this._nodeRedis = typeof client.isOpen === 'boolean';
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * @param {string} key
   * @returns {Promise<unknown|undefined>}
   */
  async get(key) {
    const raw = await this.client.get(this.prefix + key);
    if (raw === null || raw === undefined) {
      this._misses += 1;
      return undefined;
    }
    this._hits += 1;
    return JSON.parse(raw);
  }

  /**
   * @param {string} key
   * @param {unknown} value - JSON-serialisable value
   * @param {{ ttlSeconds?: number }} [options]
   */
  async set(key, value, { ttlSeconds = this.ttlSeconds } = {}) {
    const json = JSON.stringify(value);
    if (json === undefined) return;
    const k = this.prefix + key;
    const ms = ttlSeconds > 0 ? Math.round(ttlSeconds * 1000) : 0;
    if (!ms) {
      await this.client.set(k, json);
    } else if (this._nodeRedis) {
      await this.client.set(k, json, { PX: ms });
    } else {
      await this.client.set(k, json, 'PX', ms);
    }
  }

  /** @param {string} key */
  async delete(key) {
    const del = this.client.del || this.client.unlink;
    if (typeof del === 'function')
      await del.call(this.client, this.prefix + key);
  }

  /** Hits and misses seen by this instance (size is not tracked). */
  async stats() {
    return { hits: this._hits, misses: this._misses };
  }
}

module.exports = { RedisCache };
