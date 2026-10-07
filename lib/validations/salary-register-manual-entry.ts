/**
 * Days entered by hand on the salary register — one schema for the dialog and
 * the route, so the form refuses exactly what the server would. The same rules
 * live in validateManualDays (salary-register-service.ts) and in the table's
 * CHECK constraints (20271007150000).
 */

import { z } from 'zod';

const days = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} must be a number` })
    .min(0, `${label} cannot be negative`)
    .max(31, `${label} cannot exceed 31`)
    .refine((v) => v * 2 === Math.trunc(v * 2), `${label} must be in whole or half days`);

const reason = z
  .string()
  .trim()
  .min(3, 'Give a reason (at least 3 characters)')
  .max(300, 'Keep the reason under 300 characters');

const fields = {
  business_working_days: days('Working days').refine((v) => v > 0, 'Working days must be more than 0'),
  casual_leave_days: days('Casual leave'),
  comp_off_days: days('Comp off'),
  other_paid_leave_days: days('Other paid leave'),
  on_duty_days: days('On duty'),
  unpaid_leave_days: days('LOP'),
  // Only asked for when no salary is recorded; the server decides which applies.
  monthly_gross: z.coerce.number().positive('Monthly gross must be more than 0').max(99_999_999).nullable(),
};

type DayCounts = {
  business_working_days: number;
  casual_leave_days: number;
  comp_off_days: number;
  other_paid_leave_days: number;
  on_duty_days: number;
  unpaid_leave_days: number;
};

const daysFitTheMonth = (v: DayCounts) =>
  v.casual_leave_days + v.comp_off_days + v.other_paid_leave_days + v.on_duty_days + v.unpaid_leave_days <=
  v.business_working_days;

const fitMessage = {
  message: 'Leave, on duty and LOP cannot add up to more than the working days',
  path: ['unpaid_leave_days'],
};

/** Saving: a reason is required. */
export const manualEntrySchema = z.object({ ...fields, reason }).refine(daysFitTheMonth, fitMessage);

/** The live preview may run before a reason has been typed. */
export const manualPreviewSchema = z
  .object({ ...fields, reason: z.string().optional() })
  .refine(daysFitTheMonth, fitMessage);

export type ManualEntryFormValues = z.infer<typeof manualEntrySchema>;
