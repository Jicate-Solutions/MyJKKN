// lib/utils/input-validator.ts
// Comprehensive Input Validation and Sanitization Utility
// CRITICAL: Prevents XSS, injection attacks, and malformed data

import validator from 'validator';

/**
 * InputValidator - Centralized validation and sanitization for all user inputs
 *
 * SECURITY: This class is the FIRST line of defense against:
 * - XSS attacks via script injection
 * - SQL injection via malformed input
 * - DoS attacks via oversized payloads
 * - Data corruption via invalid formats
 *
 * ALL user inputs MUST go through this validator before:
 * - Storing in database
 * - Displaying to users
 * - Using in computations
 */
export class InputValidator {
  /**
   * Validate and sanitize email addresses
   * @param email - Email address to validate
   * @returns Normalized and sanitized email
   * @throws Error if email is invalid
   */
  static email(email: string): string {
    if (!email || typeof email !== 'string') {
      throw new Error('Email is required');
    }

    const trimmed = email.trim();

    if (!validator.isEmail(trimmed)) {
      throw new Error('Invalid email address format');
    }

    // Check for suspicious patterns
    if (trimmed.includes('..') || trimmed.includes('\\')) {
      throw new Error('Email contains invalid characters');
    }

    // Normalize and convert to lowercase
    const normalized = validator.normalizeEmail(trimmed, {
      gmail_remove_dots: false, // Keep dots in Gmail addresses
      gmail_remove_subaddress: false, // Keep +tag in Gmail
      outlookdotcom_remove_subaddress: false,
      yahoo_remove_subaddress: false,
      icloud_remove_subaddress: false,
    });

    return normalized || trimmed.toLowerCase();
  }

  /**
   * Validate Indian phone numbers
   * Supports formats:
   * - 9876543210 (10 digits)
   * - +919876543210 (with country code)
   * - 919876543210 (without + prefix)
   *
   * @param phone - Phone number to validate
   * @returns Sanitized 10-digit phone number (without country code)
   * @throws Error if phone number is invalid
   */
  static phoneNumber(phone: string): string {
    if (!phone || typeof phone !== 'string') {
      throw new Error('Phone number is required');
    }

    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');

    // Validate format
    if (cleaned.length === 10) {
      // 10 digits - valid Indian mobile number
      if (!cleaned.match(/^[6-9][0-9]{9}$/)) {
        throw new Error('Invalid phone number. Must start with 6-9.');
      }
      return cleaned;
    } else if (cleaned.length === 12 && cleaned.startsWith('91')) {
      // 12 digits with country code (91XXXXXXXXXX)
      const without91 = cleaned.slice(2);
      if (!without91.match(/^[6-9][0-9]{9}$/)) {
        throw new Error('Invalid phone number. Must start with 6-9.');
      }
      return without91;
    }

    throw new Error('Invalid phone number format. Must be 10 digits or include +91 country code.');
  }

  /**
   * Validate and sanitize text input
   * CRITICAL: Prevents XSS attacks by escaping HTML
   *
   * @param input - Text to validate
   * @param options - Validation options
   * @returns Sanitized text
   * @throws Error if validation fails
   */
  static text(
    input: string,
    options: {
      minLength?: number;
      maxLength?: number;
      allowedChars?: RegExp;
      trim?: boolean;
      allowHtml?: boolean;
      fieldName?: string;
    } = {}
  ): string {
    const {
      minLength = 0,
      maxLength = 1000,
      allowedChars = /^[\p{L}\p{N}\s\-_.,!?()'"@#$%&*+=\/\\[\]{}:;<>|~`]+$/u,
      trim = true,
      allowHtml = false,
      fieldName = 'Text',
    } = options;

    if (input === null || input === undefined) {
      throw new Error(`${fieldName} is required`);
    }

    if (typeof input !== 'string') {
      throw new Error(`${fieldName} must be a string`);
    }

    let text = input;

    if (trim) {
      text = text.trim();
    }

    // Check length constraints
    if (text.length < minLength) {
      throw new Error(`${fieldName} must be at least ${minLength} characters`);
    }

    if (text.length > maxLength) {
      throw new Error(`${fieldName} must not exceed ${maxLength} characters`);
    }

    // Check for null bytes (can cause SQL injection)
    if (text.includes('\0')) {
      throw new Error(`${fieldName} contains invalid null bytes`);
    }

    // Validate allowed characters
    if (!allowedChars.test(text)) {
      throw new Error(`${fieldName} contains invalid characters`);
    }

    // Sanitize HTML to prevent XSS (unless HTML is explicitly allowed)
    if (!allowHtml) {
      text = validator.escape(text);
    }

    return text;
  }

  /**
   * Validate UUID format
   * @param id - UUID to validate
   * @param fieldName - Field name for error messages
   * @returns Validated UUID
   * @throws Error if UUID is invalid
   */
  static uuid(id: string, fieldName: string = 'ID'): string {
    if (!id || typeof id !== 'string') {
      throw new Error(`${fieldName} is required`);
    }

    const trimmed = id.trim();

    // Use a permissive UUID regex that matches PostgreSQL's uuid type behavior
    // (accepts any 32 hex digits in 8-4-4-4-12 format without enforcing RFC 4122 variant bits)
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(trimmed)) {
      throw new Error(`${fieldName} must be a valid UUID`);
    }

    return trimmed;
  }

