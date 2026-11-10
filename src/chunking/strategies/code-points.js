'use strict';

/**
 * Cut `text` into consecutive slices of at most `size` UTF-16 units without
 * ever splitting a surrogate pair (so emoji and other astral characters stay
 * whole). Every character of the input appears in exactly one slice.
 *
 * @param {string} text - Text to cut.
 * @param {number} size - Maximum slice length (at least 1).
 * @returns {string[]} Consecutive slices.
 */
function sliceOnCodePoints(text, size) {
  const max = Math.max(1, Math.floor(size) || 1);
  const slices = [];
  let pos = 0;
  while (pos < text.length) {
    let end = Math.min(pos + max, text.length);
    if (end < text.length) {
      const last = text.charCodeAt(end - 1);
      const next = text.charCodeAt(end);
      const splitsPair =
        last >= 0xd800 && last <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
      if (splitsPair) {
        // Back off one unit; if the budget is a single unit, take the whole pair.
        end = end - pos > 1 ? end - 1 : end + 1;
      }
    }
    slices.push(text.slice(pos, end));
    pos = end;
  }
  return slices;
}

module.exports = { sliceOnCodePoints };
