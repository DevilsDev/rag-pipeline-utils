'use strict';

/**
 * Checks input against a maximum length and a fixed list of disallowed
 * tokens (code fences, `${`, `</script`, `--`, `;`, `||`, `&&`).
 * @param {*} input - Converted to a string
 * @param {Object} [opts]
 * @param {number} [opts.maxLength=20000]
 * @returns {{valid: boolean, reasons: string[], sanitized: string}} `sanitized` is the input cut to `maxLength`
 */
function validateInput(input, opts = {}) {
  const maxLength = opts.maxLength || 20000;
  const inputStr = String(input);

  const reasons = [];

  // Check length
  if (inputStr.length > maxLength) {
    reasons.push(`Input exceeds maximum length of ${maxLength} characters`);
  }

  // Disallowed tokens (case-insensitive)
  const disallowedTokens = ['```', '${', '</script', '--', ';', '||', '&&'];
  const lowerInput = inputStr.toLowerCase();

  for (const token of disallowedTokens) {
    if (lowerInput.includes(token.toLowerCase())) {
      reasons.push(`Input contains disallowed token: ${token}`);
    }
  }

  const valid = reasons.length === 0;
  const sanitized = inputStr.substring(0, maxLength);

  return {
    valid,
    reasons,
    sanitized,
  };
}

module.exports = { validateInput };