  /**
   * Validate and sanitize JSON payloads
   * CRITICAL: Prevents DoS attacks via oversized payloads
   *
   * @param input - Data to validate as JSON
   * @param maxSize - Maximum JSON string size in bytes
   * @returns Parsed and validated JSON
   * @throws Error if JSON is invalid or too large
   */
  static json<T>(input: unknown, maxSize: number = 100000): T {
    if (input === null || input === undefined) {
      throw new Error('JSON payload is required');
    }

    const jsonStr = JSON.stringify(input);

    // Check payload size to prevent DoS
    if (jsonStr.length > maxSize) {
      throw new Error(`JSON payload too large (max ${maxSize} bytes, got ${jsonStr.length})`);
    }

    try {
      return JSON.parse(jsonStr) as T;
    } catch (error) {
      throw new Error('Invalid JSON format');
    }
  }

  /**
   * Validate number within range
   * @param value - Number to validate
   * @param options - Validation options
   * @returns Validated number
   * @throws Error if validation fails
   */
  static number(
    value: number,
    options: {
      min?: number;
      max?: number;
      integer?: boolean;
      fieldName?: string;
    } = {}
  ): number {
    const {
      min = -Infinity,
      max = Infinity,
      integer = false,
      fieldName = 'Number',
    } = options;

    if (value === null || value === undefined) {
      throw new Error(`${fieldName} is required`);
    }

    if (typeof value !== 'number') {
      throw new Error(`${fieldName} must be a number`);
    }

    if (!Number.isFinite(value)) {
      throw new Error(`${fieldName} must be a finite number`);
    }

    if (integer && !Number.isInteger(value)) {
      throw new Error(`${fieldName} must be an integer`);
    }

    if (value < min) {
      throw new Error(`${fieldName} must be at least ${min}`);
    }

    if (value > max) {
      throw new Error(`${fieldName} must not exceed ${max}`);
    }

    return value;
  }

  /**
   * Validate date strings
   * Prevents dates outside reasonable ranges
   *
   * @param dateStr - Date string to validate
   * @param fieldName - Field name for error messages
   * @returns Validated Date object
   * @throws Error if date is invalid
   */
  static date(dateStr: string, fieldName: string = 'Date'): Date {
    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error(`${fieldName} is required`);
    }

    const trimmed = dateStr.trim();

    // Check if it's a valid ISO 8601 date
    if (!validator.isISO8601(trimmed)) {
      throw new Error(`${fieldName} must be in ISO 8601 format`);
    }

    const date = new Date(trimmed);

    if (isNaN(date.getTime())) {
      throw new Error(`${fieldName} is not a valid date`);
    }

    // Prevent dates too far in past or future (data quality check)
    const now = new Date();
    const minDate = new Date('2000-01-01');
    const maxDate = new Date(now.getFullYear() + 50, 11, 31);

    if (date < minDate) {
      throw new Error(`${fieldName} cannot be before year 2000`);
    }

    if (date > maxDate) {
      throw new Error(`${fieldName} is too far in the future`);
    }

