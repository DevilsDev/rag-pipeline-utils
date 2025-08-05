/**
 * Version: 1.0.0
 * Path: /public/src/utils/helpers.js
 * Description: Utility helper functions for the evaluation dashboard
 * Author: Ali Kahwaji
 */

/**
 * Format duration from milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * Copy text to clipboard
 * @param {string} text - Text to copy
 * @returns {Promise<boolean>} Success status
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const result = document.execCommand('copy');
      textArea.remove();
      return result;
    }
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return false;
  }
}

/**
 * Get color class based on score value
 * @param {number} score - Score value (0-1)
 * @returns {string} Tailwind CSS color class
 */
export function getScoreColor(score) {
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-yellow-600';
  if (score >= 0.4) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * Calculate summary statistics for evaluation results
 * @param {Array} results - Array of evaluation results
 * @returns {Object} Summary statistics
 */
export function calculateStats(results) {
  if (results.length === 0) {
    return {
      totalResults: 0,
      passRate: 0,
      avgBLEU: 0,
      avgROUGE: 0,
      avgBertScore: 0,
      avgSemanticSimilarity: 0,
      avgResponseTime: 0,
      totalTokens: 0
    };
  }

  const successCount = results.filter(r => r.success).length;
  const totalBLEU = results.reduce((sum, r) => sum + r.scores.bleu, 0);
  const totalROUGE = results.reduce((sum, r) => sum + r.scores.rouge, 0);
  const totalBertScore = results.reduce((sum, r) => sum + (r.scores.bertscore || 0), 0);
  const totalSemanticSimilarity = results.reduce((sum, r) => sum + (r.scores.semantic_similarity || 0), 0);
  const totalResponseTime = results.reduce((sum, r) => sum + r.metadata.response_time_ms, 0);
  const totalTokens = results.reduce((sum, r) => sum + r.metadata.tokens_used, 0);

  return {
    totalResults: results.length,
    passRate: (successCount / results.length) * 100,
    avgBLEU: totalBLEU / results.length,
    avgROUGE: totalROUGE / results.length,
    avgBertScore: totalBertScore / results.length,
    avgSemanticSimilarity: totalSemanticSimilarity / results.length,
    avgResponseTime: totalResponseTime / results.length,
    totalTokens: totalTokens
  };
}

/**
 * Export results to CSV format
 * @param {Array} results - Array of evaluation results
 * @param {string} filename - Output filename
 */
export function exportToCSV(results, filename = 'evaluation-results.csv') {
  if (results.length === 0) {
    console.warn('No results to export');
    return;
  }

  // Define CSV headers
  const headers = [
    'ID',
    'Prompt',
    'Expected',
    'Actual',
    'BLEU Score',
    'ROUGE Score',
    'BERTScore',
    'Semantic Similarity',
    'Success',
    'Category',
    'Difficulty',
    'Model',
    'Response Time (ms)',
    'Embedding Time (ms)',
    'Retrieval Time (ms)',
    'Tokens Used',
    'Timestamp'
  ];

  // Convert results to CSV rows
  const csvRows = results.map(result => [
    result.id,
    `"${result.prompt.replace(/"/g, '""')}"`,
    `"${result.expected.replace(/"/g, '""')}"`,
    `"${result.actual.replace(/"/g, '""')}"`,
    result.scores.bleu.toFixed(4),
    result.scores.rouge.toFixed(4),
    (result.scores.bertscore || 0).toFixed(4),
    (result.scores.semantic_similarity || 0).toFixed(4),
    result.success,
    result.category,
    result.difficulty,
    result.metadata.model,
    result.metadata.response_time_ms,
    result.metadata.embedding_time_ms,
    result.metadata.retrieval_time_ms,
    result.metadata.tokens_used,
    result.timestamp
  ]);

  // Combine headers and rows
  const csvContent = [headers, ...csvRows]
    .map(row => row.join(','))
    .join('\n');

  // Create and download file
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}

/**
 * Sort array of results by specified key and direction
 * @param {Array} results - Array to sort
 * @param {string} key - Sort key (supports nested keys with dots)
 * @param {string} direction - Sort direction ('asc' or 'desc')
 * @returns {Array} Sorted array
 */
export function sortResults(results, key, direction = 'asc') {
  return [...results].sort((a, b) => {
    // Handle nested keys (e.g., 'scores.bleu')
    const getValue = (obj, path) => {
      return path.split('.').reduce((current, prop) => current?.[prop], obj);
    };

    const aValue = getValue(a, key);
    const bValue = getValue(b, key);

    // Handle null/undefined values
    if (aValue == null && bValue == null) return 0;
    if (aValue == null) return direction === 'asc' ? 1 : -1;
    if (bValue == null) return direction === 'asc' ? -1 : 1;

    // Handle different data types
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const comparison = aValue.localeCompare(bValue);
      return direction === 'asc' ? comparison : -comparison;
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      const comparison = aValue - bValue;
      return direction === 'asc' ? comparison : -comparison;
    }

    // Handle dates
    if (key === 'timestamp') {
      const dateA = new Date(aValue);
      const dateB = new Date(bValue);
      const comparison = dateA - dateB;
      return direction === 'asc' ? comparison : -comparison;
    }

    // Fallback to string comparison
    const comparison = String(aValue).localeCompare(String(bValue));
    return direction === 'asc' ? comparison : -comparison;
  });
}

/**
 * Filter results based on search term and filters
 * @param {Array} results - Array of results to filter
 * @param {Object} filters - Filter configuration
 * @returns {Array} Filtered results
 */
export function filterResults(results, filters) {
  const {
    searchTerm = '',
    selectedCategories = [],
    selectedModels = [],
    scoreRange = { min: 0, max: 1 },
    successOnly = false,
    difficultyFilter = []
  } = filters;

  return results.filter(result => {
    // Search term filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        result.prompt.toLowerCase().includes(searchLower) ||
        result.actual.toLowerCase().includes(searchLower) ||
        result.expected.toLowerCase().includes(searchLower) ||
        result.category.toLowerCase().includes(searchLower) ||
        result.metadata.model.toLowerCase().includes(searchLower);
      
      if (!matchesSearch) return false;
    }

    // Category filter
    if (selectedCategories.length > 0 && !selectedCategories.includes(result.category)) {
      return false;
    }

    // Model filter
    if (selectedModels.length > 0 && !selectedModels.includes(result.metadata.model)) {
      return false;
    }

    // Score range filter (using average of BLEU and ROUGE)
    const avgScore = (result.scores.bleu + result.scores.rouge) / 2;
    if (avgScore < scoreRange.min || avgScore > scoreRange.max) {
      return false;
    }

    // Success filter
    if (successOnly && !result.success) {
      return false;
    }

    // Difficulty filter
    if (difficultyFilter.length > 0 && !difficultyFilter.includes(result.difficulty)) {
      return false;
    }

    return true;
  });
}

/**
 * Format number with appropriate precision
 * @param {number} num - Number to format
 * @param {number} precision - Decimal places
 * @returns {string} Formatted number
 */
export function formatNumber(num, precision = 2) {
  if (num == null) return 'N/A';
  if (typeof num !== 'number') return String(num);
  
  return num.toFixed(precision);
}

/**
 * Generate a unique ID
 * @returns {string} Unique identifier
 */
export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Debounce function to limit function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}
