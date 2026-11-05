/**
 * Retrieval over the Markdown files in docs/: indexed in memory on first use
 * with the library's built-in TF-IDF embedder, so there is no database and
 * no embedding API. Swap in a vector store (QdrantRetriever,
 * PgVectorRetriever) and an embedding model when the documents outgrow
 * memory.
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { LocalEmbedder, MemoryRetriever } from "@devilsdev/rag-pipeline-utils";

export interface Passage {
  id: string;
  content: string;
  source?: string;
  score?: number;
}

/**
 * The project's docs/ folder: the nearest one at or above the working
 * directory, since `mastra dev` and `mastra build` run from folders inside
 * the project. Set DOCS_DIR to read another folder.
 */
function findDocsDir(): string {
  if (process.env.DOCS_DIR) return path.resolve(process.env.DOCS_DIR);
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "docs");
    if (existsSync(candidate)) return candidate;
    if (path.dirname(dir) === dir) return path.resolve("docs");
  }
}

const DOCS_DIR = findDocsDir();

let index: Promise<{ embedder: LocalEmbedder; retriever: MemoryRetriever }>;

async function buildIndex() {
  const files = (await readdir(DOCS_DIR)).filter((f) => /\.(md|txt)$/i.test(f));
  const documents = await Promise.all(
    files.map(async (file) => ({
      id: file.replace(/\.[^.]+$/, ""),
      content: await readFile(path.join(DOCS_DIR, file), "utf8"),
      metadata: { source: file },
    })),
  );
  const embedder = new LocalEmbedder();
  embedder.train(documents);
  const retriever = new MemoryRetriever();
  await retriever.store(
    await Promise.all(
      documents.map(async (doc) => ({
        ...doc,
        vector: await embedder.embed(doc.content),
      })),
    ),
  );
  return { embedder, retriever };
}

/** The passages that best match a query. */
export async function searchDocuments(
  query: string,
  topK = 3,
): Promise<Passage[]> {
  index ??= buildIndex();
  const { embedder, retriever } = await index;
  const results = await retriever.retrieve({
    query,
    queryVector: await embedder.embed(query),
    topK,
  });
  return results.map((r: any) => ({
    id: r.id,
    content: r.content,
    source: r.metadata?.source,
    score: r.score,
  }));
}
