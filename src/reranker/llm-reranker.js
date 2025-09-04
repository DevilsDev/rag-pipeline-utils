"use strict";

class LLMReranker {
  constructor({ llm } = {}) {
    this.llm = llm || {
      async generate() {
        return "[]";
      },
    };
  }

  async rerank(prompt, docs) {
    const raw = await (this.llm.generate?.(prompt, docs) ?? "[]");
    let order;
    try {
      order = JSON.parse(raw);
    } catch {
      order = [];
    }
    if (!Array.isArray(order) || order.length !== docs.length) return docs;
    return order.map((i) => docs[i]).filter(Boolean);
  }
}

module.exports = { LLMReranker };
