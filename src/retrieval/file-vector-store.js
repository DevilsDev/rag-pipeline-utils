'use strict';

const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const { digest } = require('../cache/component-keys');
const { accessFields } = require('./access-fields');
const { copyValue } = require('./copy-value');

const FORMAT_VERSION = 1;

/**
 * Vector store persisted to a single JSON file, so separate processes (e.g.
 * `rag-pipeline ingest` then `rag-pipeline query`) share one index. Intended
 * for local use and small corpora: every query is a linear scan.
 *
 * The index records which embedder produced the vectors (name, dimensions and
 * optional serialized state) and refuses queries whose vector dimension does
 * not match, instead of silently comparing incompatible vectors.
 */
class FileVectorStore {
  /**
   * @param {object} options
   * @param {string} options.path - Index file location
   */
  constructor(options = {}) {
    if (!options.path) {
      throw new Error('FileVectorStore requires a `path` option');
    }
    this.path = path.resolve(options.path);
    this._index = null;
    this._loadedDigest = null;
    this._cacheId = randomBytes(8).toString('hex');
    this._revision = 0;
    this._fileStamp = null;
    this._resetPending();
  }

  /** Changes made here and not yet saved, merged into the file on save(). */
  _resetPending() {
    this._pending = {
      upserts: new Set(),
      removes: new Set(),
      cleared: false,
      embedder: false,
    };
  }

  _hasPending() {
    const p = this._pending;
    return p.upserts.size > 0 || p.removes.size > 0 || p.cleared || p.embedder;
  }

  _statFile() {
    try {
      const st = fs.statSync(this.path);
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return null;
    }
  }

  /**
   * Cache identity for createRagPipeline({ cache }): a digest of the index
   * as loaded, so processes reading the same unchanged index share cached
   * results; after this instance changes the index the key also carries the
   * instance and a revision.
   * @param {'retriever'} role
   * @returns {string|null}
   */
  getCacheKey(role) {
    if (role !== 'retriever') return null;
    this.load();
    return this._revision === 0
      ? `file|${this._loadedDigest}`
      : `file|${this._loadedDigest}|${this._cacheId}|${this._revision}`;
  }

  _emptyIndex() {
    return {
      version: FORMAT_VERSION,
      embedder: null,
      documents: Object.create(null),
    };
  }

  /**
   * Read the index from disk (cached after the first call).
   * @returns {{version: number, embedder: object|null, documents: object}}
   */
  load() {
    if (this._index) {
      // Pick up a newer index saved by another process, unless this
      // instance has changes of its own waiting to be saved.
      if (this._hasPending() || this._statFile() === this._fileStamp) {
        return this._index;
      }
    }
    if (!fs.existsSync(this.path)) {
      this._index = this._emptyIndex();
      this._loadedDigest = 'empty';
      this._fileStamp = null;
      return this._index;
    }
    const stamp = this._statFile();
    const raw = fs.readFileSync(this.path, 'utf8');
    this._index = this._parse(raw);
    this._loadedDigest = digest(raw);
    this._fileStamp = stamp;
    return this._index;
  }

  _parse(raw) {
    const parsed = JSON.parse(raw);
    if (parsed.version !== FORMAT_VERSION || !parsed.documents) {
      throw new Error(
        `Unsupported index format in ${this.path} (version ${parsed.version})`,
      );
    }
    // No prototype, so an id such as "__proto__" is an ordinary key
    parsed.documents = Object.assign(Object.create(null), parsed.documents);
    return parsed;
  }

