# FAQ

### ❓ Can I use this with my own vector database?
Yes! You can implement the `Retriever` interface and register it:
```ts
registry.register('retriever', 'mydb', new MyRetriever());
```
Then use it via CLI or `.ragrc.json`.

---

### ❓ Is streaming LLM response supported?
Yes. LLM runners can yield async output tokens. This is handled internally via `AsyncIterable` in compatible models.

---

### ❓ How do I evaluate performance?
Use `rag-pipeline evaluate dataset.json` or open the dashboard at `http://localhost:3000` to visualize BLEU/ROUGE and pass rates.

---

### ❓ What file types can I ingest?
Currently supported:
- `.pdf` (mocked)
- `.md`
- `.html`
- `.csv`
- Full directory ingestion

---

### ❓ Can I rerank results using a local model?
Yes, as long as your local LLM implements:
```ts
llm.generate(prompt, context): Promise<string>
```
Use it to power `LLMReranker`.

---

### ❓ How do I contribute?
Fork the repo → add your plugin or CLI feature → test → submit PR.

---

Still stuck? Open an issue at [GitHub](https://github.com/DevilsDev/rag-pipeline-utils/issues).

---

Next → [Back to Introduction](./Introduction.md)