    return date;
  }

  /**
   * Validate URL format
   * @param url - URL to validate
   * @param options - Validation options
   * @returns Validated URL
   * @throws Error if URL is invalid
   */
  static url(
    url: string,
    options: {
      protocols?: string[];
      requireProtocol?: boolean;
      fieldName?: string;
    } = {}
  ): string {
    const {
      protocols = ['http', 'https'],
      requireProtocol = true,
      fieldName = 'URL',
    } = options;

    if (!url || typeof url !== 'string') {
      throw new Error(`${fieldName} is required`);
    }

    const trimmed = url.trim();

    if (!validator.isURL(trimmed, { protocols, require_protocol: requireProtocol })) {
      throw new Error(`${fieldName} is not a valid URL`);
    }

    // Additional security check: prevent javascript: and data: URLs
    if (trimmed.toLowerCase().startsWith('javascript:') || trimmed.toLowerCase().startsWith('data:')) {
      throw new Error(`${fieldName} protocol is not allowed`);
    }

    return trimmed;
  }

  /**
   * Validate file uploads
   * CRITICAL: Prevents malicious file uploads
   *
   * @param file - File metadata to validate
   * @param options - Validation options
   * @throws Error if file is invalid
   */
  static fileUpload(
    file: {
      name: string;
      size: number;
      type: string;
    },
    options: {
      maxSize?: number;
      allowedTypes?: string[];
      allowedExtensions?: string[];
    } = {}
  ): void {
    const {
      maxSize = 10 * 1024 * 1024, // 10 MB default
      allowedTypes = [],
      allowedExtensions = [],
    } = options;

    // Validate file name
    if (!file.name || typeof file.name !== 'string') {
      throw new Error('File name is required');
    }

    // Check for path traversal attempts
    if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
      throw new Error('File name contains invalid characters');
    }

    // Validate file size
    if (file.size > maxSize) {
      const maxMB = Math.floor(maxSize / (1024 * 1024));
      throw new Error(`File size exceeds maximum allowed (${maxMB} MB)`);
    }

    // Validate MIME type
    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
      throw new Error(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }

    // Validate file extension
    if (allowedExtensions.length > 0) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (!extension || !allowedExtensions.includes(extension)) {
        throw new Error(`File extension not allowed. Allowed: ${allowedExtensions.join(', ')}`);
      }
    }

    // Prevent double extensions (e.g., file.pdf.exe)
    const parts = file.name.split('.');
    if (parts.length > 2) {
      throw new Error('File name cannot contain multiple extensions');
    }
  }

  /**
   * Validate and sanitize HTML content
   * Use DOMPurify on the client side for actual HTML sanitization
   * This is a basic server-side validation
   *
   * @param html - HTML content to validate
   * @param maxLength - Maximum length
   * @returns Validated HTML
   * @throws Error if HTML is invalid
   */
  static html(html: string, maxLength: number = 50000): string {
    if (!html || typeof html !== 'string') {
      throw new Error('HTML content is required');
    }

    if (html.length > maxLength) {
      throw new Error(`HTML content too long (max ${maxLength} characters)`);
    }

    // Check for dangerous tags
    const dangerousTags = /<script|<iframe|<object|<embed|<link|<meta|<base/gi;
    if (dangerousTags.test(html)) {
      throw new Error('HTML contains potentially dangerous tags');
    }

    // Check for javascript: URLs in attributes
    const dangerousAttrs = /on\w+\s*=|javascript:/gi;
    if (dangerousAttrs.test(html)) {
      throw new Error('HTML contains potentially dangerous attributes');
    }

    return html;
  }

  /**
   * Validate enum values
   * @param value - Value to validate
   * @param allowedValues - Array of allowed values
   * @param fieldName - Field name for error messages
   * @returns Validated value
   * @throws Error if value is not in allowed list
   */
  static enum<T extends string>(
    value: T,
    allowedValues: readonly T[],
    fieldName: string = 'Value'
  ): T {
    if (!value) {
      throw new Error(`${fieldName} is required`);
    }

    if (!allowedValues.includes(value)) {
      throw new Error(
        `${fieldName} must be one of: ${allowedValues.join(', ')}. Got: ${value}`
      );
    }

    return value;
  }

  /**
   * Sanitize object by removing null bytes and validating structure
   * @param obj - Object to sanitize
   * @param maxDepth - Maximum nesting depth
   * @returns Sanitized object
   * @throws Error if object structure is invalid
   */
  static object<T extends Record<string, unknown>>(
    obj: T,
    maxDepth: number = 10
  ): T {
    if (!obj || typeof obj !== 'object') {
      throw new Error('Input must be an object');
    }

    const sanitize = (value: unknown, depth: number): unknown => {
      if (depth > maxDepth) {
        throw new Error('Object nesting too deep');
      }

      if (value === null || value === undefined) {
        return value;
      }

      if (typeof value === 'string') {
        // Remove null bytes
        return value.replace(/\0/g, '');
      }

      if (Array.isArray(value)) {
        return value.map(item => sanitize(item, depth + 1));
      }

      if (typeof value === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
          // Validate key names
          if (key.includes('\0')) {
            throw new Error('Object key contains null bytes');
          }
          sanitized[key] = sanitize(val, depth + 1);
        }
        return sanitized;
      }

      return value;
    };

    return sanitize(obj, 0) as T;
  }
}