  /**
   * Write the index atomically: temp file in the same directory, then rename.
   * Documents another process saved since this instance last read the file
   * are kept: the file is re-read and this instance's own changes (stores,
   * removals, embedder info) are applied on top. There is no lock, so two
   * saves at the same instant can still race; ids written by both are won
   * by whoever saves last.
   */
  save() {
    const index = this.load();
    const pending = this._pending;
    let merged = index;
    if (!pending.cleared && fs.existsSync(this.path)) {
      const onDisk = this._parse(fs.readFileSync(this.path, 'utf8'));
      const ours = index.embedder;
      const theirs = onDisk.embedder;
      if (
        pending.embedder &&
        ours &&
        theirs &&
        ours.dimensions &&
        theirs.dimensions &&
        ours.dimensions !== theirs.dimensions &&
        Object.keys(onDisk.documents).length > 0
      ) {
        throw new Error(
          `The index at ${this.path} was rebuilt with a different embedder ` +
            `("${theirs.name}", ${theirs.dimensions} dimensions) since it was read. ` +
            'Re-run ingest with --reset to replace it.',
        );
      }
      for (const id of pending.removes) delete onDisk.documents[id];
      for (const id of pending.upserts) {
        if (index.documents[id]) onDisk.documents[id] = index.documents[id];
      }
      if (pending.embedder || !theirs) onDisk.embedder = ours;
      merged = onDisk;
    }
    fs.mkdirSync(path.dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    const body = JSON.stringify(merged);
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, this.path);
    this._index = merged;
    this._loadedDigest = digest(body);
    this._fileStamp = this._statFile();
    this._resetPending();
  }

  /** @returns {object|null} Embedder metadata recorded with the vectors */
  getEmbedderInfo() {
    return this.load().embedder;
  }

  /**
   * Records which embedder wrote the index, saved with it.
   * @param {{name: string, dimensions: number, state?: object}} info
   */
  setEmbedderInfo(info) {
    this.load().embedder = info;
    this._pending.embedder = true;
    this._revision += 1;
  }

  /**
   * Add or replace documents. Ids are caller-chosen; re-storing an id
   * replaces the previous entry.
   *
   * @param {Array<{id: string, vector: number[], content: string, metadata?: object}>} docs
   */
  async store(docs) {
    const index = this.load();
    const { documents } = index;
    if (!Array.isArray(docs)) {
      throw new Error('FileVectorStore.store(): docs must be an array');
    }

    // Validate the whole batch before changing anything
    const info = index.embedder;
    let dimensions = info && info.dimensions ? info.dimensions : null;
    if (dimensions === null) {
      const [first] = Object.values(documents);
      dimensions = first ? vectorLength(first.vector) : null;
    }
    for (const doc of docs) {
      if (!doc || !doc.id || !Array.isArray(doc.vector)) {
        throw new Error(
          'FileVectorStore.store(): each doc needs id and vector',
        );
      }
      if (!doc.vector.every((x) => Number.isFinite(x))) {
        throw new Error(
          `FileVectorStore.store(): vector for "${doc.id}" must contain only finite numbers`,
        );
      }
      if (dimensions === null) {
        dimensions = doc.vector.length;
      } else if (doc.vector.length !== dimensions) {
        throw new Error(
          `FileVectorStore.store(): "${doc.id}" has ${doc.vector.length} dimensions ` +
            `but the index holds ${dimensions}-dimension vectors. Use the same embedder for all documents.`,
        );
      }
    }

    this._revision += 1;
    for (const doc of docs) {
      documents[doc.id] = {
        vector: encodeVector(doc.vector),
        content: doc.content || '',
        metadata: copyValue(doc.metadata || {}),
        ...accessFields(doc),
      };
      this._pending.upserts.add(doc.id);
      this._pending.removes.delete(doc.id);
    }
  }

  /**
   * Remove every document whose metadata.source equals `source`.
   * @param {string} source
   * @returns {number} Number of documents removed
   */
  removeBySource(source) {
    const { documents } = this.load();
    this._revision += 1;
    let removed = 0;
    for (const [id, doc] of Object.entries(documents)) {
      if (doc.metadata?.source === source) {
        delete documents[id];
        this._pending.upserts.delete(id);
        this._pending.removes.add(id);
        removed++;
      }
    }
    return removed;
  }

  /** Remove every document and the recorded embedder info. */
  clear() {
    this.load();
    this._index = this._emptyIndex();
    this._resetPending();
    this._pending.cleared = true;
    this._revision += 1;
  }

