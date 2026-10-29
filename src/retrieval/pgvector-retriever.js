'use strict';

/**
 * Retriever on PostgreSQL with the pgvector extension.
 *
 * Pass a `pg` Pool or Client you manage (`pool`), or a `connectionString`
 * and this class creates a Pool with the optional `pg` package. Documents
 * live in one table: id (text, primary key), content, metadata (jsonb) and
 * embedding (vector). Similarity is cosine; `score` is 1 - cosine distance.
 *
 * The database can change without this process knowing, so the retriever
 * has no cache identity unless you give it a `cacheKey`; see getCacheKey.
 */

const { throwIfAborted, raceAbort } = require('../connectors/connector-utils');

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const DEFAULT_TABLE = 'rag_documents';
// pgvector's default hnsw.ef_search
const PG_DEFAULT_EF_SEARCH = 40;
// 4 parameters per row; pg allows 65535 per statement.
const MAX_BATCH = 1000;

/** Quotes a table name, optionally schema-qualified, after validating it. */
function quoteTable(name) {
  const parts = String(name).split('.');
  if (parts.length > 2 || !parts.every((p) => IDENTIFIER.test(p))) {
    throw new Error(
      `PgVectorRetriever: invalid table name "${name}" (letters, digits and underscores; optionally schema.table)`,
    );
  }
  return parts.map((p) => `"${p}"`).join('.');
}

function vectorLiteral(vector, id) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error(`PgVectorRetriever: document "${id}" has no vector`);
  }
  for (const x of vector) {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(
        `PgVectorRetriever: document "${id}" has a vector with a non-finite value`,
      );
    }
  }
  return `[${vector.join(',')}]`;
}

/** Turns a pg error into a message that says what to do. */
function explain(err, table) {
  const code = err && err.code;
  if (code === '42P01') {
    return new Error(
      `PgVectorRetriever: table ${table} does not exist. Store documents first (rag-pipeline ingest), or create it.`,
    );
  }
  if (
    code === '42501' ||
    /permission denied/i.test(String(err && err.message))
  ) {
    return new Error(
      'PgVectorRetriever: permission denied. Run `CREATE EXTENSION IF NOT EXISTS vector;` as a database owner, ' +
        `and grant this user access to ${table}. (${err.message})`,
    );
  }
  if (
    /different vector dimensions|expected \d+ dimensions/i.test(
      String(err && err.message),
    )
  ) {
    return new Error(
      `PgVectorRetriever: ${err.message}. The table holds vectors from another embedder; use the same embedder or a new table.`,
    );
  }
  return err;
}

/**
 * Retriever on PostgreSQL with the pgvector extension. Creates the
 * extension, table and index on first use; similarity is cosine.
 */
class PgVectorRetriever {
  /**
   * @param {Object} options
   * @param {{ query: Function, connect?: Function }} [options.pool] - A pg Pool or Client you manage
   * @param {string} [options.connectionString] - Used to create a Pool when no `pool` is given
   * @param {string} [options.table='rag_documents'] - Table name, optionally `schema.table`
   * @param {number} [options.dimensions] - Vector size for a new table; defaults to the first stored vector's
   * @param {boolean} [options.createTable=true] - Create the extension, table and index on first store
   * @param {'hnsw'|'none'} [options.index='hnsw'] - Index created with the table
   * @param {number} [options.efSearch] - HNSW candidate list size per query (pgvector's default is 40). Higher finds more of the true nearest neighbours, more slowly; a query always uses at least its topK
   * @param {string} [options.cacheKey] - Cache identity; change it when the table changes (see getCacheKey)
   */
  constructor(options = {}) {
    const {
      pool,
      connectionString,
      table = DEFAULT_TABLE,
      dimensions,
      createTable = true,
      index = 'hnsw',
      efSearch,
      cacheKey,
    } = options;
    if (!pool && !connectionString) {
      throw new Error(
        'PgVectorRetriever needs a pg `pool` (or Client) or a `connectionString`',
      );
    }
    if (pool && typeof pool.query !== 'function') {
      throw new Error('PgVectorRetriever: `pool` must have a query() method');
    }
    if (!['hnsw', 'none'].includes(index)) {
      throw new Error(
        `PgVectorRetriever: unknown index "${index}" (use "hnsw" or "none")`,
      );
    }
    if (
      dimensions !== undefined &&
      !(Number.isInteger(dimensions) && dimensions > 0)
    ) {
      throw new Error(
        'PgVectorRetriever: `dimensions` must be a positive integer',
      );
    }
    if (
      efSearch !== undefined &&
      !(Number.isInteger(efSearch) && efSearch > 0 && efSearch <= 1000)
    ) {
      throw new Error(
        'PgVectorRetriever: `efSearch` must be an integer from 1 to 1000',
      );
    }
    this.efSearch = efSearch;
    this.table = quoteTable(table);
    this.tableName = table;
    this.dimensions = dimensions;
    this.createTable = createTable;
    this.index = index;
    this.cacheKey = cacheKey;
    this._pool = pool || null;
    this._connectionString = connectionString;
    this._ownsPool = !pool;
    this._ready = null;
  }

