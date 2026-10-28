import React, { useEffect, useMemo, useState } from "react";
import CodeBlock from "@theme/CodeBlock";
import {
  STAGES,
  OPTIONS,
  DEFAULT_INDEX_PATH,
  buildRagrc,
  matchingTemplate,
  requiredEnv,
} from "@site/src/lib/ragrcBuilder";
import styles from "./styles.module.css";

const OPTION_LABELS = {
  model: "Model",
  embeddingModel: "Embedding model",
  baseURL: "Server URL",
};

const STAGE_TITLES = {
  embedder: "Embedder",
  retriever: "Retriever",
  reranker: "Reranker",
  llm: "Language model",
};

function StagePicker({ stage, value, onChange }) {
  return (
    <fieldset className={styles.stage}>
      <legend>{STAGE_TITLES[stage]}</legend>
      <div className={styles.choices}>
        {STAGES[stage].map((choice) => {
          const id = `${stage}-${choice.label}`;
          return (
            <label key={id} htmlFor={id} className={styles.choice}>
              <input
                id={id}
                type="radio"
                name={stage}
                checked={value === choice.value}
                onChange={() => onChange(choice.value)}
              />
              <span className={styles.choiceName}>{choice.label}</span>
              {choice.note && (
                <span className={styles.choiceNote}>{choice.note}</span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function OptionFields({ stage, provider, values, onChange }) {
  const defaults = OPTIONS[stage][provider];
  if (!defaults) return null;
  return (
    <div className={styles.options}>
      {Object.entries(defaults).map(([key, placeholder]) => {
        const id = `${stage}-${provider}-${key}`;
        return (
          <label key={id} htmlFor={id} className={styles.option}>
            <span>
              {OPTION_LABELS[key]} <small>(optional)</small>
            </span>
            <input
              id={id}
              type="text"
              spellCheck={false}
              placeholder={placeholder}
              value={values[key] || ""}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
            />
          </label>
        );
      })}
    </div>
  );
}

/** Interactive .ragrc.json builder; output matches `rag-pipeline init`. */
export default function ConfigBuilder() {
  const [embedder, setEmbedder] = useState("local");
  const [retriever, setRetriever] = useState("file-store");
  const [reranker, setReranker] = useState(null);
  const [llm, setLlm] = useState(null);
  const [embedderConfig, setEmbedderConfig] = useState({});
  const [llmConfig, setLlmConfig] = useState({});
  const [indexPath, setIndexPath] = useState("");
  const [copied, setCopied] = useState(false);
  // Set after hydration: a timestamp computed during server rendering would
  // differ from the browser's, and React would re-render the whole builder.
  const [createdAt, setCreatedAt] = useState("");
  useEffect(() => setCreatedAt(new Date().toISOString()), []);

  const selection = { embedder, retriever, reranker, llm };
  const json = useMemo(
    () =>
      JSON.stringify(
        buildRagrc({
          ...selection,
          embedderConfig,
          llmConfig,
          indexPath: indexPath.trim() || DEFAULT_INDEX_PATH,
          createdAt,
        }),
        null,
        2,
      ),
    [
      embedder,
      retriever,
      reranker,
      llm,
      embedderConfig,
      llmConfig,
      indexPath,
      createdAt,
    ],
  );

  const template = matchingTemplate(selection);
  const env = requiredEnv(selection);
  const noCustomOptions =
    Object.values(embedderConfig).every((v) => !v || !v.trim()) &&
    Object.values(llmConfig).every((v) => !v || !v.trim()) &&
    !indexPath.trim();

  const pick = (setter, reset) => (value) => {
    setter(value);
    if (reset) reset({});
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked; the code block's own copy button still works.
    }
  };

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([json + "\n"], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = ".ragrc.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.builder}>
      <div className={styles.form}>
        <StagePicker
          stage="embedder"
          value={embedder}
          onChange={pick(setEmbedder, setEmbedderConfig)}
        />
        <OptionFields
          stage="embedder"
          provider={embedder}
          values={embedderConfig}
          onChange={setEmbedderConfig}
        />

        <StagePicker
          stage="retriever"
          value={retriever}
          onChange={setRetriever}
        />
        {retriever === "file-store" && (
          <div className={styles.options}>
            <label htmlFor="index-path" className={styles.option}>
              <span>
                Index file <small>(optional)</small>
              </span>
              <input
                id="index-path"
                type="text"
                spellCheck={false}
                placeholder={DEFAULT_INDEX_PATH}
                value={indexPath}
                onChange={(e) => setIndexPath(e.target.value)}
              />
            </label>
          </div>
        )}

        <StagePicker stage="reranker" value={reranker} onChange={setReranker} />

        <StagePicker
          stage="llm"
          value={llm}
          onChange={pick(setLlm, setLlmConfig)}
        />
        <OptionFields
          stage="llm"
          provider={llm}
          values={llmConfig}
          onChange={setLlmConfig}
        />
      </div>

      <div className={styles.output}>
        <div className={styles.outputHead}>
          <span className={styles.valid}>Valid .ragrc.json</span>
          <div className={styles.buttons}>
            <button
              type="button"
              className="button button--secondary button--sm"
              onClick={copy}
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              className="button button--primary button--sm"
              onClick={download}
            >
              Download
            </button>
          </div>
        </div>
        <CodeBlock language="json" title=".ragrc.json">
          {json}
        </CodeBlock>

        <div className={styles.next}>
          <h2 className={styles.nextTitle}>Next steps</h2>
          {template && noCustomOptions ? (
            <p>
              Same as <code>rag-pipeline init --template {template}</code>.
            </p>
          ) : (
            <p>
              Save this as <code>.ragrc.json</code>, or create it interactively
              with <code>rag-pipeline init</code>.
            </p>
          )}
          {env.length > 0 && (
            <p>
              Set{" "}
              {env.map((v, i) => (
                <React.Fragment key={v}>
                  {i > 0 && " and "}
                  <code>{v}</code>
                </React.Fragment>
              ))}{" "}
              in your environment. API keys never go in the file.
            </p>
          )}
          <CodeBlock language="bash">
            {`npx rag-pipeline doctor
npx rag-pipeline ingest ./docs
npx rag-pipeline query "What is the remote work policy?"`}
          </CodeBlock>
        </div>
      </div>
    </div>
  );
}
