/**
 * Version: 1.0.0
 * Path: /public/src/components/ThemeToggle.jsx
 * Description: Professional theme toggle component with smooth animations
 * Author: Ali Kahwaji
 */

import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext.jsx';

export default function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="group relative inline-flex items-center justify-center w-12 h-12 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 rounded-xl hover:bg-white dark:hover:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-300 hover:scale-105 transform shadow-sm hover:shadow-lg"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <div className="relative w-6 h-6">
        {/* Sun Icon */}
        <Sun 
          className={`absolute inset-0 w-6 h-6 text-amber-500 transition-all duration-300 ${
            isDark 
              ? 'opacity-0 rotate-90 scale-0' 
              : 'opacity-100 rotate-0 scale-100 group-hover:rotate-12'
          }`}
        />
        
        {/* Moon Icon */}
        <Moon 
          className={`absolute inset-0 w-6 h-6 text-blue-600 dark:text-blue-400 transition-all duration-300 ${
            isDark 
              ? 'opacity-100 rotate-0 scale-100 group-hover:-rotate-12' 
              : 'opacity-0 -rotate-90 scale-0'
          }`}
        />
      </div>
      
      {/* Subtle background animation */}
      <div className={`absolute inset-0 rounded-xl transition-all duration-300 ${
        isDark 
          ? 'bg-gradient-to-br from-blue-500/10 to-indigo-600/10' 
          : 'bg-gradient-to-br from-amber-400/10 to-orange-500/10'
      } opacity-0 group-hover:opacity-100`}></div>
    </button>
  );
}
