/**
 * Type Validation Utilities
 * Provides runtime type safety and default value handling
 */

/**
 * Ensures value is an array, returns default if not
 */
export function ensureArray<T>(value: unknown, defaultValue: T[] = []): T[] {
  return Array.isArray(value) ? value : defaultValue;
}

/**
 * Ensures value is a number, returns default if NaN or null/undefined
 */
export function ensureNumber(value: unknown, defaultValue: number = 0): number {
  if (value === null || value === undefined) return defaultValue;
  const num = Number(value);
  return isNaN(num) ? defaultValue : num;
}

/**
 * Ensures value is a plain object, returns default if not
 */
export function ensureObject<T extends object>(
  value: unknown,
  defaultValue: T
): T {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as T)
    : defaultValue;
}

/**
 * Ensures value is a string, returns default if not
 */
export function ensureString(value: unknown, defaultValue: string = ''): string {
  return typeof value === 'string' ? value : defaultValue;
}

/**
 * Ensures value is a boolean, returns default if not
 */
export function ensureBoolean(value: unknown, defaultValue: boolean = false): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}

/**
 * Validates and ensures JSON field is an object with expected structure
 */
export function validateJsonField<T extends object>(
  value: unknown,
  defaultValue: T,
  validator?: (obj: T) => boolean
): T {
  const obj = ensureObject(value, defaultValue);

  if (validator && !validator(obj)) {
    console.warn('[Validation] JSON field failed validation, using defaults:', value);
    return defaultValue;
  }

  return obj;
}

/**
 * Validates numeric range, clamps to min/max
 */
export function clampNumber(
  value: unknown,
  min: number,
  max: number,
  defaultValue?: number
): number {
  const num = ensureNumber(value, defaultValue ?? min);
  return Math.max(min, Math.min(max, num));
}

/**
 * Safely get nested property with default
 */
export function safeGet<T>(
  obj: unknown,
  path: string,
  defaultValue: T
): T {
  if (!obj || typeof obj !== 'object') return defaultValue;

  const keys = path.split('.');
  let current: any = obj;

  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }

  return current ?? defaultValue;
}

/**
 * Validates array has items and all items pass validator
 */
export function validateArray<T>(
  value: unknown,
  itemValidator: (item: unknown) => item is T,
  defaultValue: T[] = []
): T[] {
  if (!Array.isArray(value)) return defaultValue;

  const validated = value.filter(itemValidator);
  return validated.length > 0 ? validated : defaultValue;
}

/**
 * Type guard: Check if value is non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Type guard: Check if value is valid number (not NaN)
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Type guard: Check if value is non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Type guard: Check if value is non-empty array
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0;
}