  /** @returns {Array<{id: string, content: string, metadata: object}>} */
  list() {
    return Object.entries(this.load().documents).map(([id, doc]) => ({
      id,
      content: doc.content,
      metadata: copyValue(doc.metadata),
      ...accessFields(doc),
    }));
  }

  /** @returns {number} */
  size() {
    return Object.keys(this.load().documents).length;
  }

  /**
   * Cosine-similarity search.
   *
   * @param {{queryVector?: number[], topK?: number}} request - queryVector is
   *   required (optional in the type to match the retriever contract)
   * @returns {Promise<Array<{id: string, score: number, content: string, metadata: object}>>}
   */
  async retrieve(request = {}) {
    const { queryVector, topK = 5 } = request;
    if (!Array.isArray(queryVector)) {
      throw new Error(
        'FileVectorStore.retrieve(): queryVector is required. Configure an embedder stage.',
      );
    }
    const info = this.getEmbedderInfo();
    if (info && info.dimensions && info.dimensions !== queryVector.length) {
      throw new Error(
        `Query vector has ${queryVector.length} dimensions but the index was built ` +
          `with ${info.dimensions} (embedder "${info.name}"). Re-run ingest with the ` +
          'current embedder.',
      );
    }
    // Without embedder info (an index written by store() alone), compare
    // with the stored vectors themselves
    if (!(info && info.dimensions)) {
      const [first] = Object.values(this.load().documents);
      const stored = first && vectorLength(first.vector);
      if (stored && stored !== queryVector.length) {
        throw new Error(
          `Query vector has ${queryVector.length} dimensions but the index ` +
            `holds ${stored}-dimension vectors. Use the same embedder for ` +
            'queries and documents.',
        );
      }
    }

    const queryMagnitude = Math.sqrt(
      queryVector.reduce((sum, x) => sum + x * x, 0),
    );
    const scored = Object.entries(this.load().documents).map(([id, doc]) => ({
      id,
      doc,
      score: cosine(queryVector, queryMagnitude, doc.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    // Results are copies, so editing one never rewrites the store
    return scored.slice(0, topK).map(({ id, doc, score }) => ({
      id,
      score,
      content: doc.content,
      metadata: copyValue(doc.metadata),
      ...accessFields(doc),
    }));
  }
}

// Stored vectors keep ~7 significant digits; more only inflates the file.
const round = (x) => Number(x.toPrecision(7));

/**
 * Mostly-zero vectors (e.g. LocalEmbedder's TF-IDF over a large vocabulary)
 * are stored sparsely as { n, i, v }; dense ones as plain arrays.
 */
function encodeVector(vector) {
  const indices = [];
  const values = [];
  for (let i = 0; i < vector.length; i++) {
    if (vector[i] !== 0) {
      indices.push(i);
      values.push(round(vector[i]));
    }
  }
  if (indices.length < vector.length / 4) {
    return { n: vector.length, i: indices, v: values };
  }
  return vector.map(round);
}

/** Dimension of a stored vector (dense array or sparse { n, ... }). */
function vectorLength(stored) {
  return Array.isArray(stored) ? stored.length : stored.n;
}

/** Cosine similarity between a dense query and a stored (dense or sparse) vector. */
function cosine(query, magQuery, stored) {
  const sparse = !Array.isArray(stored);
  const length = vectorLength(stored);
  if (query.length !== length) return 0;

  let dot = 0;
  let magStored = 0;
  if (sparse) {
    for (let k = 0; k < stored.i.length; k++) {
      dot += query[stored.i[k]] * stored.v[k];
      magStored += stored.v[k] * stored.v[k];
    }
  } else {
    for (let k = 0; k < length; k++) {
      dot += query[k] * stored[k];
      magStored += stored[k] * stored[k];
    }
  }
  const magnitude = magQuery * Math.sqrt(magStored);
  return magnitude === 0 ? 0 : dot / magnitude;
}

module.exports = { FileVectorStore };
