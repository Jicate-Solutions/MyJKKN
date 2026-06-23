// hooks/events/shared/use-event-bulk-register.ts
// Shared bulk roster/CSV import hooks for ANY event type (Events Platform Promotion PR7).
//
// Provides:
//   • parseRosterFile()         — parse a .xlsx/.csv File into raw row objects (client-side, no upload)
//   • validateRosterRows()      — lightweight client-side validation for the preview table
//   • useEventCategoryCodes()   — fetch the event's category codes (empty for category-less events)
//   • useImportRoster()         — POST parsed rows to the (shared) bulk-register endpoint
//
// Posts to /api/events/marathon/[eventId]/bulk-register — the same stable URL the promoted shared
// services reuse; the route auto-detects categories and routes to the BIB scheme or neutral codes.

'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';
import { logger } from '@/lib/utils/enhanced-logger';

const MOD = 'events/bulk-register';

// ============================================================================
// Types
// ============================================================================

export interface RosterRowError {
  field: string;
  message: string;
}

export interface ValidatedRosterRow {
  raw: Record<string, unknown>;
  rowNum: number;
  name: string;
  phone: string;
  email: string;
  age: string;
  gender: string;
  category: string;
  institution: string;
  paymentStatus: string;
  errors: RosterRowError[];
  isValid: boolean;
}

export interface RosterImportResult {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: { row: number; field: string; message: string }[];
  registrations: { row: number; bib_number: string; name: string }[];
}

export interface ParseResult {
  rows: Record<string, unknown>[];
  error?: string;
}

const MAX_ROWS = 1000;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

// ============================================================================
// Field extraction (tolerant of header label OR machine key)
// ============================================================================

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== null && v !== '') return String(v).trim();
  }
  return '';
}

// ============================================================================
// File parsing (client-side, no upload)
// ============================================================================

/** Parse a .xlsx or .csv File into raw row objects. Resolves with an error string on failure. */
export function parseRosterFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    if (file.size > MAX_BYTES) {
      resolve({ rows: [], error: 'File is too large (max 5MB)' });
      return;
    }
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
      resolve({ rows: [], error: 'Only .xlsx and .csv files are supported' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

        // Keep only rows that have a name (drops the trailing empty rows Excel emits).
        const filtered = jsonRows.filter((row) => pick(row, 'participant_name', 'Name *', 'Name').length > 0);

        if (filtered.length === 0) {
          resolve({ rows: [], error: 'No data rows found. Make sure row 1 has headers.' });
          return;
        }
        if (filtered.length > MAX_ROWS) {
          resolve({ rows: [], error: `File has ${filtered.length} rows. Maximum is ${MAX_ROWS} per import.` });
          return;
        }
        resolve({ rows: filtered });
      } catch (err) {
        logger.error(MOD, 'Failed to parse roster file', err);
        resolve({ rows: [], error: 'Failed to parse file. Make sure it is a valid Excel or CSV file.' });
      }
    };
    reader.onerror = () => resolve({ rows: [], error: 'Failed to read the file.' });
    reader.readAsArrayBuffer(file);
  });
}

// ============================================================================
// Client-side validation (mirrors the server engine for the preview table)
// ============================================================================

const VALID_PAYMENT_STATUSES = ['paid', 'pending', 'not_required', 'waived'];
const VALID_PAYMENT_METHODS = ['cash', 'upi', 'bank_transfer', 'card', 'online'];
const VALID_GENDERS = ['male', 'female', 'other'];

