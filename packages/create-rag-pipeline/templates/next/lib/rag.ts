/**
 * Retrieval over the Markdown files in docs/: indexed in memory on first use
 * with the library's built-in TF-IDF embedder, so there is no database and
 * no embedding API. Swap in a vector store (QdrantRetriever,
 * PgVectorRetriever) and an embedding model when the documents outgrow
 * memory.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { LocalEmbedder, MemoryRetriever } from "@devilsdev/rag-pipeline-utils";

const DOCS_DIR = path.join(process.cwd(), "docs");

let index:
  | Promise<{ embedder: LocalEmbedder; retriever: MemoryRetriever }>
  | undefined;

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

/** The embedder and retriever, built once per server process. */
export function getIndex() {
  index ??= buildIndex();
  return index;
}
