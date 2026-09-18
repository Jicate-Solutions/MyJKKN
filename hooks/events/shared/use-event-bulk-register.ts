// hooks/events/shared/use-event-bulk-register.ts
// Shared bulk roster/CSV import hooks for ANY event type (Events Platform Promotion PR7).
//
// Provides:
//   • parseRosterFile()         — parse a .xlsx/.csv File into canonical row objects (client-side, no upload)
//   • parseRosterText()         — same, for pasted CSV / spreadsheet cells (shares the header aliases)
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
// Header normalisation (shared by the file-upload and paste-CSV paths)
// ============================================================================
//
// Rosters arrive from the downloaded template ("Name *", "Phone *"), from machine keys
// ("participant_name") and from hand-made Google Sheets ("Student Name", "Mobile Number", "Email ID").
// Every header is normalised (case-insensitive, trimmed, spaces/underscores collapsed, trailing "*"
// stripped) and mapped onto the canonical keys the server engine reads, so all three shapes import.

/** Lower-case, trim, strip a trailing required-marker "*", collapse runs of spaces/underscores. */
export function normaliseRosterHeader(header: string): string {
  return String(header)
    .replace(/^﻿/, '')
    .trim()
    .replace(/\*+$/, '')
    .replace(/[\s_]+/g, ' ')
    .trim()
    .toLowerCase();
}

interface RosterField {
  /** Canonical key the server engine reads (see EventBulkRegisterService TEMPLATE_COLUMNS). */
  key: string;
  /** Label shown to the user when listing expected headers. */
  label: string;
  required?: boolean;
  /** Accepted header spellings (normalised form). The canonical key itself is always accepted. */
  aliases: string[];
}

const ROSTER_FIELDS: RosterField[] = [
  {
    key: 'participant_name',
    label: 'Name',
    required: true,
    aliases: ['name', 'participant name', 'student name', 'full name', 'learner name'],
  },
  {
    key: 'participant_phone',
    label: 'Phone',
    required: true,
    aliases: [
      'phone',
      'mobile',
      'mobile number',
      'mobile no',
      'phone number',
      'phone no',
      'contact',
      'contact number',
      'whatsapp',
      'whatsapp number',
    ],
  },
  { key: 'participant_email', label: 'Email', aliases: ['email', 'email id', 'email address', 'mail', 'mail id', 'e-mail'] },
  { key: 'participant_age', label: 'Age', aliases: ['age'] },
  { key: 'participant_gender', label: 'Gender', aliases: ['gender', 'sex'] },
  { key: 'category_code', label: 'Category Code', aliases: ['category code', 'category'] },
  {
    key: 'institution_name',
    label: 'Institution / Organization',
    aliases: [
      'institution / organization',
      'institution',
      'institution name',
      'organization',
      'organisation',
      'college',
      'college name',
    ],
  },
  { key: 'department', label: 'Department', aliases: ['department', 'dept', 'branch'] },
  { key: 'tshirt_size', label: 'T-Shirt Size', aliases: ['t-shirt size', 'tshirt size', 't shirt size'] },
  { key: 'blood_group', label: 'Blood Group', aliases: ['blood group'] },
  { key: 'emergency_contact_name', label: 'Emergency Contact Name', aliases: ['emergency contact name'] },
  {
    key: 'emergency_contact_phone',
    label: 'Emergency Contact Phone',
    aliases: ['emergency contact phone', 'emergency contact number'],
  },
  { key: 'payment_status', label: 'Payment Status', aliases: ['payment status'] },
  { key: 'payment_amount', label: 'Amount Paid', aliases: ['amount paid', 'payment amount'] },
  { key: 'payment_method', label: 'Payment Method', aliases: ['payment method'] },
  { key: 'payment_reference', label: 'Payment Reference', aliases: ['payment reference', 'transaction id'] },
];

/** normalised header → canonical key */
const HEADER_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const f of ROSTER_FIELDS) {
    map.set(normaliseRosterHeader(f.key), f.key);
    for (const a of f.aliases) map.set(normaliseRosterHeader(a), f.key);
  }
  return map;
})();

/** Resolve a sheet header to its canonical key, or null when it is not a recognised column. */
export function resolveRosterHeader(header: string): string | null {
  return HEADER_LOOKUP.get(normaliseRosterHeader(header)) ?? null;
}

