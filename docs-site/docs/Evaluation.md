# Evaluation

This module allows you to evaluate the quality of generated LLM responses in a RAG pipeline.

---

## 🎯 Objective

Quantify how well the pipeline performs on question-answer pairs using:
- **BLEU**: Precision on matching tokens
- **ROUGE**: Recall + overlap on longest subsequences
- **LLM Feedback** *(planned)*: Score generation based on LLM ratings

---

## 📄 Dataset Format

Each entry in your JSON dataset should include:

```json
{
  "prompt": "What is a vector index?",
  "groundTruth": "A data structure for fast similarity search in vector spaces."
}
```

Saved as: `sample-eval-dataset.json`

---

## 🚀 CLI Evaluation

```bash
rag-pipeline evaluate ./fixtures/sample-eval-dataset.json
```

Outputs:
- ✅ Pass/fail per item
- 📊 BLEU/ROUGE scores
- 📈 Aggregated metrics

---

## 📊 Dashboard Visualization

Use the React dashboard under `/public`:

```bash
node server.js
```

Visit: [http://localhost:3000](http://localhost:3000)

Displays:
- Prompt vs Answer
- Success criteria
- Metric charts (BLEU, ROUGE)

---

Next → [Plugins](./Plugins.md)
