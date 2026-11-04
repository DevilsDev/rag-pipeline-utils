# Integration listings: AI SDK, Mastra and LangChain.js

Checked 2026-11-04. These are drafts. Nothing has been forked, filed or opened on any of these repositories; each step below is for the maintainer to take under their own account. Read the target's contributing rules again before submitting, since they change.

Summary:

| Target        | Where third-party integrations are listed                                         | Fit                                        |
| ------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| Vercel AI SDK | "Community Middleware" on the Language Model Middleware page (docs PR)            | Good fit; low odds of a quick merge        |
| Mastra        | Nowhere for third-party packages; outside pull requests are disabled              | No route today                             |
| LangChain.js  | Integration listing issue form, for packages that implement a LangChain component | Not eligible until there is such a package |

## Vercel AI SDK

**Where:** [vercel/ai](https://github.com/vercel/ai), file `content/docs/03-ai-sdk-core/40-middleware.mdx`, section "Community Middleware" ([live page](https://ai-sdk.dev/docs/ai-sdk-core/middleware#community-middleware)). The section says community members can build middleware to the Language Model Middleware specification, and lists one today (`@ai-sdk-tool/parser`). `groundingMiddleware` is such a middleware, so this is the right place.

**Guidelines:** [CONTRIBUTING.md](https://github.com/vercel/ai/blob/main/CONTRIBUTING.md) and [contributing/documentation.md](https://github.com/vercel/ai/blob/main/contributing/documentation.md): docs live under `content/`, PR titles for docs start with `docs:`, run `npm run fix` for formatting, and **every commit must be signed** (unsigned PRs can't be merged). The repo needs pnpm 11 and Node 22.13, 24 or 26. The PR template is `.github/pull_request_template.md`.

**Honest assessment:** the fit is right, but the odds of a quick merge are low. Five "add X to community middleware" PRs are open, and none of the ones found has been merged; [#14547](https://github.com/vercel/ai/pull/14547) has been open since 2026-04-16 with no comments. They all insert at the same spot, so expect a rebase. Community _provider_ PRs do get merged (ZeroGPU on 2026-11-03), but they are for model providers.

Other AI SDK listings that don't fit:

- **Community providers** (`content/providers/05-community-providers/`): for packages that implement the Language Model Specification. This library wraps a model; it isn't one.
- **Tools registry** (`content/tools-registry/registry.ts`, [guide](https://github.com/vercel/ai/blob/main/contributing/add-new-tool-to-registry.md)): for packages that export an AI SDK `tool()`. This library doesn't export one.

**Content to add**, after the `@ai-sdk-tool/parser` entry (after its "Find more examples" line) and before `## Implementing Language Model Middleware`. It follows the page's style: a `###` heading, a paragraph with a link, a short `ts` block with single quotes. The snippet uses `specificationVersion: 'v4'`, which is what AI SDK 7 expects for TypeScript (the library defaults to `'v3'` for AI SDK 6).

<!-- prettier-ignore -->
````mdx
### Grounding and answer checks

The [rag-pipeline-utils](https://github.com/DevilsDev/rag-pipeline-utils) grounding middleware adds retrieval-augmented generation to any model: it retrieves passages for the last user message, adds them to the prompt as untrusted reference data, and checks the answer against them. The report (whether every sentence is supported, the unsupported sentences, and per-sentence citations) is returned in `providerMetadata.ragPipeline`, and the passages are returned as `sources`. Optional guardrails detect prompt injection in the query and retrieved documents, filter documents by permission, and redact PII from the answer.

```ts
import { generateText, wrapLanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { groundingMiddleware } from '@devilsdev/rag-pipeline-utils';

const model = wrapLanguageModel({
  model: openai('gpt-5-mini'),
  middleware: groundingMiddleware({
    retriever, // any object with retrieve(), such as the package's in-memory, pgvector or Qdrant stores
    embedder, // embeds the query for vector retrievers
    topK: 4,
    specificationVersion: 'v4',
  }),
});

const { text, sources, providerMetadata } = await generateText({
  model,
  prompt: 'How many vacation days do I get?',
});

providerMetadata?.ragPipeline?.grounded; // false if any sentence is unsupported
```

`streamText` works the same way. See the [middleware documentation](https://devilsdev.github.io/rag-pipeline-utils/docs/Integrations#ground-an-ai-sdk-app-with-middleware) for the options and guardrails.
````

**PR title:** `docs: add rag-pipeline-utils grounding middleware to community middleware`

**PR body** (their template; the checklist is left as is, as the template asks, and End-to-End Verification is removed because this is a docs change):

```markdown
## Background

The "Community Middleware" section of the Language Model Middleware page lists middleware built to the middleware specification. This adds one for retrieval and grounding.

## Summary

Adds a "Grounding and answer checks" entry to the Community Middleware section of `content/docs/03-ai-sdk-core/40-middleware.mdx`, after the `@ai-sdk-tool/parser` entry.

`groundingMiddleware` from `@devilsdev/rag-pipeline-utils` (MIT, on npm) works with `wrapLanguageModel`. It retrieves passages for the last user message, checks the answer against them, reports the result in `providerMetadata.ragPipeline`, and returns the passages as `sources`. It supports `generateText` and `streamText`, and is tested against AI SDK 6 and 7 (`specificationVersion` `'v3'` and `'v4'`).

- npm: https://www.npmjs.com/package/@devilsdev/rag-pipeline-utils
- Docs: https://devilsdev.github.io/rag-pipeline-utils/docs/Integrations#ground-an-ai-sdk-app-with-middleware

## Checklist

- [ ] All commits are signed (PRs with unsigned commits cannot be merged)
- [ ] Tests have been added / updated (for bug fixes / features)
- [ ] Documentation has been added / updated (for bug fixes / features)
- [ ] A _patch_ changeset for relevant packages has been added (for bug fixes / features - run `pnpm changeset` in the project root)
- [ ] I have reviewed this pull request (self-review)
```

Tick the signed-commits and self-review boxes once they're true; the others don't apply to a docs PR.

**Steps (not done):**

1. Fork `vercel/ai` and clone the fork. Make sure commit signing is set up (`git config commit.gpgsign true` with a GPG or SSH signing key).
2. `git checkout -b docs/community-middleware-rag-pipeline-utils`
3. Edit `content/docs/03-ai-sdk-core/40-middleware.mdx` as above.
4. `pnpm install` (pnpm 11), then `npm run fix`.
5. Run the snippet once against the current `ai` release with a real retriever and embedder, so the example is known to work.
6. `git commit -S -m "docs: add rag-pipeline-utils grounding middleware to community middleware"`, push, open the PR with the title and body above.
7. Don't ping maintainers; if it sits, leave it.

## Mastra

**Where:** there is no place for a third-party package today.

- [CONTRIBUTING.md](https://github.com/mastra-ai/mastra/blob/main/CONTRIBUTING.md): "This repository disabled pull requests for outside contributors." Contributors are asked to open issues instead.
- The [integrations page](https://mastra.ai/integrations) is built from `docs/src/content/en/integrations/sidebars.js`. Every entry is a Mastra-maintained package (`@mastra/tavily`, `@mastra/arthur` and so on) or a link to Mastra's own platform pages. Its categories are Channels, Frameworks, Agentic UI, Sandboxes, Observability, Databases, Deploy, Tools, Voice, Auth, Browsers, File storage and Vector stores; none covers evaluation scorers or guardrail processors.
- The "Integration Request" issue form (`.github/ISSUE_TEMPLATE/integration_request.yml`) asks Mastra to build an integration with a service. It isn't a way to list an existing package, and using it that way would be off-topic.
- Templates (mastra.ai/templates) are example apps kept in the Mastra monorepo, not package listings. Whether submissions are open right now is unclear (one version of the docs page says they're paused, the current page doesn't say).

**Honest assessment:** no fit. Don't file anything. `createMastraScorer` and `createMastraGuardrails` are documented on our side ([Mastra section](https://devilsdev.github.io/rag-pipeline-utils/docs/Integrations#mastra)), and the `mastra` topic is already on the GitHub repository. Revisit if Mastra adds a community or third-party section, or reopens pull requests. Mastra's Discord may have a place to share projects; that wasn't checked.

## LangChain.js

**Where:** listings go through an issue form, not a pull request: [Integration listing](https://github.com/langchain-ai/docs/issues/new?template=06-integration-submission.yml) in [langchain-ai/docs](https://github.com/langchain-ai/docs). After a maintainer adds the `integration-run` label, automation opens a PR adding a row to `scripts/data/integration_external_docs.yaml`. The process is active (about 110 listing issues since August 2026).

**Guidelines:** [Contributing integrations](https://docs.langchain.com/oss/javascript/contributing/integrations-langchain) and [Publish an integration](https://docs.langchain.com/oss/javascript/contributing/publish-langchain#make-your-integration-discoverable):

- The listing is for a **published package that implements a LangChain component**. The form asks for one component type (chat, tools, middleware, vectorstores, callbacks, embeddings, retrievers, ...). LangChain encourages chat models, tools, retrievers, embeddings, vector stores, middleware and sandboxes, and discourages callbacks, document loaders and others.
- Manual listing PRs from outside contributors are closed by automation and pointed to the form. (The JS middleware page still says "Open a PR to the docs repo"; the publish guide overrides it.)
- A hosted guide page needs 50,000 monthly npm downloads, or a maintainer marking it featured. This package had 2,323 downloads from 2026-10-04 to 2026-11-02, so it would get a table row linking to our docs, not a page.
- AI-assisted content is allowed only if every change is verified ([acceptable uses of LLMs](https://docs.langchain.com/oss/javascript/contributing/overview#acceptable-uses-of-llms)).

**Honest assessment:** not eligible as the package stands. `checkAnswer` accepts LangChain `Document`s, but that isn't a LangChain component: there is no retriever, agent middleware or callback class to list. Filing it under "middleware" or "retrievers" would misrepresent it.

What would make it eligible: a small export that implements a LangChain component, for example an agent middleware for `createAgent` that runs `checkAnswer` on the model's answer against the retrieved documents and reports or blocks unsupported answers (the same job `groundingMiddleware` does for the AI SDK). That's a feature to build first; it could go on the 3.4 candidate list. Once it is published, file the form with:

| Form field                 | Value                                                                                          |
| -------------------------- | ---------------------------------------------------------------------------------------------- |
| Display or class name      | the exported class or function name                                                            |
| Language                   | TypeScript                                                                                     |
| Component type             | middleware                                                                                     |
| npm package name           | `@devilsdev/rag-pipeline-utils` (or the separate package, if it ships as one)                  |
| Docs URL                   | the docs page for the LangChain middleware, on https://devilsdev.github.io/rag-pipeline-utils/ |
| Source repository          | `DevilsDev/rag-pipeline-utils`                                                                 |
| Short provider description | one factual sentence, under 160 characters, describing only what the middleware does           |

The LangChain.js comparison on our side is already published ([Comparison](https://devilsdev.github.io/rag-pipeline-utils/docs/Comparison)) and needs no submission.

## Not drafted

- **LlamaIndex.TS:** the repository is archived, so there is nowhere to submit.
- **Langfuse:** third-party integration pages exist in [langfuse/langfuse-docs](https://github.com/langfuse/langfuse-docs) under `content/integrations/` (for example `other/` and `frameworks/`). That is the place for the recipe planned after the 3.4 score export (`toLangfuseScores()`); there is nothing to show until then.
- **Arize Phoenix:** has integration docs under `docs/phoenix/integrations/` in [Arize-ai/phoenix](https://github.com/Arize-ai/phoenix), including evaluation integrations. Same timing as Langfuse: after 3.4.

## Order

1. The AI SDK docs PR, any time. It doesn't depend on the launch posts.
2. LangChain.js after a LangChain middleware export ships.
3. Langfuse and Phoenix recipes after 3.4.
4. Mastra only if they open a route for third-party packages.
