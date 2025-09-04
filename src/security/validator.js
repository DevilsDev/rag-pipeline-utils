"use strict";
function validateInput(input) {
  if (typeof input === "string") {
    const patterns = [
      /[<>'"&]/,
      /\b(eval|exec|system)\b/i,
      /[;|&`$(){}]/,
      /__proto__|constructor/i,
    ];
    if (patterns.some((p) => p.test(input)))
      throw new Error("Input contains malicious content");
  } else if (Array.isArray(input)) {
    input.forEach(validateInput);
  } else if (input && typeof input === "object") {
    Object.values(input).forEach(validateInput);
  }
}
module.exports = { validateInput };