  /** The pg Pool or Client in use; creates the Pool on first use. */
  _db() {
    if (!this._pool) {
      let pg;
      try {
        pg = require('pg'); // eslint-disable-line global-require
      } catch {
        throw new Error(
          'PgVectorRetriever with a connectionString needs the "pg" package: npm install pg',
        );
      }
      // allowExitOnIdle: an idle pool must not keep the CLI or a script alive.
      this._pool = new pg.Pool({
        connectionString: this._connectionString,
        allowExitOnIdle: true,
      });
    }
    return this._pool;
  }

  async _query(text, params, signal) {
    throwIfAborted(signal);
    try {
      return await raceAbort(this._db().query(text, params), signal);
    } catch (err) {
      throw explain(err, this.table);
    }
  }

  /** Runs one query with `SET LOCAL hnsw.ef_search`, in its own transaction. */
  async _queryWithEfSearch(text, params, ef, signal) {
    throwIfAborted(signal);
    const db = this._db();
    const pooled =
      typeof db.connect === 'function' &&
      typeof db.end === 'function' &&
      db.totalCount !== undefined;
    const client = pooled ? await db.connect() : db;
    try {
      await client.query('BEGIN');
      // ef is an integer checked above; SET takes no bind parameters
      await client.query(`SET LOCAL hnsw.ef_search = ${Math.min(ef, 1000)}`);
      const result = await client.query(text, params);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw explain(err, this.table);
    } finally {
      if (pooled) client.release();
    }
  }

  /** Creates the extension, table and index once, sized to `dimensions`. */
  _ensureTable(dimensions) {
    if (!this.createTable) return Promise.resolve();
    if (!this._ready) {
      const size = this.dimensions || dimensions;
      const indexName = `"${this.tableName.split('.').pop()}_embedding_hnsw"`;
      this._ready = (async () => {
        await this._query('CREATE EXTENSION IF NOT EXISTS vector');
        await this._query(
          `CREATE TABLE IF NOT EXISTS ${this.table} (` +
            'id text PRIMARY KEY, ' +
            'content text NOT NULL DEFAULT \'\', ' +
            'metadata jsonb NOT NULL DEFAULT \'{}\'::jsonb, ' +
            `embedding vector(${size}) NOT NULL)`,
        );
        if (this.index === 'hnsw') {
          await this._query(
            `CREATE INDEX IF NOT EXISTS ${indexName} ON ${this.table} USING hnsw (embedding vector_cosine_ops)`,
          );
        }
      })().catch((err) => {
        this._ready = null;
        throw err;
      });
    }
    return this._ready;
  }

  /**
   * Cache identity for createRagPipeline({ cache }). Other processes can
   * write to the table without this one knowing, so there is none unless
   * you set `cacheKey`: then cached retrieval results are reused until you
   * change the key or their time to live ends.
   * @param {'retriever'} role
   * @returns {string|null}
   */
  getCacheKey(role) {
    if (role !== 'retriever' || !this.cacheKey) return null;
    return `pgvector|${this.tableName}|${this.cacheKey}`;
  }

  /**
   * Inserts or replaces documents, in one transaction: a failed batch
   * changes nothing.
   * @param {Array<{ id: string, vector: number[], content?: string, metadata?: Object }>} docs
   * @returns {Promise<void>}
   */
  async store(docs) {
    if (!Array.isArray(docs))
      throw new Error('PgVectorRetriever.store() takes an array');
    if (docs.length === 0) return;
    let dimensions = null;
    const rows = docs.map((doc) => {
      const id = doc && doc.id;
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error(
          'PgVectorRetriever.store(): every document needs a string id',
        );
      }
      const literal = vectorLiteral(doc.vector, id);
      if (dimensions === null) dimensions = doc.vector.length;
      else if (doc.vector.length !== dimensions) {
        throw new Error(
          `PgVectorRetriever.store(): document "${id}" has ${doc.vector.length} dimensions, the batch has ${dimensions}`,
        );
      }
      return [
        id,
        doc.content || '',
        JSON.stringify(doc.metadata || {}),
        literal,
      ];
    });
    await this._ensureTable(dimensions);

