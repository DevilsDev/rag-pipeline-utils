/**
 * Version: 0.1.1
 * Path: /src/evaluate/evaluator.js
 * Description: Evaluation runner with scoring metrics for batch RAG QA
 * Author: Ali Kahwaji
 */

import { createRagPipeline } from '../core/create-pipeline.js';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import path from 'path';
import { scoreAnswer } from './scoring.js';

/**
 * Evaluate a list of prompt/answer pairs using the RAG pipeline and compute scores
 * @param {string} datasetPath - Path to JSON file with { prompt, expected }[]
 * @param {object} config - RAG plugin config (loader optional)
 * @returns {Promise<Array<{ prompt: string, expected: string, actual: string, success: boolean, scores: object }>>}
 */
export async function evaluateRagDataset(datasetPath, config) {
  const file = await fs.readFile(path.resolve(datasetPath), 'utf-8');
  const cases = JSON.parse(file);
  const pipeline = createRagPipeline(config);

  const results = [];
  for (const { prompt, expected } of cases) {
    try {
      logger.info({ prompt }, 'Evaluating case');
      const actual = await pipeline.query(prompt);
      const success = normalizeText(actual) === normalizeText(expected);
      const scores = scoreAnswer(actual, expected);
      results.push({ prompt, expected, actual, success, scores });
    } catch (err) {
      logger.error({ prompt, error: err.message }, 'Evaluation failed');
      results.push({ prompt, expected, actual: '', success: false, scores: { bleu: 0, rouge: 0 } });
    }
  }
  return results;
}

function normalizeText(txt) {
  return txt.trim().toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ');
}

