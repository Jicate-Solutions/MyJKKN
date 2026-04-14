// lib/constants/startup-studio/solve100.ts
// Constants for the Solve for 100 weekly tracking system.
// Spec: docs/SPEC-solve-for-100.md
// Added: 2026-04-14

import type { AppStatus, ValidationStatus } from '@/types/startup-studio';

/** Total weeks in the Solve for 100 program (10 months ≈ 44 weeks). */
export const SOLVE100_WEEKS = 44;

/** Day of week the weekly check-in is due (0 = Sunday … 4 = Thursday). */
export const CHECKIN_DEADLINE_DAY = 4;

/** Hour-of-day (24h, local) the weekly check-in is due — 23 = 11pm. */
export const CHECKIN_DEADLINE_HOUR = 23;

/** Bucketed paid-user counts shown in dropdowns/filters. */
export const PAID_USER_BRACKETS = [
  '0',
  '1-5',
  '6-10',
  '11-25',
  '26-50',
  '51-100',
  '100+',
] as const;
export type PaidUserBracket = (typeof PAID_USER_BRACKETS)[number];

/** Options for the App Status dropdown on the weekly check-in form. */
export const APP_STATUS_OPTIONS: { value: AppStatus; label: string }[] = [
  { value: 'live', label: 'Live (users can use it now)' },
  { value: 'needs_fixes', label: 'Live but needs fixes' },
  { value: 'building', label: 'Still building' },
  { value: 'pivoting', label: 'Pivoting (changing direction)' },
];

/** Options for the "Have you talked to this customer?" question on the ICP form. */
export const VALIDATION_STATUS_OPTIONS: {
  value: ValidationStatus;
  label: string;
}[] = [
  { value: 'yes_in_person', label: 'Yes — talked in person' },
  { value: 'yes_phone', label: 'Yes — talked on phone/video' },
  { value: 'no_watched', label: 'No — watched/observed them' },
  { value: 'no_guessing', label: 'No — guessing for now' },
];

/** Income bracket options for the ICP "The Person" section. */
export const INCOME_BRACKETS = [
  'Below Rs.15,000',
  'Rs.15,000 - Rs.30,000',
  'Rs.30,000 - Rs.75,000',
  'Rs.75,000 - Rs.1,50,000',
  'Above Rs.1,50,000',
] as const;
export type IncomeBracket = (typeof INCOME_BRACKETS)[number];

/** Phone/device type options for the ICP "The Person" section. */
export const PHONE_TYPES = [
  'Basic phone (no internet)',
  'Budget Android (below Rs.10,000)',
  'Mid-range Android (Rs.10,000-25,000)',
  'Premium Android or iPhone',
  'Mostly uses computer/laptop',
] as const;
export type PhoneType = (typeof PHONE_TYPES)[number];

/** Problem frequency options for the ICP "The Problem" section. */
export const PROBLEM_FREQUENCY = [
  'Every day',
  '2-3 times per week',
  'Once a week',
  'A few times a month',
  'Rarely',
] as const;
export type ProblemFrequency = (typeof PROBLEM_FREQUENCY)[number];

/** Human-readable label for an app status value. */
export function getAppStatusLabel(status: AppStatus | null | undefined): string {
  if (!status) return '—';
  return APP_STATUS_OPTIONS.find(o => o.value === status)?.label ?? status;
}

/** Human-readable label for a validation status value. */
export function getValidationStatusLabel(
  status: ValidationStatus | null | undefined
): string {
  if (!status) return '—';
  return (
    VALIDATION_STATUS_OPTIONS.find(o => o.value === status)?.label ?? status
  );
}
