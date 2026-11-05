"use client";

import { useState, type FormEvent } from "react";

type Source = { id: string; source?: string; content?: string };
type Answer = {
  answer: string | null;
  sources: Source[];
  grounding: {
    grounded?: boolean;
    groundedness?: number;
    unsupported: string[];
  } | null;
  error?: string;
};

export default function Home() {
  const [question, setQuestion] = useState("How many vacation days do I get?");
  const [result, setResult] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
    });
    setResult(await response.json());
    setLoading(false);
  }

  return (
    <main>
      <h1>Ask your documents</h1>
      <form onSubmit={ask} style={{ display: "flex", gap: 8 }}>
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          style={{ flex: 1, padding: 8 }}
          aria-label="Question"
        />
        <button disabled={loading || !question.trim()}>
          {loading ? "Asking…" : "Ask"}
        </button>
      </form>

      {result?.error && <p role="alert">Error: {result.error}</p>}

      {result && !result.error && (
        <section>
          {result.answer === null ? (
            <p>
              <em>
                No ANTHROPIC_API_KEY yet (see .env.example), so here are the
                matching passages:
              </em>
            </p>
          ) : (
            <p>{result.answer}</p>
          )}

          {result.grounding && (
            <p>
              {result.grounding.grounded
                ? "✓ Every sentence is supported by the sources."
                : `⚠ Not supported by the sources: ${result.grounding.unsupported.join(" ")}`}
            </p>
          )}

          <h2 style={{ fontSize: "1rem" }}>Sources</h2>
          <ul>
            {result.sources.map((s) => (
              <li key={s.id}>
                <strong>{s.source ?? s.id}</strong>
                {s.content && <div>{s.content.replace(/^#.*\n+/, "")}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
