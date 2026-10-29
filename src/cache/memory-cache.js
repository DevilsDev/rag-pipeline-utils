'use strict';

/**
 * In-process cache with least-recently-used eviction and per-entry time to
 * live. Implements the CacheBackend contract:
 *
 *   get(key) -> Promise<value | undefined>
 *   set(key, value, { ttlSeconds }) -> Promise<void>
 *   delete(key) -> Promise<void>
 *   stats() -> Promise<{ hits, misses, size }>
 *
 * Values are stored as JSON copies, so later changes to a returned value do
 * not change the cache (the same behaviour as RedisCache).
 */
class MemoryCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxEntries=1000] - Entries kept before the least
   *   recently used is evicted
   * @param {number} [options.ttlSeconds] - Default time to live; none means
   *   entries never expire on their own
   */
  constructor({ maxEntries = 1000, ttlSeconds } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new Error('maxEntries must be a positive integer');
    }
    this.maxEntries = maxEntries;
    this.ttlSeconds = ttlSeconds;
    this._entries = new Map(); // insertion order = recency order
    this._hits = 0;
    this._misses = 0;
  }

  /**
   * @param {string} key
   * @returns {Promise<unknown|undefined>}
   */
  async get(key) {
    const entry = this._entries.get(key);
    if (!entry || (entry.expiresAt !== null && entry.expiresAt <= Date.now())) {
      if (entry) this._entries.delete(key);
      this._misses += 1;
      return undefined;
    }
    // Move to the most recently used position.
    this._entries.delete(key);
    this._entries.set(key, entry);
    this._hits += 1;
    return JSON.parse(entry.json);
  }

  /**
   * @param {string} key
   * @param {unknown} value - JSON-serialisable value
   * @param {{ ttlSeconds?: number }} [options]
   * @returns {Promise<void>}
   */
  async set(key, value, { ttlSeconds = this.ttlSeconds } = {}) {
    const json = JSON.stringify(value);
    if (json === undefined) return;
    this._entries.delete(key);
    this._entries.set(key, {
      json,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null,
    });
    while (this._entries.size > this.maxEntries) {
      this._entries.delete(this._entries.keys().next().value);
    }
  }

  /** @param {string} key */
  async delete(key) {
    this._entries.delete(key);
  }

  /** Remove every entry. */
  async clear() {
    this._entries.clear();
  }

  /** @returns {Promise<{ hits: number, misses: number, size: number }>} */
  async stats() {
    return { hits: this._hits, misses: this._misses, size: this._entries.size };
  }
}

module.exports = { MemoryCache };
