/**
 * Version: 1.0.0
 * Path: /public/src/components/FileUpload.jsx
 * Description: Professional drag-and-drop file upload component with validation
 * Author: Ali Kahwaji
 */

import { useState, useCallback } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle, X } from 'lucide-react';

export default function FileUpload({ onFileUpload, onError }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null); // 'success', 'error', null

  const validateFile = (file) => {
    // Check file type
    if (!file.name.toLowerCase().endsWith('.json')) {
      throw new Error('Please upload a JSON file (.json)');
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File size must be less than 10MB');
    }

    return true;
  };

  const validateJSONStructure = (data) => {
    if (!Array.isArray(data)) {
      throw new Error('JSON must contain an array of evaluation results');
    }

    if (data.length === 0) {
      throw new Error('JSON file cannot be empty');
    }

    // Validate first item structure
    const firstItem = data[0];
    const requiredFields = ['id', 'prompt', 'expected', 'actual', 'scores', 'metadata', 'success'];
    
    for (const field of requiredFields) {
      if (!(field in firstItem)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Validate scores structure
    if (!firstItem.scores || typeof firstItem.scores !== 'object') {
      throw new Error('Invalid scores structure');
    }

    const requiredScores = ['bleu', 'rouge'];
    for (const score of requiredScores) {
      if (!(score in firstItem.scores) || typeof firstItem.scores[score] !== 'number') {
        throw new Error(`Missing or invalid score: ${score}`);
      }
    }

    return true;
  };

  const handleFile = useCallback(async (file) => {
    try {
      setIsUploading(true);
      setUploadStatus(null);

      // Validate file
      validateFile(file);

      // Read and parse JSON
      const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error('Invalid JSON format');
      }

      // Validate structure
      validateJSONStructure(data);

      // Success
      setUploadStatus('success');
      onFileUpload(data);

      // Clear success status after 3 seconds
      setTimeout(() => setUploadStatus(null), 3000);

    } catch (error) {
      setUploadStatus('error');
      onError(error.message);
      
      // Clear error status after 5 seconds
      setTimeout(() => setUploadStatus(null), 5000);
    } finally {
      setIsUploading(false);
    }
  }, [onFileUpload, onError]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleFileSelect = useCallback((e) => {
    const files = Array.from(e.target.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
    // Reset input
    e.target.value = '';
  }, [handleFile]);

  return (
    <div className="relative">
      {/* Main Upload Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 ${
          isDragging
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 scale-105'
            : uploadStatus === 'success'
            ? 'border-green-400 bg-green-50 dark:bg-green-900/20'
            : uploadStatus === 'error'
            ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
            : 'border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/50 hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-900/10'
        }`}
      >
        {/* Upload Icon */}
        <div className="flex justify-center mb-4">
          {isUploading ? (
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          ) : uploadStatus === 'success' ? (
            <CheckCircle className="w-12 h-12 text-green-600" />
          ) : uploadStatus === 'error' ? (
            <AlertCircle className="w-12 h-12 text-red-600" />
          ) : (
            <Upload className={`w-12 h-12 transition-colors ${
              isDragging ? 'text-blue-600' : 'text-gray-400 dark:text-gray-500'
            }`} />
          )}
        </div>

        {/* Upload Text */}
        <div className="space-y-2">
          {isUploading ? (
            <p className="text-lg font-semibold text-blue-600">Uploading and validating...</p>
          ) : uploadStatus === 'success' ? (
            <p className="text-lg font-semibold text-green-600">File uploaded successfully!</p>
          ) : uploadStatus === 'error' ? (
            <p className="text-lg font-semibold text-red-600">Upload failed</p>
          ) : (
            <>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">
                {isDragging ? 'Drop your file here' : 'Drag & drop your evaluation file'}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                or click to browse
              </p>
            </>
          )}
        </div>

        {/* File Input */}
        <input
          type="file"
          accept=".json"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={isUploading}
          aria-label="Upload evaluation results file"
        />

        {/* File Format Info */}
        {!isUploading && !uploadStatus && (
          <div className="mt-4 flex items-center justify-center space-x-2 text-xs text-gray-500 dark:text-gray-400">
            <FileText size={14} />
            <span>Supports JSON files up to 10MB</span>
          </div>
        )}
      </div>

      {/* Status Messages */}
      {uploadStatus === 'error' && (
        <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">Upload Error</h4>
              <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                Please check your file format and try again.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Expected Format Info */}
      <details className="mt-4 group">
        <summary className="cursor-pointer text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 flex items-center space-x-2">
          <span>Expected JSON format</span>
          <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </summary>
        <div className="mt-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
{`[
  {
    "id": 1,
    "prompt": "What is the capital of France?",
    "expected": "Paris",
    "actual": "Paris is the capital of France.",
    "scores": {
      "bleu": 0.85,
      "rouge": 0.92
    },
    "metadata": {
      "model": "gpt-4",
      "response_time_ms": 1200,
      "tokens_used": 45
    },
    "success": true,
    "category": "geography"
  }
]`}
          </pre>
        </div>
      </details>
    </div>
  );
}