/** Strip spaces/dashes/brackets and a +91 / 0 trunk prefix from an Indian mobile number. */
export function normaliseRosterPhone(value: string): string {
  const digits = String(value).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

const GENDER_ALIASES: Record<string, string> = {
  m: 'male',
  male: 'male',
  f: 'female',
  female: 'female',
  o: 'other',
  other: 'other',
  others: 'other',
};

/** Map M/F/Male/FEMALE/… onto male/female/other; unknown values pass through (lower-cased) for validation. */
export function normaliseRosterGender(value: string): string {
  const v = String(value).trim().toLowerCase();
  return GENDER_ALIASES[v] ?? v;
}

/** Human-readable list of the headers the importer understands (for the zero-rows message). */
function describeExpectedHeaders(): string {
  return ROSTER_FIELDS.map((f) => (f.required ? `${f.label} (required)` : f.label)).join(', ');
}

/**
 * Re-key raw sheet rows onto the canonical keys and normalise phone/gender values. Unrecognised
 * columns are dropped. When two columns map to the same key, the first non-empty value wins.
 */
function canonicaliseRosterRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((raw) => {
    const out: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(raw)) {
      const key = resolveRosterHeader(header);
      if (!key) continue;
      if (value === undefined || value === null) continue;
      const str = String(value).trim();
      if (str === '') continue;
      if (out[key] !== undefined && out[key] !== '') continue;
      out[key] = str;
    }
    for (const phoneKey of ['participant_phone', 'emergency_contact_phone']) {
      if (typeof out[phoneKey] === 'string') out[phoneKey] = normaliseRosterPhone(out[phoneKey] as string);
    }
    if (typeof out.participant_gender === 'string') {
      out.participant_gender = normaliseRosterGender(out.participant_gender);
    }
    return out;
  });
}

/**
 * Turn the first sheet of a parsed workbook into canonical roster rows. Used by both the file-upload
 * and paste-CSV paths so they accept exactly the same headers.
 */
export function parseRosterWorkbook(workbook: XLSX.WorkBook): ParseResult {
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) return { rows: [], error: 'The file has no sheets.' };

  const headerRow = (XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false })[0] ?? []) as unknown[];
  const foundHeaders = headerRow.map((h) => String(h ?? '').trim()).filter(Boolean);
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, unknown>[];

  // Keep only rows that have a name (drops the trailing empty rows Excel emits).
  const filtered = canonicaliseRosterRows(jsonRows).filter((row) => pick(row, 'participant_name').length > 0);

  if (filtered.length === 0) {
    const hasNameColumn = foundHeaders.some((h) => resolveRosterHeader(h) === 'participant_name');
    const found = foundHeaders.length > 0 ? foundHeaders.join(', ') : '(none)';
    const reason = hasNameColumn
      ? 'The name column is present but every row under it is empty.'
      : 'No name column was recognised in row 1.';
    return {
      rows: [],
      error: `No data rows found. ${reason} Headers found: ${found}. Expected: ${describeExpectedHeaders()}.`,
    };
  }
  if (filtered.length > MAX_ROWS) {
    return { rows: [], error: `Found ${filtered.length} rows. Maximum is ${MAX_ROWS} per import.` };
  }
  return { rows: filtered };
}

/** Parse pasted CSV (or tab-separated cells copied from a spreadsheet) into canonical roster rows. */
export function parseRosterText(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], error: 'Nothing pasted.' };
  try {
    return parseRosterWorkbook(XLSX.read(trimmed, { type: 'string' }));
  } catch (err) {
    logger.error(MOD, 'Failed to parse pasted roster', err);
    return { rows: [], error: 'Could not parse the pasted data as CSV.' };
  }
}

// ============================================================================
// File parsing (client-side, no upload)
// ============================================================================

/** Parse a .xlsx or .csv File into canonical row objects. Resolves with an error string on failure. */
export function parseRosterFile(file: File): Promise<ParseResult> {
  return new Promise((resolve) => {
    if (file.size > MAX_BYTES) {
      resolve({ rows: [], error: 'File is too large (max 5MB)' });
      return;
    }
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.csv')) {
      resolve({ rows: [], error: 'Only .xlsx and .csv files are supported' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        resolve(parseRosterWorkbook(workbook));
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
    const phone = normaliseRosterPhone(pick(raw, 'participant_phone', 'Phone *', 'Phone'));
    const email = pick(raw, 'participant_email', 'Email');
    const ageStr = pick(raw, 'participant_age', 'Age');
    const age = ageStr ? Number(ageStr) : undefined;
    const gender = normaliseRosterGender(pick(raw, 'participant_gender', 'Gender'));
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

/**
 * Thrown when the import endpoint rejects the batch. When the server returned per-row errors
 * (e.g. 422 "All rows failed validation"), `result` carries them so the board can list each row.
 */
export class RosterImportError extends Error {
  result?: RosterImportResult;

  constructor(message: string, result?: RosterImportResult) {
    super(message);
    this.name = 'RosterImportError';
    this.result = result;
  }
}

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
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const rowResult = json?.result as RosterImportResult | undefined;
        const hasRowErrors = !!rowResult && Array.isArray(rowResult.errors) && rowResult.errors.length > 0;
        logger.warn(MOD, 'Bulk import rejected', { eventId, status: res.status, rowErrors: rowResult?.errors?.length ?? 0 });
        throw new RosterImportError(json?.error ?? 'Bulk import failed', hasRowErrors ? rowResult : undefined);
      }
      return json.result as RosterImportResult;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['event-registrations', variables.eventId] });
      queryClient.invalidateQueries({ queryKey: ['marathon-registrations'] });
    },
    onError: (error: Error) => {
      if (error instanceof RosterImportError && error.result) {
        toast.error(`${error.message} — see the row errors below`);
        return;
      }
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