export function validateRosterRows(
  rows: Record<string, unknown>[],
  validCategoryCodes: string[]
): ValidatedRosterRow[] {
  const requireCategory = validCategoryCodes.length > 0;
  const seenPhones = new Set<string>();

  return rows.map((raw, i) => {
    const errors: RosterRowError[] = [];
    const rowNum = i + 2;

    const name = pick(raw, 'participant_name', 'Name *', 'Name');
    const phone = pick(raw, 'participant_phone', 'Phone *', 'Phone').replace(/\D/g, '');
    const email = pick(raw, 'participant_email', 'Email');
    const ageStr = pick(raw, 'participant_age', 'Age');
    const age = ageStr ? Number(ageStr) : undefined;
    const gender = pick(raw, 'participant_gender', 'Gender').toLowerCase();
    const category = pick(raw, 'category_code', 'Category Code *', 'Category Code').toUpperCase();
    const institution = pick(raw, 'institution_name', 'Institution / Organization');
    const paymentStatus = pick(raw, 'payment_status', 'Payment Status').toLowerCase();
    const paymentAmount = pick(raw, 'payment_amount', 'Amount Paid');
    const paymentMethod = pick(raw, 'payment_method', 'Payment Method').toLowerCase();

    if (!name || name.length < 2) errors.push({ field: 'Name', message: 'Required (min 2 characters)' });

    if (!phone || phone.length < 10 || phone.length > 15) {
      errors.push({ field: 'Phone', message: 'Required (10-15 digits)' });
    } else if (seenPhones.has(phone)) {
      errors.push({ field: 'Phone', message: 'Duplicate phone number in file' });
    }
    if (phone) seenPhones.add(phone);

    if (requireCategory && !category) {
      errors.push({ field: 'Category', message: 'Required' });
    } else if (category && !validCategoryCodes.includes(category)) {
      errors.push({ field: 'Category', message: `Invalid. Use: ${validCategoryCodes.join(', ')}` });
    }

    if (age !== undefined && (isNaN(age) || age < 1 || age > 150)) {
      errors.push({ field: 'Age', message: 'Must be 1-150' });
    }
    if (gender && !VALID_GENDERS.includes(gender)) {
      errors.push({ field: 'Gender', message: 'Must be male/female/other' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ field: 'Email', message: 'Invalid email format' });
    }
    if (paymentStatus && !VALID_PAYMENT_STATUSES.includes(paymentStatus)) {
      errors.push({ field: 'Payment Status', message: `Use: ${VALID_PAYMENT_STATUSES.join(', ')}` });
    }
    if (paymentAmount && (isNaN(Number(paymentAmount)) || Number(paymentAmount) < 0)) {
      errors.push({ field: 'Amount', message: 'Must be a positive number' });
    }
    if (paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      errors.push({ field: 'Payment Method', message: `Use: ${VALID_PAYMENT_METHODS.join(', ')}` });
    }

    return {
      raw,
      rowNum,
      name,
      phone,
      email,
      age: ageStr,
      gender,
      category,
      institution,
      paymentStatus,
      errors,
      isValid: errors.length === 0,
    };
  });
}

// ============================================================================
// Category codes (for validation + the template). Empty for category-less events.
// ============================================================================

interface CategoryRow {
  code: string | null;
}

export function useEventCategoryCodes(eventId: string) {
  return useQuery({
    queryKey: ['event-category-codes', eventId],
    enabled: !!eventId,
    queryFn: async () => {
      // Reuse the events categories endpoint already shipped for marathon (returns { data: [...] }
      // of active categories). Category-less events get an empty list, which the engine treats as
      // "category not required" — so the same flow works for events without categories.
      const res = await fetch(`/api/events/marathon/${eventId}/categories`);
      if (!res.ok) return [] as string[];
      const json = await res.json();
      const list = (json.data ?? json.categories ?? []) as CategoryRow[];
      return list
        .filter((c) => c && c.code)
        .map((c) => String(c.code).toUpperCase());
    },
  });
}

// ============================================================================
// Import mutation
// ============================================================================

export function useImportRoster() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      eventId,
      rows,
      categoryCodes,
    }: {
      eventId: string;
      rows: Record<string, unknown>[];
      categoryCodes: string[];
    }): Promise<RosterImportResult> => {
      const res = await fetch(`/api/events/marathon/${eventId}/bulk-register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, categoryCodes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Bulk import failed');
      return json.result as RosterImportResult;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['event-registrations', variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ['marathon-registrations'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Bulk import failed');
    },
  });
}

/** Convenience: trigger the template download for an event in a new tab. */
export function useDownloadRosterTemplate() {
  return useCallback((eventId: string) => {
    window.open(`/api/events/marathon/${eventId}/bulk-register?action=template`, '_blank');
  }, []);
}
