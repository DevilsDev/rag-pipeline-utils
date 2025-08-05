/**
 * Version: 2.0.0
 * Path: /public/src/App.jsx
 * Description: Enhanced RAG evaluation dashboard with filtering, charts, and advanced features
 * Author: Ali Kahwaji
 */

import { useEffect, useState, useMemo } from 'react';
import { Search, Filter, Download, Upload, BarChart3, TrendingUp, Clock, Zap, List, Grid3X3, Wifi, WifiOff, X } from 'lucide-react';
import { ThemeProvider } from './contexts/ThemeContext.jsx';
import ThemeToggle from './components/ThemeToggle.jsx';
import FileUpload from './components/FileUpload.jsx';
import ScoreTable from './components/ScoreTable.jsx';
import ScoreChart from './components/ScoreChart.jsx';
import Filters from './components/Filters.jsx';
import { formatDuration, exportToCSV, calculateStats } from './utils/helpers.js';

function AppContent() {
  // State management
  const [results, setResults] = useState([]);
  const [filteredResults, setFilteredResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedModels, setSelectedModels] = useState([]);
  const [scoreRange, setScoreRange] = useState({ min: 0, max: 1 });
  const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });
  const [viewMode, setViewMode] = useState('table'); // 'table', 'cards', 'charts'
  const [selectedResults, setSelectedResults] = useState([]);
  
  // Enhanced state for new features
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Load evaluation results
  useEffect(() => {
    loadResults();
  }, []);

  const loadResults = async () => {
    try {
      setLoading(true);
      const response = await fetch('/results/sample-eval.json');
      if (!response.ok) {
        throw new Error(`Failed to load results: ${response.status}`);
      }
      const data = await response.json();
      setResults(data);
      setFilteredResults(data);
      setError(null);
    } catch (err) {
      console.error('Error loading results:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Enhanced file upload handler
  const handleFileUpload = (uploadedData) => {
    setResults(uploadedData);
    setFilteredResults(uploadedData);
    setLastUpdated(new Date());
    setError(null);
    setShowUploadModal(false);
  };

  const handleUploadError = (errorMessage) => {
    setError(errorMessage);
  };

  // Mock real-time updates
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      // Simulate connection status changes
      setIsConnected(prev => Math.random() > 0.1 ? true : prev);
      setLastUpdated(new Date());
      
      // Simulate occasional new results (mock)
      if (Math.random() > 0.8 && results.length > 0) {
        const newResult = {
          ...results[0],
          id: Date.now(),
          timestamp: new Date().toISOString(),
          scores: {
            bleu: Math.random() * 0.4 + 0.6,
            rouge: Math.random() * 0.4 + 0.6,
            bertscore: Math.random() * 0.3 + 0.7,
            semantic_similarity: Math.random() * 0.3 + 0.7
          },
          success: Math.random() > 0.2
        };
        setResults(prev => [newResult, ...prev]);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, results]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (filteredResults.length === 0) {
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

    const stats = calculateStats(filteredResults);
    return stats;
  }, [filteredResults]);

  // Filter and search results
  useEffect(() => {
    let filtered = results;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(result => 
        result.prompt.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.actual.toLowerCase().includes(searchTerm.toLowerCase()) ||
        result.expected.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Category filter
    if (selectedCategories.length > 0) {
      filtered = filtered.filter(result => 
        selectedCategories.includes(result.category)
      );
    }

    // Model filter
    if (selectedModels.length > 0) {
      filtered = filtered.filter(result => 
        selectedModels.includes(result.metadata.model)
      );
    }

    // Score range filter
    filtered = filtered.filter(result => {
      const avgScore = (result.scores.bleu + result.scores.rouge) / 2;
      return avgScore >= scoreRange.min && avgScore <= scoreRange.max;
    });

    // Sort results
    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        
        // Handle nested properties
        if (sortConfig.key.includes('.')) {
          const keys = sortConfig.key.split('.');
          aVal = keys.reduce((obj, key) => obj?.[key], a);
          bVal = keys.reduce((obj, key) => obj?.[key], b);
        }
        
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredResults(filtered);
  }, [results, searchTerm, selectedCategories, selectedModels, scoreRange, sortConfig]);

  // Export functionality
  const handleExport = () => {
    exportToCSV(filteredResults, 'rag-evaluation-results.csv');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-gray-700">Loading evaluation results...</h2>
          <p className="text-gray-500 mt-2">Please wait while we prepare your dashboard</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6 text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-red-800 mb-2">Error Loading Data</h2>
          <p className="text-red-600 mb-4">{error}</p>
          <div className="space-x-2">
            <button
              onClick={loadResults}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
              Retry
            </button>
            <label className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors cursor-pointer">
              Upload File
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-300">
      {/* Enhanced Header with Dark Mode Support */}
      <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm shadow-sm border-b border-gray-200/60 dark:border-gray-700/60 sticky top-0 z-50">
        <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center space-x-6">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">
                    RAG Evaluation Dashboard
                  </h1>
                  <div className="flex items-center space-x-2">
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Pipeline Performance Analytics</p>
                    <div className="flex items-center space-x-1">
                      {isConnected ? (
                        <Wifi className="w-3 h-3 text-green-500" />
                      ) : (
                        <WifiOff className="w-3 h-3 text-red-500" />
                      )}
                      <span className={`text-xs font-medium ${
                        isConnected ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                      }`}>
                        {isConnected ? 'Connected' : 'Offline'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="hidden sm:flex items-center space-x-2">
                <span className="px-3 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/30 dark:to-indigo-900/30 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-full border border-blue-200 dark:border-blue-700">
                  v1.0.0
                </span>
                <span className="px-3 py-1.5 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/30 dark:to-emerald-900/30 text-green-700 dark:text-green-300 text-xs font-semibold rounded-full border border-green-200 dark:border-green-700">
                  {filteredResults.length} Results
                </span>
                {autoRefresh && (
                  <span className="px-3 py-1.5 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/30 dark:to-violet-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded-full border border-purple-200 dark:border-purple-700 animate-pulse">
                    Live
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              {/* Enhanced File Upload Button */}
              <button
                onClick={() => setShowUploadModal(true)}
                className="group flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl group-hover:scale-105 transform"
                aria-label="Upload evaluation results JSON file"
              >
                <Upload size={16} className="group-hover:rotate-12 transition-transform" />
                <span className="font-medium hidden sm:inline">Upload</span>
              </button>
              
              {/* Enhanced Export Button */}
              <button
                onClick={() => exportToCSV(filteredResults)}
                className="flex items-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-700 text-white rounded-xl hover:from-emerald-700 hover:to-green-800 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                disabled={filteredResults.length === 0}
                aria-label="Export results to CSV"
              >
                <Download size={16} className="hover:translate-y-0.5 transition-transform" />
                <span className="font-medium hidden sm:inline">Export</span>
              </button>
              
              {/* Auto-refresh Toggle */}
              <button
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 transform ${
                  autoRefresh
                    ? 'bg-gradient-to-r from-purple-600 to-violet-700 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
                aria-label={`${autoRefresh ? 'Disable' : 'Enable'} auto-refresh`}
              >
                {isConnected ? <Wifi size={16} /> : <WifiOff size={16} />}
                <span className="font-medium hidden sm:inline">
                  {autoRefresh ? 'Live' : 'Manual'}
                </span>
              </button>
              
              {/* Theme Toggle */}
              <ThemeToggle />
              
              {/* View Mode Toggle */}
              <div className="hidden md:flex items-center bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                {[{ mode: 'table', icon: List, label: 'Table' }, { mode: 'cards', icon: Grid3X3, label: 'Cards' }, { mode: 'charts', icon: BarChart3, label: 'Charts' }].map(({ mode, icon: Icon, label }) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      viewMode === mode
                        ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                    aria-label={`Switch to ${label} view`}
                  >
                    <Icon size={16} />
                    <span className="hidden lg:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Enhanced Professional Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-8">
          {/* Total Results Card */}
          <div className="group relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow-lg border border-gray-200/50 hover:border-blue-200 p-6 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Results</p>
                </div>
                <p className="text-3xl font-bold text-gray-900 mb-1">{summary.totalResults.toLocaleString()}</p>
                <p className="text-xs text-gray-500 font-medium">Evaluation entries</p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>
          
          {/* Pass Rate Card */}
          <div className="group relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow-lg border border-gray-200/50 hover:border-emerald-200 p-6 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Success Rate</p>
                </div>
                <p className="text-3xl font-bold text-emerald-600 mb-1">{summary.passRate.toFixed(1)}%</p>
                <p className="text-xs text-gray-500 font-medium">
                  {Math.round((summary.passRate / 100) * summary.totalResults)} / {summary.totalResults} passed
                </p>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>
          
          {/* BLEU Score Card with Proper Formatting */}
          <div className="group relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow-lg border border-gray-200/50 hover:border-purple-200 p-6 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg BLEU Score</p>
                </div>
                <p className="text-3xl font-bold text-purple-600 mb-1">{summary.avgBLEU.toFixed(3)}</p>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    summary.avgBLEU >= 0.8 ? 'bg-green-500' :
                    summary.avgBLEU >= 0.6 ? 'bg-yellow-500' :
                    summary.avgBLEU >= 0.4 ? 'bg-orange-500' : 'bg-red-500'
                  }`}></div>
                  <p className="text-xs text-gray-500 font-medium">
                    {summary.avgBLEU >= 0.8 ? 'Excellent' :
                     summary.avgBLEU >= 0.6 ? 'Good' :
                     summary.avgBLEU >= 0.4 ? 'Fair' : 'Needs Improvement'}
                  </p>
                </div>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-violet-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <div className="text-white text-lg font-bold">🎯</div>
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-purple-50/50 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>
          
          {/* Response Time Card */}
          <div className="group relative bg-white/70 backdrop-blur-sm rounded-2xl shadow-sm hover:shadow-lg border border-gray-200/50 hover:border-amber-200 p-6 transition-all duration-300 hover:-translate-y-1">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-2 mb-2">
                  <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Response Time</p>
                </div>
                <p className="text-3xl font-bold text-amber-600 mb-1">{formatDuration(summary.avgResponseTime)}</p>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${
                    summary.avgResponseTime <= 500 ? 'bg-green-500' :
                    summary.avgResponseTime <= 1000 ? 'bg-yellow-500' :
                    summary.avgResponseTime <= 2000 ? 'bg-orange-500' : 'bg-red-500'
                  }`}></div>
                  <p className="text-xs text-gray-500 font-medium">
                    {summary.avgResponseTime <= 500 ? 'Fast' :
                     summary.avgResponseTime <= 1000 ? 'Good' :
                     summary.avgResponseTime <= 2000 ? 'Slow' : 'Very Slow'}
                  </p>
                </div>
              </div>
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Clock className="w-6 h-6 text-white" />
              </div>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-amber-50/50 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>
        </div>

        {/* Enhanced Search and Filters Section */}
        <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-sm border border-gray-200/50 mb-8 overflow-hidden">
          <div className="p-6 lg:p-8">
            {/* Search Bar with Enhanced Styling */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-6 lg:space-y-0 lg:space-x-6 mb-6">
              <div className="flex-1 max-w-2xl">
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-gray-400 group-focus-within:text-blue-500 transition-colors" />
                  </div>
                  <input
                    type="text"
                    placeholder="Search prompts, responses, categories, or models..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50/50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent focus:bg-white transition-all duration-200 text-sm font-medium"
                    aria-label="Search evaluation results"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="Clear search"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {searchTerm && (
                  <div className="mt-2 text-sm text-gray-500">
                    Found {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''} for "{searchTerm}"
                  </div>
                )}
              </div>
              
              {/* Enhanced View Mode Selector - Mobile Responsive */}
              <div className="flex items-center space-x-4">
                <div className="hidden sm:flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-600">View Mode:</span>
                  <div className="flex items-center bg-gray-100 rounded-xl p-1">
                    {[{ mode: 'table', icon: List, label: 'Table' }, { mode: 'cards', icon: Grid3X3, label: 'Cards' }, { mode: 'charts', icon: BarChart3, label: 'Charts' }].map(({ mode, icon: Icon, label }) => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          viewMode === mode
                            ? 'bg-white text-blue-600 shadow-sm'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                        aria-label={`Switch to ${label} view`}
                      >
                        <Icon size={16} />
                        <span className="hidden lg:inline">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Mobile View Selector */}
                <div className="sm:hidden">
                  <select
                    value={viewMode}
                    onChange={(e) => setViewMode(e.target.value)}
                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    aria-label="Select view mode"
                  >
                    <option value="table">📊 Table View</option>
                    <option value="cards">🃏 Card View</option>
                    <option value="charts">📈 Chart View</option>
                  </select>
                </div>
              </div>
            </div>
            
            {/* Results Summary Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between py-4 px-6 bg-gradient-to-r from-gray-50/50 to-blue-50/30 rounded-xl border border-gray-100 mb-6">
              <div className="flex items-center space-x-4 mb-2 sm:mb-0">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-semibold text-gray-700">
                    Showing {filteredResults.length} of {results.length} results
                  </span>
                </div>
                {selectedResults.length > 0 && (
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span className="text-sm font-medium text-purple-700">
                      {selectedResults.length} selected
                    </span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center space-x-3">
                {filteredResults.length !== results.length && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setSelectedCategories([]);
                      setSelectedModels([]);
                      setScoreRange({ min: 0, max: 1 });
                    }}
                    className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Clear Filters
                  </button>
                )}
                <div className="text-xs text-gray-500 font-medium">
                  Last updated: {new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
            
            {/* Enhanced Filters Component */}
            <Filters
              results={results}
              selectedCategories={selectedCategories}
              setSelectedCategories={setSelectedCategories}
              selectedModels={selectedModels}
              setSelectedModels={setSelectedModels}
              scoreRange={scoreRange}
              setScoreRange={setScoreRange}
            />
          </div>
        </div>

        {/* Main Content */}
        {viewMode === 'charts' ? (
          <ScoreChart results={filteredResults} />
        ) : (
          <ScoreTable
            results={filteredResults}
            viewMode={viewMode}
            sortConfig={sortConfig}
            setSortConfig={setSortConfig}
            selectedResults={selectedResults}
            setSelectedResults={setSelectedResults}
          />
        )}
      </main>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                  Upload Evaluation Results
                </h2>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  aria-label="Close upload modal"
                >
                  <X size={20} className="text-gray-500 dark:text-gray-400" />
                </button>
              </div>
              
              <FileUpload 
                onFileUpload={handleFileUpload}
                onError={handleUploadError}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Main App component with theme provider
export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
