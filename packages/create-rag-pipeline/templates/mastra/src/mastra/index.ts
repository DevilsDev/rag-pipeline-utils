import { Mastra } from "@mastra/core/mastra";
import { InMemoryStore } from "@mastra/core/storage";
import { docsAgent } from "./agents/docs-agent";

export const mastra = new Mastra({
  agents: { docsAgent },
  // Lost on restart: use @mastra/libsql or @mastra/pg to keep threads and scores
  storage: new InMemoryStore(),
});
