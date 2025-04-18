# CLI Reference

The CLI gives you interactive access to the RAG pipeline tools via terminal.

Install globally (optional):
```bash
npm install -g @yourorg/rag-pipeline-utils
```

Or run directly from your project:
```bash
npx rag-pipeline <command>
```

---

## Commands

### `ingest`
```bash
rag-pipeline ingest ./docs/sample.pdf --loader pdf
```
- Loads and indexes documents into vector store

### `query`
```bash
rag-pipeline query "Explain vector databases" --llm openai-gpt-4
```
- Retrieves context and generates response

### `evaluate`
```bash
rag-pipeline evaluate ./fixtures/eval.json
```
- Runs batch evaluation with BLEU/ROUGE scoring

### `rerank`
```bash
rag-pipeline rerank "What is RAG?" --retriever pinecone
```
- Reorders retrieved context using an LLM reranker

---

## `.ragrc.json` Config

Defaults can be set in a file:
```json
{
  "loader": "directory",
  "embedder": "openai",
  "retriever": "pinecone",
  "llm": "openai-gpt-4",
  "useReranker": true
}
```

---

##  Docker Usage

```bash
docker build -t rag-pipeline .
docker run --rm -v $PWD:/data rag-pipeline query "What is retrieval?"
```

---

Next → [Architecture](./Architecture.md)
