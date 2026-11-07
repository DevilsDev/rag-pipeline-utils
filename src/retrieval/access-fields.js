'use strict';

/**
 * The access fields (`acl`, `requiredRole`) set on a document's top level.
 * Stores keep them on each result, as well as whatever metadata holds, so
 * RetrievalGuard sees a restriction wherever it was set.
 * @param {object} doc
 * @returns {object}
 */
function accessFields(doc) {
  const fields = {};
  if (doc.acl !== undefined) fields.acl = doc.acl;
  if (doc.requiredRole !== undefined) fields.requiredRole = doc.requiredRole;
  return fields;
}

module.exports = { accessFields };
