'use strict';

const { copyValue } = require('./copy-value');

const ACCESS_KEYS = ['requiredRole', 'acl'];

// Where stores without a free-form document keep the access fields: a
// reserved key in the stored metadata, lifted back out when read.
const STORED_KEY = 'rag_access';

// A role no user has: RetrievalGuard never matches it, so a restriction
// to it can't be met. A string, so results survive JSON and structuredClone.
const NO_ACCESS = 'rag:no-access';

/**
 * The access fields (`acl`, `requiredRole`) set on a document's top level.
 * Stores keep them on each result, as well as whatever metadata holds, so
 * RetrievalGuard sees a restriction wherever it was set.
 * @param {object} doc
 * @returns {object}
 */
function accessFields(doc) {
  const fields = {};
  if (doc.acl !== undefined) fields.acl = copyValue(doc.acl);
  if (doc.requiredRole !== undefined) {
    fields.requiredRole = copyValue(doc.requiredRole);
  }
  return fields;
}

/**
 * The metadata to store for a document: its metadata, plus its top-level
 * access fields under a reserved key when it has any.
 * @param {object} doc
 * @returns {object}
 */
function storedMetadata(doc) {
  const metadata = doc.metadata || {};
  const access = accessFields(doc);
  return Object.keys(access).length
    ? { ...metadata, [STORED_KEY]: access }
    : metadata;
}

/**
 * Splits stored metadata back into the document's metadata and its
 * top-level access fields. Unreadable access fields restrict the document
 * to no one.
 * @param {object} stored
 * @returns {{ metadata: object, access: object }}
 */
function readStoredMetadata(stored) {
  if (!stored || typeof stored !== 'object' || !(STORED_KEY in stored)) {
    return { metadata: stored || {}, access: {} };
  }
  const { [STORED_KEY]: access, ...metadata } = stored;
  const readable =
    access && typeof access === 'object' && !Array.isArray(access);
  return {
    metadata,
    access: readable ? accessFields(access) : { acl: [NO_ACCESS] },
  };
}

/**
 * The restrictions set on a result, its metadata or its doc, each as a
 * list of roles, read as RetrievalGuard reads them.
 * @param {object} result
 * @returns {Array<Array<any>>}
 */
function restrictionLists(result) {
  const lists = [];
  if (!result || typeof result !== 'object') return lists;
  for (const source of [result, result.metadata, result.doc]) {
    if (!source || typeof source !== 'object') continue;
    for (const key of ACCESS_KEYS) {
      const value = source[key];
      if (value === undefined || value === null || value === '') continue;
      const roles = [].concat(value);
      if (roles.length > 0) lists.push(roles);
    }
  }
  return lists;
}

const sameRoles = (a, b) =>
  a.length === b.length && a.every((role) => b.includes(role));

/**
 * One result for copies of the same document: the first copy's fields,
 * restricted by every restriction any copy sets. Restrictions the first
 * copy lacks go on its free top-level access fields; when they don't fit,
 * its top-level restrictions and the new ones become a single list of the
 * roles they all share, which is at least as strict.
 * @param {object} first
 * @param {object[]} others
 * @returns {object}
 */
function mergeAccess(first, others) {
  const have = restrictionLists(first);
  const extra = [];
  for (const copy of others) {
    for (const roles of restrictionLists(copy)) {
      if (![...have, ...extra].some((list) => sameRoles(list, roles))) {
        extra.push(roles);
      }
    }
  }
  if (extra.length === 0) return first;

  const merged = { ...first };
  const free = ACCESS_KEYS.filter(
    (key) => restrictionLists({ [key]: merged[key] }).length === 0,
  );
  if (extra.length <= free.length) {
    extra.forEach((roles, i) => {
      merged[free[i]] = roles;
    });
    return merged;
  }
  const lists = [...restrictionLists(accessFields(merged)), ...extra];
  const shared = lists[0].filter((role) =>
    lists.every((list) => list.includes(role)),
  );
  delete merged.requiredRole;
  merged.acl = shared.length ? shared : [NO_ACCESS];
  return merged;
}

module.exports = {
  NO_ACCESS,
  accessFields,
  storedMetadata,
  readStoredMetadata,
  mergeAccess,
};
