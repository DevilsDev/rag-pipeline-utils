/**
 * Version: 1.0.0
 * Path: /public/src/components/ScoreChart.jsx
 * Description: Chart visualization component for evaluation metrics using Chart.js
 * Author: Ali Kahwaji
 */

import { useEffect, useRef, useState } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Bar, Line, Doughnut, Scatter } from 'react-chartjs-2';
import { BarChart3, TrendingUp, PieChart, Zap as ScatterIcon } from 'lucide-react';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

export default function ScoreChart({ results }) {
  const [activeChart, setActiveChart] = useState('scores');
  const chartRef = useRef(null);

  // Chart options
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
        },
      },
      y: {
        display: true,
        title: {
          display: true,
        },
        min: 0,
        max: 1,
      },
    },
  };

  // Score comparison chart data
  const scoreComparisonData = {
    labels: results.map((_, index) => `Eval ${index + 1}`),
    datasets: [
      {
        label: 'BLEU Score',
        data: results.map(r => r.scores.bleu),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 2,
      },
      {
        label: 'ROUGE Score',
        data: results.map(r => r.scores.rouge),
        backgroundColor: 'rgba(16, 185, 129, 0.6)',
        borderColor: 'rgba(16, 185, 129, 1)',
        borderWidth: 2,
      },
      {
        label: 'BERTScore',
        data: results.map(r => r.scores.bertscore || 0),
        backgroundColor: 'rgba(139, 92, 246, 0.6)',
        borderColor: 'rgba(139, 92, 246, 1)',
        borderWidth: 2,
      },
      {
        label: 'Semantic Similarity',
        data: results.map(r => r.scores.semantic_similarity || 0),
        backgroundColor: 'rgba(245, 158, 11, 0.6)',
        borderColor: 'rgba(245, 158, 11, 1)',
        borderWidth: 2,
      },
    ],
  };

  // Performance metrics chart data
  const performanceData = {
    labels: results.map((_, index) => `Eval ${index + 1}`),
    datasets: [
      {
        label: 'Response Time (ms)',
        data: results.map(r => r.metadata.response_time_ms),
        backgroundColor: 'rgba(239, 68, 68, 0.6)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 2,
        yAxisID: 'y',
      },
      {
        label: 'Tokens Used',
        data: results.map(r => r.metadata.tokens_used),
        backgroundColor: 'rgba(34, 197, 94, 0.6)',
        borderColor: 'rgba(34, 197, 94, 1)',
        borderWidth: 2,
        yAxisID: 'y1',
      },
    ],
  };

  const performanceOptions = {
    ...chartOptions,
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Evaluation Results',
        },
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Response Time (ms)',
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        title: {
          display: true,
          text: 'Tokens Used',
        },
        grid: {
          drawOnChartArea: false,
        },
      },
    },
  };

  // Model comparison data
  const modelStats = results.reduce((acc, result) => {
    const model = result.metadata.model;
    if (!acc[model]) {
      acc[model] = {
        count: 0,
        totalBLEU: 0,
        totalROUGE: 0,
        totalTime: 0,
        successes: 0,
      };
    }
    acc[model].count++;
    acc[model].totalBLEU += result.scores.bleu;
    acc[model].totalROUGE += result.scores.rouge;
    acc[model].totalTime += result.metadata.response_time_ms;
    if (result.success) acc[model].successes++;
    return acc;
  }, {});

  const modelComparisonData = {
    labels: Object.keys(modelStats),
    datasets: [
      {
        label: 'Avg BLEU Score',
        data: Object.values(modelStats).map(stats => (stats.totalBLEU / stats.count).toFixed(3)),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
      },
      {
        label: 'Avg ROUGE Score',
        data: Object.values(modelStats).map(stats => (stats.totalROUGE / stats.count).toFixed(3)),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
      },
      {
        label: 'Success Rate',
        data: Object.values(modelStats).map(stats => (stats.successes / stats.count).toFixed(3)),
        backgroundColor: 'rgba(245, 158, 11, 0.8)',
      },
    ],
  };

  // Category distribution data
  const categoryStats = results.reduce((acc, result) => {
    const category = result.category;
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  const categoryData = {
    labels: Object.keys(categoryStats),
    datasets: [
      {
        data: Object.values(categoryStats),
        backgroundColor: [
          'rgba(59, 130, 246, 0.8)',
          'rgba(16, 185, 129, 0.8)',
          'rgba(245, 158, 11, 0.8)',
          'rgba(239, 68, 68, 0.8)',
          'rgba(139, 92, 246, 0.8)',
          'rgba(236, 72, 153, 0.8)',
          'rgba(34, 197, 94, 0.8)',
          'rgba(168, 85, 247, 0.8)',
        ],
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  };

  // Score correlation scatter plot
  const scatterData = {
    datasets: [
      {
        label: 'BLEU vs ROUGE',
        data: results.map(r => ({
          x: r.scores.bleu,
          y: r.scores.rouge,
        })),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
      },
    ],
  };

  const scatterOptions = {
    ...chartOptions,
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'BLEU Score',
        },
        min: 0,
        max: 1,
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'ROUGE Score',
        },
        min: 0,
        max: 1,
      },
    },
  };

  const chartTabs = [
    { id: 'scores', label: 'Score Comparison', icon: BarChart3 },
    { id: 'performance', label: 'Performance', icon: TrendingUp },
    { id: 'models', label: 'Model Comparison', icon: BarChart3 },
    { id: 'categories', label: 'Categories', icon: PieChart },
    { id: 'correlation', label: 'Score Correlation', icon: ScatterIcon },
  ];

  const renderChart = () => {
    switch (activeChart) {
      case 'scores':
        return <Bar data={scoreComparisonData} options={chartOptions} />;
      case 'performance':
        return <Bar data={performanceData} options={performanceOptions} />;
      case 'models':
        return <Bar data={modelComparisonData} options={chartOptions} />;
      case 'categories':
        return <Doughnut data={categoryData} options={{ responsive: true, maintainAspectRatio: false }} />;
      case 'correlation':
        return <Scatter data={scatterData} options={scatterOptions} />;
      default:
        return <Bar data={scoreComparisonData} options={chartOptions} />;
    }
  };

  if (results.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <div className="text-gray-400 text-6xl mb-4">📊</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Data to Visualize</h3>
        <p className="text-gray-500">Upload evaluation results or adjust your filters to see charts.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      {/* Chart Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Chart tabs">
          {chartTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveChart(tab.id)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${
                  activeChart === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Chart Content */}
      <div className="p-6">
        <div className="h-96 w-full">
          {renderChart()}
        </div>
      </div>

      {/* Chart Statistics */}
      <div className="border-t border-gray-200 bg-gray-50 px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600">
              {results.length}
            </div>
            <div className="text-sm text-gray-600">Total Results</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {((results.filter(r => r.success).length / results.length) * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-gray-600">Success Rate</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-600">
              {(results.reduce((sum, r) => sum + r.scores.bleu, 0) / results.length).toFixed(3)}
            </div>
            <div className="text-sm text-gray-600">Avg BLEU</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-600">
              {(results.reduce((sum, r) => sum + r.metadata.response_time_ms, 0) / results.length).toFixed(0)}ms
            </div>
            <div className="text-sm text-gray-600">Avg Response Time</div>
          </div>
        </div>
      </div>
    </div>
  );
}
