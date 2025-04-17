/**
 * Version: 1.1.0
 * Description: Final CLI entrypoint with dynamic plugin loading and full config validation
 * Author: Ali Kahwaji
 */

import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { loadRagConfig } from '../src/config/load-config.js';
import { loadPluginsFromJson } from '../src/config/load-plugin-config.js';
import registry from '../src/core/plugin-registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const CONFIG_PATH = resolve('.ragrc.json');

const args = process.argv.slice(2);
const command = args[0];

async function runCLI() {
  try {
    const config = loadRagConfig(CONFIG_PATH);
    await loadPluginsFromJson(CONFIG_PATH);

    switch (command) {
      case 'ingest': {
        const input = args[1];
        const loader = registry.get('loader', Object.keys(config.loader)[0]);
        const embedder = registry.get('embedder', Object.keys(config.embedder)[0]);
        const retriever = registry.get('retriever', Object.keys(config.retriever)[0]);

        const docs = await loader.load(input);
        const vectors = await embedder.embed(docs);
        await retriever.store(vectors, config.namespace);

        console.log('Ingestion complete');
        break;
      }
      case 'query': {
        const question = args.slice(1).join(' ');
        const embedder = registry.get('embedder', Object.keys(config.embedder)[0]);
        const retriever = registry.get('retriever', Object.keys(config.retriever)[0]);
        const llm = registry.get('llm', Object.keys(config.llm)[0]);

        const queryVec = await embedder.embedQuery(question);
        const docs = await retriever.search(queryVec, config.namespace);
        const answer = await llm.ask(question, docs);

        console.log('Answer:', answer);
        break;
      }
      default:
        console.error('Unknown command:', command);
        process.exit(1);
    }
  } catch (err) {
    console.error('Error during execution:', err.message);
    process.exit(1);
  }
}

await runCLI();