    const db = this._db();
    const pooled =
      typeof db.connect === 'function' &&
      typeof db.end === 'function' &&
      db.totalCount !== undefined;
    const client = pooled ? await db.connect() : db;
    try {
      await client.query('BEGIN');
      for (let i = 0; i < rows.length; i += MAX_BATCH) {
        const batch = rows.slice(i, i + MAX_BATCH);
        const values = batch
          .map(
            (_, j) =>
              `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}::jsonb, $${j * 4 + 4}::vector)`,
          )
          .join(', ');
        await client.query(
          `INSERT INTO ${this.table} (id, content, metadata, embedding) VALUES ${values} ` +
            'ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, ' +
            'metadata = EXCLUDED.metadata, embedding = EXCLUDED.embedding',
          batch.flat(),
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw explain(err, this.table);
    } finally {
      if (pooled) client.release();
    }
  }

  /**
   * The documents most similar to a query vector.
   * @param {number[]|{ queryVector: number[], topK?: number, signal?: AbortSignal }} request
   * @param {number} [k=10] - Results when `request` is a vector
   * @returns {Promise<Array<{ id: string, score: number, content: string, metadata: Object }>>}
   */
  async retrieve(request, k = 10) {
    const {
      queryVector,
      topK = k,
      signal,
    } = Array.isArray(request) ? { queryVector: request } : request || {};
    if (!Number.isInteger(topK) || topK < 1) {
      throw new Error(
        'PgVectorRetriever.retrieve(): topK must be a positive integer',
      );
    }
    const literal = vectorLiteral(queryVector, 'query');
    const sql =
      `SELECT id, content, metadata, 1 - (embedding <=> $1::vector) AS score FROM ${this.table} ` +
      'ORDER BY embedding <=> $1::vector LIMIT $2';
    // An HNSW scan returns at most ef_search rows, so a topK above it
    // would come back short.
    const ef = Math.max(this.efSearch || 0, topK);
    const { rows } =
      ef > PG_DEFAULT_EF_SEARCH || this.efSearch
        ? await this._queryWithEfSearch(sql, [literal, topK], ef, signal)
        : await this._query(sql, [literal, topK], signal);
    throwIfAborted(signal);
    return rows.map((r) => ({
      id: r.id,
      score: Number(r.score),
      content: r.content,
      metadata: r.metadata || {},
    }));
  }

  /**
   * Deletes the chunks of one source (`metadata.source`), for re-ingesting.
   * @param {string} source
   * @returns {Promise<number>} Rows deleted
   */
  async removeBySource(source) {
    const { rowCount } = await this._query(
      `DELETE FROM ${this.table} WHERE metadata->>'source' = $1`,
      [String(source)],
    ).catch((err) => {
      if (/does not exist/.test(err.message)) return { rowCount: 0 };
      throw err;
    });
    return rowCount || 0;
  }

  /**
   * Deletes documents by id.
   * @param {string[]} ids
   * @returns {Promise<number>} Rows deleted
   */
  async delete(ids) {
    const { rowCount } = await this._query(
      `DELETE FROM ${this.table} WHERE id = ANY($1::text[])`,
      [ids.map(String)],
    );
    return rowCount || 0;
  }

  /** Deletes every document; the table stays. */
  async clear() {
    await this._query(`DELETE FROM ${this.table}`).catch((err) => {
      if (!/does not exist/.test(err.message)) throw err;
    });
  }

  /** @returns {Promise<number>} */
  async size() {
    try {
      const { rows } = await this._query(
        `SELECT count(*)::int AS n FROM ${this.table}`,
      );
      return rows[0].n;
    } catch (err) {
      if (/does not exist/.test(err.message)) return 0;
      throw err;
    }
  }

  /**
   * Every document, without vectors, in id order.
   * @param {{ limit?: number }} [options]
   * @returns {Promise<Array<{ id: string, content: string, metadata: Object }>>}
   */
  async list({ limit } = {}) {
    const { rows } = await this._query(
      `SELECT id, content, metadata FROM ${this.table} ORDER BY id${limit ? ' LIMIT $1' : ''}`,
      limit ? [limit] : [],
    );
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      metadata: r.metadata || {},
    }));
  }

  /** Closes the Pool this retriever created; a pool you passed in stays open. */
  async close() {
    if (this._ownsPool && this._pool) {
      const pool = this._pool;
      this._pool = null;
      await pool.end();
    }
  }
}

module.exports = { PgVectorRetriever, quoteTable };
