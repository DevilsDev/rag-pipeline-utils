/**
 * Version: 1.0.0
 * Path: /public/src/components/Filters.jsx
 * Description: Advanced filtering component for evaluation results
 * Author: Ali Kahwaji
 */

import { useState, useMemo } from 'react';
import { Filter, X, ChevronDown, ChevronUp } from 'lucide-react';

export default function Filters({
  results,
  selectedCategories,
  setSelectedCategories,
  selectedModels,
  setSelectedModels,
  scoreRange,
  setScoreRange,
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Extract unique values for filter options
  const filterOptions = useMemo(() => {
    const categories = [...new Set(results.map(r => r.category))].sort();
    const models = [...new Set(results.map(r => r.metadata.model))].sort();
    const difficulties = [...new Set(results.map(r => r.difficulty))].sort();
    
    return { categories, models, difficulties };
  }, [results]);

  const handleCategoryToggle = (category) => {
    setSelectedCategories(prev => 
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    );
  };

  const handleModelToggle = (model) => {
    setSelectedModels(prev => 
      prev.includes(model)
        ? prev.filter(m => m !== model)
        : [...prev, model]
    );
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedModels([]);
    setScoreRange({ min: 0, max: 1 });
  };

  const hasActiveFilters = selectedCategories.length > 0 || 
                          selectedModels.length > 0 || 
                          scoreRange.min > 0 || 
                          scoreRange.max < 1;

  return (
    <div className="mt-6 border-t border-gray-200/60 pt-6">
      {/* Enhanced Filter Toggle */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="group flex items-center space-x-3 px-4 py-2.5 bg-gradient-to-r from-gray-50 to-blue-50/30 hover:from-gray-100 hover:to-blue-100/50 rounded-xl border border-gray-200/50 hover:border-blue-200/60 text-sm font-semibold text-gray-700 hover:text-gray-900 transition-all duration-200"
          aria-expanded={isExpanded}
          aria-controls="advanced-filters"
        >
          <Filter size={16} className="text-blue-600 group-hover:rotate-12 transition-transform" />
          <span>Advanced Filters</span>
          <div className="flex items-center space-x-2">
            {hasActiveFilters && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-bold rounded-full">
                {(selectedCategories.length + selectedModels.length + (scoreRange.min > 0 || scoreRange.max < 1 ? 1 : 0))}
              </span>
            )}
            {isExpanded ? 
              <ChevronUp size={16} className="text-gray-500 group-hover:text-blue-600 transition-colors" /> : 
              <ChevronDown size={16} className="text-gray-500 group-hover:text-blue-600 transition-colors" />
            }
          </div>
        </button>
        
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-red-50 to-rose-50 hover:from-red-100 hover:to-rose-100 text-red-600 hover:text-red-700 rounded-xl border border-red-200/50 hover:border-red-300 text-sm font-semibold transition-all duration-200 hover:scale-105 transform"
            aria-label="Clear all active filters"
          >
            <X size={14} className="hover:rotate-90 transition-transform" />
            <span>Clear All</span>
          </button>
        )}
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 mb-4">
          {selectedCategories.map(category => (
            <span
              key={category}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
            >
              Category: {category}
              <button
                onClick={() => handleCategoryToggle(category)}
                className="ml-1 text-blue-600 hover:text-blue-800"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          
          {selectedModels.map(model => (
            <span
              key={model}
              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800"
            >
              Model: {model}
              <button
                onClick={() => handleModelToggle(model)}
                className="ml-1 text-green-600 hover:text-green-800"
              >
                <X size={12} />
              </button>
            </span>
          ))}
          
          {(scoreRange.min > 0 || scoreRange.max < 1) && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              Score: {scoreRange.min.toFixed(2)} - {scoreRange.max.toFixed(2)}
              <button
                onClick={() => setScoreRange({ min: 0, max: 1 })}
                className="ml-1 text-purple-600 hover:text-purple-800"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Expanded Filters */}
      {isExpanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Category Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">Categories</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {filterOptions.categories.map(category => (
                <label key={category} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => handleCategoryToggle(category)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 capitalize">
                    {category.replace(/_/g, ' ')}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({results.filter(r => r.category === category).length})
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Model Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">Models</h4>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {filterOptions.models.map(model => (
                <label key={model} className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(model)}
                    onChange={() => handleModelToggle(model)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{model}</span>
                  <span className="text-xs text-gray-500">
                    ({results.filter(r => r.metadata.model === model).length})
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Score Range Filter */}
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-3">Score Range</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Minimum Score: {scoreRange.min.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scoreRange.min}
                  onChange={(e) => setScoreRange(prev => ({ 
                    ...prev, 
                    min: Math.min(parseFloat(e.target.value), prev.max - 0.01)
                  }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
              
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Maximum Score: {scoreRange.max.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scoreRange.max}
                  onChange={(e) => setScoreRange(prev => ({ 
                    ...prev, 
                    max: Math.max(parseFloat(e.target.value), prev.min + 0.01)
                  }))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>0.00</span>
                <span>Average Score Range</span>
                <span>1.00</span>
              </div>
            </div>
          </div>

          {/* Quick Filters */}
          <div className="md:col-span-2 lg:col-span-3">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Quick Filters</h4>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  const failedResults = results.filter(r => !r.success);
                  const failedCategories = [...new Set(failedResults.map(r => r.category))];
                  setSelectedCategories(failedCategories);
                }}
                className="px-3 py-1 text-xs bg-red-100 text-red-800 rounded-full hover:bg-red-200 transition-colors"
              >
                Failed Results Only
              </button>
              
              <button
                onClick={() => {
                  const highScoreResults = results.filter(r => 
                    (r.scores.bleu + r.scores.rouge) / 2 >= 0.8
                  );
                  const highScoreCategories = [...new Set(highScoreResults.map(r => r.category))];
                  setSelectedCategories(highScoreCategories);
                  setScoreRange({ min: 0.8, max: 1 });
                }}
                className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded-full hover:bg-green-200 transition-colors"
              >
                High Scores (≥0.8)
              </button>
              
              <button
                onClick={() => {
                  const slowResults = results.filter(r => r.metadata.response_time_ms > 1000);
                  const slowCategories = [...new Set(slowResults.map(r => r.category))];
                  setSelectedCategories(slowCategories);
                }}
                className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full hover:bg-yellow-200 transition-colors"
              >
                Slow Responses ({'>'}1s)
              </button>
              
              <button
                onClick={() => {
                  const recentResults = results
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, Math.ceil(results.length * 0.2));
                  const recentCategories = [...new Set(recentResults.map(r => r.category))];
                  setSelectedCategories(recentCategories);
                }}
                className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full hover:bg-blue-200 transition-colors"
              >
                Recent 20%
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Count */}
      <div className="mt-4 text-sm text-gray-500">
        {hasActiveFilters && (
          <span>
            Showing filtered results • 
            <button
              onClick={() => setIsExpanded(true)}
              className="text-blue-600 hover:text-blue-800 ml-1"
            >
              Modify filters
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
