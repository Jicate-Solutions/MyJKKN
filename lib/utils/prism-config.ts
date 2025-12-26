/**
 * Prism.js Configuration for Syntax Highlighting
 * Supports: JavaScript, TypeScript, Python, Bash (for cURL), and JSON
 */

import Prism from 'prismjs';

// Import language support
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-php';

// Import theme (using Tomorrow Night theme for dark mode compatibility)
import 'prismjs/themes/prism-tomorrow.css';

export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'bash'
  | 'json'
  | 'php'
  | 'curl'; // curl uses bash highlighting

/**
 * Highlights code using Prism.js
 * @param code - The code string to highlight
 * @param language - The programming language
 * @returns HTML string with syntax highlighting
 */
export function highlightCode(code: string, language: SupportedLanguage): string {
  // Map curl to bash
  const prismLanguage = language === 'curl' ? 'bash' : language;

  // Check if Prism is available and grammar exists
  if (typeof window === 'undefined' || !Prism || !Prism.languages) {
    return code; // Server-side or Prism not loaded
  }

  const grammar = Prism.languages[prismLanguage];

  if (!grammar || typeof grammar !== 'object') {
    console.warn(`Language "${prismLanguage}" not supported by Prism`);
    return code;
  }

  try {
    return Prism.highlight(code, grammar, prismLanguage);
  } catch (error) {
    console.error(`Error highlighting code for language "${prismLanguage}":`, error);
    return code; // Fallback to plain code
  }
}

/**
 * Get human-readable language label
 */
export function getLanguageLabel(language: SupportedLanguage): string {
  const labels: Record<SupportedLanguage, string> = {
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    python: 'Python',
    bash: 'Bash',
    json: 'JSON',
    php: 'PHP',
    curl: 'cURL',
  };

  return labels[language] || language;
}
