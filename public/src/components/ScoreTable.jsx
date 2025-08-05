/**
 * Version: 1.0.0
 * Path: /public/src/components/ScoreTable.jsx
 * Description: Advanced table component for displaying evaluation results with sorting and selection
 * Author: Ali Kahwaji
 */

import { useState } from 'react';
import { ChevronUp, ChevronDown, ExternalLink, Copy, Check } from 'lucide-react';
import { formatDuration, copyToClipboard, getScoreColor, truncateText } from '../utils/helpers.js';

export default function ScoreTable({ 
  results, 
  viewMode, 
  sortConfig, 
  setSortConfig, 
  selectedResults, 
  setSelectedResults 
}) {
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [copiedText, setCopiedText] = useState('');

  const handleSort = (key) => {
    const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ key, direction });
  };

  const handleRowSelect = (resultId) => {
    const newSelected = selectedResults.includes(resultId)
      ? selectedResults.filter(id => id !== resultId)
      : [...selectedResults, resultId];
    setSelectedResults(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedResults.length === results.length) {
      setSelectedResults([]);
    } else {
      setSelectedResults(results.map(r => r.id));
    }
  };

  const toggleRowExpansion = (resultId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(resultId)) {
      newExpanded.delete(resultId);
    } else {
      newExpanded.add(resultId);
    }
    setExpandedRows(newExpanded);
  };

  const handleCopy = async (text, type) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedText(type);
      setTimeout(() => setCopiedText(''), 2000);
    }
  };

  const SortButton = ({ column, children }) => (
    <button
      onClick={() => handleSort(column)}
      className="flex items-center space-x-1 hover:text-blue-600 transition-colors"
    >
      <span>{children}</span>
      {sortConfig.key === column && (
        sortConfig.direction === 'asc' ? 
          <ChevronUp size={16} /> : 
          <ChevronDown size={16} />
      )}
    </button>
  );

  if (viewMode === 'cards') {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {results.map((result) => (
          <div key={result.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedResults.includes(result.id)}
                    onChange={() => handleRowSelect(result.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-500">#{result.id}</span>
                </div>
                <div className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  result.success 
                    ? 'bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 border-emerald-200' 
                    : 'bg-gradient-to-r from-red-50 to-rose-50 text-red-700 border-red-200'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full mr-2 ${
                    result.success ? 'bg-emerald-500' : 'bg-red-500'
                  }`}></div>
                  {result.success ? 'Pass' : 'Fail'}
                </div>
              </div>

              {/* Prompt */}
              <div className="mb-4">
                <h3 className="font-semibold text-gray-900 mb-2">Prompt</h3>
                <p className="text-sm text-gray-600 line-clamp-3">{result.prompt}</p>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                  <div className={`text-xl font-bold ${getScoreColor(result.scores.bleu)} mb-1`}>
                    {result.scores.bleu.toFixed(3)}
                  </div>
                  <div className="text-xs font-semibold text-blue-600 uppercase tracking-wider">BLEU</div>
                </div>
                <div className="text-center p-3 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
                  <div className={`text-xl font-bold ${getScoreColor(result.scores.rouge)} mb-1`}>
                    {result.scores.rouge.toFixed(3)}
                  </div>
                  <div className="text-xs font-semibold text-emerald-600 uppercase tracking-wider">ROUGE</div>
                </div>
              </div>

              {/* Metadata */}
              <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                <span>{result.metadata.model}</span>
                <span>{formatDuration(result.metadata.response_time_ms)}</span>
                <span>{result.metadata.tokens_used} tokens</span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => toggleRowExpansion(result.id)}
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  {expandedRows.has(result.id) ? 'Show Less' : 'Show More'}
                </button>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    result.difficulty === 'easy' ? 'bg-green-100 text-green-800' :
                    result.difficulty === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {result.difficulty}
                  </span>
                  <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                    {result.category}
                  </span>
                </div>
              </div>

              {/* Expanded Content */}
              {expandedRows.has(result.id) && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                      Expected Response
                      <button
                        onClick={() => handleCopy(result.expected, `expected-${result.id}`)}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                      >
                        {copiedText === `expected-${result.id}` ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </h4>
                    <p className="text-sm text-gray-600">{result.expected}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                      Actual Response
                      <button
                        onClick={() => handleCopy(result.actual, `actual-${result.id}`)}
                        className="ml-2 text-gray-400 hover:text-gray-600"
                      >
                        {copiedText === `actual-${result.id}` ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    </h4>
                    <p className="text-sm text-gray-600">{result.actual}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="font-medium">BERTScore:</span> {result.scores.bertscore?.toFixed(3) || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Semantic:</span> {result.scores.semantic_similarity?.toFixed(3) || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Retrieval:</span> {formatDuration(result.metadata.retrieval_time_ms)}
                    </div>
                    <div>
                      <span className="font-medium">Embedding:</span> {formatDuration(result.metadata.embedding_time_ms)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Table Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedResults.length === results.length && results.length > 0}
                onChange={handleSelectAll}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">
                {selectedResults.length > 0 ? `${selectedResults.length} selected` : 'Select all'}
              </span>
            </label>
          </div>
          <div className="text-sm text-gray-500">
            Showing {results.length} results
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <input
                  type="checkbox"
                  checked={selectedResults.length === results.length && results.length > 0}
                  onChange={handleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <SortButton column="id">ID</SortButton>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <SortButton column="prompt">Prompt</SortButton>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <SortButton column="scores.bleu">BLEU</SortButton>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <SortButton column="scores.rouge">ROUGE</SortButton>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <SortButton column="metadata.model">Model</SortButton>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <SortButton column="metadata.response_time_ms">Time</SortButton>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                <SortButton column="success">Status</SortButton>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {results.map((result) => (
              <tr 
                key={result.id} 
                className={`hover:bg-gray-50 ${selectedResults.includes(result.id) ? 'bg-blue-50' : ''}`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={selectedResults.includes(result.id)}
                    onChange={() => handleRowSelect(result.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {result.id}
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 max-w-xs">
                  <div className="truncate" title={result.prompt}>
                    {truncateText(result.prompt, 60)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`font-medium ${getScoreColor(result.scores.bleu)}`}>
                    {result.scores.bleu.toFixed(3)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`font-medium ${getScoreColor(result.scores.rouge)}`}>
                    {result.scores.rouge.toFixed(3)}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {result.metadata.model}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatDuration(result.metadata.response_time_ms)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    result.success 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {result.success ? 'Pass' : 'Fail'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  <button
                    onClick={() => toggleRowExpansion(result.id)}
                    className="text-blue-600 hover:text-blue-900 mr-3"
                  >
                    {expandedRows.has(result.id) ? 'Collapse' : 'Expand'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {results.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg mb-2">📊</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-500">Try adjusting your filters or search terms.</p>
        </div>
      )}
    </div>
  );
}
