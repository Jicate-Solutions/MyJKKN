/**
 * Prism.js Configuration for Syntax Highlighting
 * Supports: JavaScript, TypeScript, Python, Bash (for cURL), and JSON
 */

import Prism from 'prismjs';

// Disable Prism's automatic highlighting to prevent double-highlighting
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.Prism = window.Prism || {};
  // @ts-ignore
  window.Prism.manual = true;
}

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
/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export function highlightCode(code: string, language: SupportedLanguage): string {
  // Map curl to bash
  const prismLanguage = language === 'curl' ? 'bash' : language;

  // Check if Prism is available and grammar exists
  if (typeof window === 'undefined' || !Prism || !Prism.languages) {
    return escapeHtml(code); // Server-side or Prism not loaded
  }

  const grammar = Prism.languages[prismLanguage];

  if (!grammar || typeof grammar !== 'object') {
    return escapeHtml(code);
  }

  try {
    return Prism.highlight(code, grammar, prismLanguage);
  } catch (error) {
    // Silently fallback to escaped plain code
    // This prevents Prism errors from breaking the UI
    return escapeHtml(code);
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
