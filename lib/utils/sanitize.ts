/**
 * Input Sanitization Utilities
 * Prevents XSS attacks by sanitizing user input
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content to prevent XSS
 * Use this before displaying any user-generated HTML
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

/**
 * Sanitize plain text (removes all HTML tags)
 * Use this for text-only fields
 */
export function sanitizeText(dirty: string): string {
  return DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [] });
}

/**
 * Escape special characters for safe display
 * Use when rendering user input as text
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate phone number (Indian format)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^[+]?[0-9]{10,13}$/;
  return phoneRegex.test(phone.replace(/\s+/g, ''));
}

/**
 * Sanitize file name to prevent path traversal
 */
export function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '_')
    .substring(0, 255);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Remove potentially dangerous characters from SQL queries
 * Note: This is NOT a replacement for parameterized queries
 */
export function sanitizeSqlInput(input: string): string {
  return input.replace(/[;'"\\]/g, '');
}

/**
 * Validate and sanitize numeric input
 */
export function sanitizeNumber(input: string | number, options?: {
  min?: number;
  max?: number;
  decimals?: number;
}): number | null {
  const num = typeof input === 'string' ? parseFloat(input) : input;

  if (isNaN(num) || !isFinite(num)) {
    return null;
  }

  let sanitized = num;

  if (options?.min !== undefined && sanitized < options.min) {
    sanitized = options.min;
  }

  if (options?.max !== undefined && sanitized > options.max) {
    sanitized = options.max;
  }

  if (options?.decimals !== undefined) {
    sanitized = parseFloat(sanitized.toFixed(options.decimals));
  }

  return sanitized;
}

/**
 * Check if string contains potential XSS patterns
 */
export function containsXss(input: string): boolean {
  const xssPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick=, onerror=, etc.
    /<iframe/i,
    /<embed/i,
    /<object/i,
  ];

  return xssPatterns.some((pattern) => pattern.test(input));
}

/**
 * Sanitize object properties recursively
 */
export function sanitizeObject<T extends Record<string, any>>(obj: T): T {
  const sanitized = {} as T;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key as keyof T] = sanitizeText(value) as any;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sanitized[key as keyof T] = sanitizeObject(value);
    } else if (Array.isArray(value)) {
      sanitized[key as keyof T] = value.map((item) =>
        typeof item === 'object' && item !== null ? sanitizeObject(item) : sanitizeText(String(item))
      ) as any;
    } else {
      sanitized[key as keyof T] = value;
    }
  }

  return sanitized;
}
