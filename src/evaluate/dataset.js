'use strict';

/**
 * The evaluation dataset format, shared by validateDataset and the tools
 * built on it (compareConfigurations, `rag-pipeline eval`, the rag-eval
 * Action, generateSyntheticDataset).
 *
 * A dataset is an array of cases, or `{ cases: [...] }`. A case is:
 *
 *   prompt     (required) the question; `question` is accepted as an alias
 *   expected   (optional) the reference answer; `referenceAnswer` is an alias
 *   sourceIds  (optional) ids of the documents that should be retrieved,
 *              matching the `id` of retrieval results
 *   id         (optional) a stable case id; defaults to `case-<n>`
 *   tags       (optional) strings for grouping results
 *
 * Other fields are kept as they are. `{ prompt, expected }`, the shape
 * evaluateRagDataset reads, is valid unchanged.
 */

const ALIASES = {
  prompt: ['prompt', 'question'],
  expected: ['expected', 'referenceAnswer'],
};

const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Reads a field that may be given under an alias. Reports an error when two
 * spellings disagree.
 */
function readAliased(raw, field, issue) {
  const present = ALIASES[field].filter((name) => raw[name] !== undefined);
  if (present.length === 0) return undefined;
  const value = raw[present[0]];
  for (const other of present.slice(1)) {
    if (raw[other] !== value) {
      issue(
        'error',
        field,
        `"${present[0]}" and "${other}" are both set and differ; use one`,
      );
    }
  }
  return { value, name: present[0] };
}

/**
 * Checks an evaluation dataset before anything runs. It never throws: every
 * problem is reported, with the case it is in.
 *
 * @param {Array<Object>|{cases: Array<Object>}} dataset - Cases, or an object with `cases`
 * @param {Object} [options]
 * @param {boolean} [options.requireExpected=false] - Every case needs `expected`
 * @param {boolean} [options.requireSourceIds=false] - Every case needs `sourceIds`
 * @returns {{
 *   valid: boolean,
 *   errors: Array<{ index: number|null, id: string|null, field: string|null, message: string }>,
 *   warnings: Array<{ index: number|null, id: string|null, field: string|null, message: string }>,
 *   cases: Array<{ id: string, prompt: string, expected?: string, sourceIds?: string[], tags?: string[] }>
 * }} `cases` holds the normalised cases (aliases resolved, ids filled in)
 *   when `valid` is true, and is empty otherwise
 */
function validateDataset(dataset, options = {}) {
  const { requireExpected = false, requireSourceIds = false } = options;
  const errors = [];
  const warnings = [];
  const fail = (message) => ({
    valid: false,
    errors: [{ index: null, id: null, field: null, message }],
    warnings,
    cases: [],
  });

  let list = dataset;
  if (list && !Array.isArray(list) && typeof list === 'object') {
    if (!Array.isArray(list.cases)) {
      return fail(
        'Expected an array of cases or an object with a "cases" array',
      );
    }
    list = list.cases;
  }
  if (!Array.isArray(list)) {
    return fail('Expected an array of cases or an object with a "cases" array');
  }
  if (list.length === 0) return fail('The dataset has no cases');

  const cases = [];
  const seenIds = new Map();
  const seenPrompts = new Map();

  list.forEach((raw, index) => {
    const label = `Case ${index + 1}`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      errors.push({
        index,
        id: null,
        field: null,
        message: `${label} is not an object`,
      });
      return;
    }

    const id =
      raw.id === undefined || raw.id === null ? `case-${index + 1}` : raw.id;
    const caseId = typeof id === 'number' ? String(id) : id;
    const issue = (level, field, message) =>
      (level === 'error' ? errors : warnings).push({
        index,
        id: typeof caseId === 'string' ? caseId : null,
        field,
        message: `${label}: ${message}`,
      });

    if (!isNonEmptyString(caseId)) {
      issue('error', 'id', '"id" must be a non-empty string or a number');
    } else if (seenIds.has(caseId)) {
      issue(
        'error',
        'id',
        `id "${caseId}" is also used by case ${seenIds.get(caseId) + 1}`,
      );
    } else {
      seenIds.set(caseId, index);
    }

    const prompt = readAliased(raw, 'prompt', issue);
    if (!prompt) {
      issue('error', 'prompt', 'missing "prompt" (or "question")');
    } else if (!isNonEmptyString(prompt.value)) {
      issue('error', 'prompt', `"${prompt.name}" must be a non-empty string`);
    } else {
      const key = prompt.value.trim().toLowerCase();
      if (seenPrompts.has(key)) {
        issue(
          'warning',
          'prompt',
          `same question as case ${seenPrompts.get(key) + 1}`,
        );
      } else {
        seenPrompts.set(key, index);
      }
    }

    const expected = readAliased(raw, 'expected', issue);
    if (expected && !isNonEmptyString(expected.value)) {
      issue(
        'error',
        'expected',
        `"${expected.name}" must be a non-empty string`,
      );
    } else if (!expected && requireExpected) {
      issue('error', 'expected', 'missing "expected" (or "referenceAnswer")');
    }

    let sourceIds;
    if (raw.sourceIds !== undefined) {
      const valid =
        Array.isArray(raw.sourceIds) &&
        raw.sourceIds.every(
          (s) => isNonEmptyString(s) || (typeof s === 'number' && isFinite(s)),
        );
      if (!valid) {
        issue(
          'error',
          'sourceIds',
          '"sourceIds" must be an array of document ids (strings or numbers)',
        );
      } else if (raw.sourceIds.length === 0) {
        issue(
          'warning',
          'sourceIds',
          '"sourceIds" is empty, so retrieval is not checked for this case',
        );
      } else {
        sourceIds = [...new Set(raw.sourceIds.map(String))];
        if (sourceIds.length < raw.sourceIds.length) {
          issue('warning', 'sourceIds', '"sourceIds" lists an id twice');
        }
      }
    } else if (requireSourceIds) {
      issue('error', 'sourceIds', 'missing "sourceIds"');
    }

    if (
      raw.tags !== undefined &&
      !(Array.isArray(raw.tags) && raw.tags.every(isNonEmptyString))
    ) {
      issue('error', 'tags', '"tags" must be an array of strings');
    }

    const normalised = { ...raw, id: caseId };
    delete normalised.question;
    delete normalised.referenceAnswer;
    if (prompt) normalised.prompt = prompt.value;
    if (expected) normalised.expected = expected.value;
    if (sourceIds) normalised.sourceIds = sourceIds;
    cases.push(normalised);
  });

  const valid = errors.length === 0;
  return { valid, errors, warnings, cases: valid ? cases : [] };
}

module.exports = { validateDataset };
