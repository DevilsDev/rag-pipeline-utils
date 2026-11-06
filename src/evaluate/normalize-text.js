'use strict';

/**
 * Text normalisation shared by tokenizing, sentence splitting and the
 * grounding checks, so a source extracted from a PDF or a web page reads the
 * same as typed text: format characters (zero-width spaces and joiners, soft
 * hyphens, byte-order marks, direction marks) are removed, and NFKC folds
 * full-width digits and letters to ASCII and every kind of space, such as
 * the no-break space, to a plain space.
 */

const FORMAT_CHAR = /\p{Cf}/u;
const FORMAT_CHARS = /\p{Cf}/gu;
// ASCII text has no format characters and is already NFKC
const NON_ASCII = /[^\x00-\x7F]/;

/**
 * @param {string} text
 * @returns {string} The text with format characters removed, in NFKC
 */
function normalizeText(text) {
  const source = String(text);
  if (!NON_ASCII.test(source)) return source;
  return source.replace(FORMAT_CHARS, '').normalize('NFKC');
}

/**
 * normalizeText one character at a time, keeping where each character of
 * the result came from, so positions found in the normalised text can be
 * mapped back to the original (sentence splitting returns the original
 * text). Per character, NFKC doesn't compose combining marks with the
 * letter before them, which doesn't move any sentence boundary.
 *
 * @param {string} text
 * @returns {{ text: string, offsets: number[] }} `offsets[i]` is the index in
 *   `text` of the character that produced character i of the result;
 *   `offsets[result.length]` is `text.length`
 */
function normalizeWithOffsets(text) {
  const source = String(text);
  if (!NON_ASCII.test(source)) {
    const offsets = new Array(source.length + 1);
    for (let i = 0; i <= source.length; i++) offsets[i] = i;
    return { text: source, offsets };
  }
  let out = '';
  const offsets = [];
  let i = 0;
  for (const char of source) {
    if (!FORMAT_CHAR.test(char)) {
      const folded = char.normalize('NFKC');
      out += folded;
      for (let k = 0; k < folded.length; k++) offsets.push(i);
    }
    i += char.length;
  }
  offsets.push(source.length);
  return { text: out, offsets };
}

module.exports = { normalizeText, normalizeWithOffsets };
