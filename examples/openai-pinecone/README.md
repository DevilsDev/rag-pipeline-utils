# OpenAI + Pinecone RAG Pipeline Example

This example demonstrates a complete production-ready RAG pipeline using:

- **OpenAI** for embeddings and text generation
- **Pinecone** for vector storage and retrieval
- **RAG Pipeline Utils** for orchestration

## Features

- ✅ Real OpenAI API integration
- ✅ Real Pinecone vector database integration
- ✅ Mock mode for testing without API keys
- ✅ Document ingestion with chunking
- ✅ Semantic search with vector similarity
- ✅ Context-aware answer generation

## Prerequisites

- Node.js 18 or higher
- OpenAI API key (sign up at https://platform.openai.com/)
- Pinecone API key (sign up at https://www.pinecone.io/)

## Setup

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Configure environment variables**:

   ```bash
   cp .env.example .env
   ```

3. **Edit `.env` with your API keys**:

   ```
   OPENAI_API_KEY=sk-your-actual-key
   PINECONE_API_KEY=your-actual-key
   PINECONE_ENVIRONMENT=us-east-1-aws
   PINECONE_INDEX_NAME=rag-pipeline-demo
   ```

4. **Create Pinecone index** (if not exists):
   - Go to Pinecone console
   - Create a new index named `rag-pipeline-demo`
   - Set dimension to `1536` (OpenAI text-embedding-3-small)
   - Choose your preferred metric (cosine recommended)

## Usage

### With Real APIs

```bash
npm start
```

### With Mock Mode (No API Keys Required)

```bash
npm run mock
```

Or:

```bash
USE_MOCK_MODE=true npm start
```

## How It Works

1. **Document Loading**: Sample documents are loaded into memory
2. **Embedding Generation**: OpenAI creates vector embeddings for each document
3. **Vector Storage**: Embeddings are stored in Pinecone with metadata
4. **Query Processing**: User query is embedded using the same model
5. **Semantic Search**: Pinecone finds most relevant documents by vector similarity
6. **Answer Generation**: OpenAI generates answer using retrieved context

## Expected Output

```
🚀 RAG Pipeline - OpenAI + Pinecone Integration
================================================

📄 Loading documents...
   Loaded 3 documents

🔢 Generating embeddings...
   Generated embeddings for 3 documents

💾 Storing in Pinecone...
   Stored 3 vectors in Pinecone index

🔍 Query: What is machine learning?

📊 Retrieved 3 relevant documents

💡 Answer:
Machine learning is a subset of artificial intelligence that enables
computers to learn from data without being explicitly programmed...

✅ Pipeline completed successfully!
```

## Customization

### Change the Documents

Edit the `documents` array in `index.js`:

```javascript
const documents = [
  { id: "your-id", content: "Your content here" },
  // Add more documents...
];
```

### Adjust Retrieval Settings

Modify retrieval parameters:

```javascript
const results = await retriever.retrieve(query, {
  topK: 5, // Number of results
  minScore: 0.7, // Minimum similarity score
  includeMetadata: true, // Include document metadata
});
```

### Use Different OpenAI Models

```javascript
// For embeddings
const embedder = new OpenAIEmbedder({
  model: "text-embedding-3-large", // Higher quality, more expensive
});

// For LLM
const llm = new OpenAILLM({
  model: "gpt-4", // More capable model
  temperature: 0.7, // Creativity level
  maxTokens: 500, // Response length
});
```

## Cost Considerations

### OpenAI Pricing (as of 2025)

- **text-embedding-3-small**: $0.02 per 1M tokens
- **gpt-3.5-turbo**: $0.50 per 1M input tokens, $1.50 per 1M output tokens

### Pinecone Pricing

- **Free tier**: 1 index, 100K vectors
- **Paid plans**: Start at $70/month for production usage

### Cost Optimization

- Use mock mode for development
- Batch document processing
- Cache embeddings locally
- Implement rate limiting

## Troubleshooting

### "Invalid API key" error

Ensure your `.env` file contains valid API keys without quotes:

```
OPENAI_API_KEY=sk-abc123
```

### "Index not found" error

Create the Pinecone index first or update `PINECONE_INDEX_NAME` to match your existing index.

### "Dimension mismatch" error

Ensure your Pinecone index dimension (1536) matches the OpenAI embedding model output.

### Connection timeout

Check your network connection and API service status:

- OpenAI: https://status.openai.com/
- Pinecone: https://status.pinecone.io/

## Next Steps

- Add document chunking for large texts
- Implement caching layer for embeddings
- Add reranking for improved relevance
- Integrate with your application database
- Deploy to production with proper error handling

## Resources

- [RAG Pipeline Utils Documentation](https://github.com/DevilsDev/rag-pipeline-utils)
- [OpenAI API Documentation](https://platform.openai.com/docs)
- [Pinecone Documentation](https://docs.pinecone.io/)
- [RAG Architecture Guide](https://www.pinecone.io/learn/retrieval-augmented-generation/)

## License

GPL-3.0
