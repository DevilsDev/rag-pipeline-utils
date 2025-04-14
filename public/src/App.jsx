/**
 * Version: 0.1.0
 * Path: /public/src/App.jsx
 * Description: Evaluation results dashboard UI
 * Author: Ali Kahwaji
 */

import { useEffect, useState } from 'react';

export default function App() {
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState({ passRate: 0, avgBLEU: 0, avgROUGE: 0 });

  useEffect(() => {
    fetch('/results/sample-eval.json')
      .then(res => res.json())
      .then(data => {
        setResults(data);

        const total = data.length;
        const passCount = data.filter(r => r.success).length;
        const avgBLEU = data.reduce((s, r) => s + r.scores.bleu, 0) / total;
        const avgROUGE = data.reduce((s, r) => s + r.scores.rouge, 0) / total;

        setSummary({
          passRate: (passCount / total * 100).toFixed(1),
          avgBLEU: avgBLEU.toFixed(2),
          avgROUGE: avgROUGE.toFixed(2)
        });
      });
  }, []);

  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-4">RAG Evaluation Dashboard</h1>

      <div className="mb-6 p-4 border rounded shadow bg-white">
        <h2 className="text-xl font-semibold mb-2">Summary</h2>
        <p> Pass Rate: <strong>{summary.passRate}%</strong></p>
        <p> Avg BLEU: <strong>{summary.avgBLEU}</strong></p>
        <p> Avg ROUGE: <strong>{summary.avgROUGE}</strong></p>
      </div>

      {results.map((res, i) => (
        <div key={i} className="mb-4 p-4 border-l-4 rounded bg-white shadow border-l-gray-300">
          <h3 className="font-bold text-lg">Prompt {i + 1}</h3>
          <p className="mt-2"><strong>Prompt:</strong> {res.prompt}</p>
          <p><strong>Expected:</strong> {res.expected}</p>
          <p><strong>Actual:</strong> {res.actual}</p>
          <p> BLEU: <strong>{res.scores.bleu.toFixed(2)}</strong></p>
          <p> ROUGE: <strong>{res.scores.rouge.toFixed(2)}</strong></p>
          <p>Pass: <strong className={res.success ? 'text-green-600' : 'text-red-600'}>{res.success ? 'Yes' : 'No'}</strong></p>
        </div>
      ))}
    </main>
  );
}
