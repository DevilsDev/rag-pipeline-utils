# Plugins

The toolkit is fully modular. You can inject your own loaders, retrievers, embedders, or LLMs.

---

## Plugin Architecture

All plugins follow a strict interface pattern. Each is registered under a namespace using the plugin registry:

```ts
registry.register('loader', 'my-custom', new MyLoader());
const loader = registry.get('loader', 'my-custom');
```

You can register plugins for:
- `loader`
- `embedder`
- `retriever`
- `llm`

---

## Loader Example

```ts
class MyMarkdownLoader {
  async load(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return [{ chunk: () => raw.split('\n\n') }];
  }
}
```

Register it:
```ts
registry.register('loader', 'md', new MyMarkdownLoader());
```

---

## Runtime Override

CLI and API will resolve plugin names from `pluginRegistry`. Use:

```json
{
  "loader": "md",
  "embedder": "cohere",
  "retriever": "chroma",
  "llm": "openai-gpt-4"
}
```

in `.ragrc.json`

---

This design keeps the core minimal and lets you evolve.

Next → [FAQ](./FAQ.md)
