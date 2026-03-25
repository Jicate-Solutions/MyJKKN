'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Persists form state to sessionStorage so data survives route navigation.
 *
 * Next.js App Router unmounts page components on navigation. All useState
 * values are destroyed. This hook saves form state on every change and
 * restores it when the component remounts.
 *
 * Usage:
 *   const [name, setName] = useFormDraft('expo-form', 'name', '');
 *   const [city, setCity] = useFormDraft('expo-form', 'city', '');
 *
 * Or use the object version for multiple fields:
 *   const { values, setValue, clearDraft } = useFormDraftObject('expo-form', {
 *     name: '', city: '', startDate: '', endDate: ''
 *   });
 *
 * Drafts are stored per-form key in sessionStorage (cleared on browser close).
 * Call clearDraft() after successful form submission.
 */

const DRAFT_PREFIX = 'form-draft:';

// ─── Single field version ──────────────────────────────────────────────────

export function useFormDraft<T>(
  formKey: string,
  fieldName: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const storageKey = `${DRAFT_PREFIX}${formKey}:${fieldName}`;

  const [value, setValueInternal] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) {
        return JSON.parse(saved) as T;
      }
    } catch {
      // Ignore parse errors
    }
    return defaultValue;
  });

  // Save to sessionStorage on change
  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Ignore quota errors
    }
  }, [storageKey, value]);

  const setValue = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      setValueInternal(newValue);
    },
    []
  );

  const clearField = useCallback(() => {
    sessionStorage.removeItem(storageKey);
    setValueInternal(defaultValue);
  }, [storageKey, defaultValue]);

  return [value, setValue, clearField];
}

// ─── Object version (multiple fields at once) ──────────────────────────────

export function useFormDraftObject<T extends Record<string, any>>(
  formKey: string,
  defaultValues: T
): {
  values: T;
  setValue: <K extends keyof T>(field: K, value: T[K]) => void;
  setValues: (partial: Partial<T>) => void;
  clearDraft: () => void;
  isDraft: boolean;
} {
  const storageKey = `${DRAFT_PREFIX}${formKey}`;
  const isInitialLoad = useRef(true);
  const isCleared = useRef(false);

  const [values, setValuesInternal] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValues;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new fields added after draft was saved
        return { ...defaultValues, ...parsed };
      }
    } catch {
      // Ignore parse errors
    }
    return defaultValues;
  });

  const [isDraft, setIsDraft] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(storageKey) !== null;
  });

  // Save to sessionStorage on change (skip initial load and post-clear)
  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (isCleared.current) {
      isCleared.current = false;
      return;
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(values));
      setIsDraft(true);
    } catch {
      // Ignore quota errors
    }
  }, [storageKey, values]);

  const setValue = useCallback(
    <K extends keyof T>(field: K, value: T[K]) => {
      setValuesInternal((prev) => ({ ...prev, [field]: value }));
    },
    []
  );

  const setValues = useCallback(
    (partial: Partial<T>) => {
      setValuesInternal((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const clearDraft = useCallback(() => {
    isCleared.current = true;
    sessionStorage.removeItem(storageKey);
    setValuesInternal(defaultValues);
    setIsDraft(false);
  }, [storageKey, defaultValues]);

  return { values, setValue, setValues, clearDraft, isDraft };
}

/**
 * Clears all form drafts for a specific form key.
 * Call this after successful form submission.
 */
export function clearFormDraft(formKey: string) {
  if (typeof window === 'undefined') return;
  const prefix = `${DRAFT_PREFIX}${formKey}`;
  const keysToRemove: string[] = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => sessionStorage.removeItem(key));
}
