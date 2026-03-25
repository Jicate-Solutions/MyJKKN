import { useCallback, useRef, useEffect } from 'react';

/**
 * Performance Optimization Utilities
 * Helpers for optimizing React components and reducing unnecessary renders
 */

/**
 * Debounce function - delays execution until after wait time has elapsed
 * Useful for search inputs, resize handlers, etc.
 *
 * @param func - Function to debounce
 * @param wait - Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      func(...args);
    };

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(later, wait);
  };
}

/**
 * Custom hook for debounced values
 * Updates value only after delay period without user input
 *
 * @param value - Value to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced value
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Custom hook for debounced callback
 * Returns a memoized debounced version of the callback
 *
 * @param callback - Callback to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced callback
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);

  // Update ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    debounce((...args: Parameters<T>) => {
      callbackRef.current(...args);
    }, delay),
    [delay]
  );
}

/**
 * Throttle function - ensures function is called at most once per interval
 * Useful for scroll handlers, window resize, etc.
 *
 * @param func - Function to throttle
 * @param limit - Time limit in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Custom hook for throttled callback
 *
 * @param callback - Callback to throttle
 * @param limit - Time limit in milliseconds
 * @returns Throttled callback
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  limit: number
): (...args: Parameters<T>) => void {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  return useCallback(
    throttle((...args: Parameters<T>) => {
      callbackRef.current(...args);
    }, limit),
    [limit]
  );
}

/**
 * Deep comparison function for React.memo
 * Compares objects/arrays by value instead of reference
 *
 * @param prevProps - Previous props
 * @param nextProps - Next props
 * @returns True if props are equal (skip re-render)
 */
export function arePropsEqual<T extends Record<string, any>>(
  prevProps: T,
  nextProps: T
): boolean {
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  for (const key of prevKeys) {
    const prevValue = prevProps[key];
    const nextValue = nextProps[key];

    // Handle functions
    if (typeof prevValue === 'function' && typeof nextValue === 'function') {
      continue; // Skip function comparison
    }

    // Handle arrays
    if (Array.isArray(prevValue) && Array.isArray(nextValue)) {
      if (prevValue.length !== nextValue.length) {
        return false;
      }
      if (!prevValue.every((val, index) => val === nextValue[index])) {
        return false;
      }
      continue;
    }

    // Handle objects
    if (
      typeof prevValue === 'object' &&
      prevValue !== null &&
      typeof nextValue === 'object' &&
      nextValue !== null
    ) {
      if (!arePropsEqual(prevValue, nextValue)) {
        return false;
      }
      continue;
    }

    // Primitive comparison
    if (prevValue !== nextValue) {
      return false;
    }
  }

  return true;
}

/**
 * Shallow comparison for React.memo
 * Faster than deep comparison, suitable for most cases
 *
 * @param prevProps - Previous props
 * @param nextProps - Next props
 * @returns True if props are equal (skip re-render)
 */
export function shallowEqual<T extends Record<string, any>>(
  prevProps: T,
  nextProps: T
): boolean {
  const prevKeys = Object.keys(prevProps);
  const nextKeys = Object.keys(nextProps);

  if (prevKeys.length !== nextKeys.length) {
    return false;
  }

  return prevKeys.every((key) => prevProps[key] === nextProps[key]);
}

// Import useState for useDebounce
import { useState } from 'react';
