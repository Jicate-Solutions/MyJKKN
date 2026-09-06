// lib/services/school-fees/school-fees-schemas.ts
//
// Zod schemas for the school fee module. These mirror the DB CHECK constraints
// in 20260813100001..100009 so a bad value is rejected in the form rather than
// surfacing as an opaque 400 from PostgREST.
//
// Where a schema and a DB constraint overlap, the DB is the source of truth —
// the comment on each rule names the constraint it shadows.

import { z } from 'zod';
import { MIN_TERM_NUMBER, MAX_TERM_NUMBER } from '@/types/school-fees';

const uuid = z.string().uuid('Must be a valid ID');

/** DB: school_fee_plan_items.term_number CHECK (term_number BETWEEN 1 AND 6) */
export const termNumberSchema = z
  .number()
  .int('Term must be a whole number')
  .min(MIN_TERM_NUMBER, `Term must be at least ${MIN_TERM_NUMBER}`)
  .max(MAX_TERM_NUMBER, `Term cannot exceed ${MAX_TERM_NUMBER}`);

/** DB: numeric(15,2) CHECK (amount >= 0) — two decimal places, no negatives. */
export const amountSchema = z
  .number({ invalid_type_error: 'Amount must be a number' })
  .nonnegative('Amount cannot be negative')
  .max(9_999_999_999_999, 'Amount is out of range')
  .refine((v) => Number.isFinite(v), 'Amount must be a finite number')
  // numeric(15,2) truncates anything finer than paise. Compare against the
  // rounded value with a float tolerance — `Math.round(v*100) === Number((v*100).toFixed(0))`
  // looks like a check but is a tautology, since both sides round identically.
  .refine(
    (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6,
    'Amount cannot have more than 2 decimal places',
  );

export const schoolFeePlanStatusSchema = z.enum(['draft', 'active', 'archived']);

// ---------------------------------------------------------------------------
// Fee plan
// ---------------------------------------------------------------------------

export const schoolFeePlanItemSchema = z.object({
  billing_category_id: uuid,
  term_number: termNumberSchema,
  amount: amountSchema,
  is_one_time: z.boolean().optional().default(false),
  sort_order: z.number().int().nonnegative().optional(),
});

export const createSchoolFeePlanSchema = z.object({
  institution_id: uuid,
  program_id: uuid,
  academic_year_id: uuid,
  name: z.string().trim().min(1, 'Plan name is required').max(200, 'Plan name is too long'),
  status: schoolFeePlanStatusSchema.optional().default('draft'),
  notes: z.string().trim().max(2000).nullish(),
  items: z
    .array(schoolFeePlanItemSchema)
    .min(1, 'Add at least one fee head before saving')
    // DB: UNIQUE (plan_id, billing_category_id, term_number). Catching it here
    // gives the operator a field-level message instead of a 23505 toast.
    .refine(
      (items) => {
        const seen = new Set(items.map((i) => `${i.billing_category_id}:${i.term_number}`));
        return seen.size === items.length;
      },
      { message: 'The same fee head cannot appear twice in one term' },
    ),
});

export const updateSchoolFeePlanSchema = createSchoolFeePlanSchema
  .omit({ institution_id: true, program_id: true, academic_year_id: true })
  .partial();

// ---------------------------------------------------------------------------
// Term calendar
// ---------------------------------------------------------------------------

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Not a real date');

export const schoolTermCalendarRowSchema = z
  .object({
    term_number: termNumberSchema,
    term_name: z.string().trim().min(1, 'Term name is required').max(100),
    due_date: dateString,
    fine_effective_date: dateString.nullish(),
    fine_amount: amountSchema.optional().default(0),
  })
  // DB: CONSTRAINT school_term_calendars_fine_after_due
  .refine(
    (row) => !row.fine_effective_date || row.fine_effective_date >= row.due_date,
    { message: 'Fine cannot start before the due date', path: ['fine_effective_date'] },
  )
  // Not a DB rule, but a fine amount with no start date never applies, which is
  // silently wrong rather than loudly wrong.
  .refine(
    (row) => !(row.fine_amount > 0 && !row.fine_effective_date),
    { message: 'Set a fine-effective date, or clear the fine amount', path: ['fine_effective_date'] },
  );

export const schoolTermCalendarFormSchema = z
  .object({
    institution_id: uuid,
    academic_year_id: uuid,
    terms: z.array(schoolTermCalendarRowSchema).min(1, 'Define at least one term'),
  })
  // DB: UNIQUE (institution_id, academic_year_id, term_number)
  .refine(
    (v) => new Set(v.terms.map((t) => t.term_number)).size === v.terms.length,
    { message: 'Each term number may appear only once', path: ['terms'] },
  )
  // Terms must run forward in time, or generation would produce bills whose due
  // dates go backwards across the year.
  .refine(
    (v) => {
      const sorted = [...v.terms].sort((a, b) => a.term_number - b.term_number);
      return sorted.every((t, i) => i === 0 || t.due_date >= sorted[i - 1].due_date);
    },
    { message: 'Each term must be due on or after the previous term', path: ['terms'] },
  );

// ---------------------------------------------------------------------------
// Concessions
// ---------------------------------------------------------------------------

export const schoolConcessionModeSchema = z.enum(['percent', 'flat']);

export const createSchoolFeeConcessionSchemeSchema = z
  .object({
    institution_id: uuid,
    code: z
      .string()
      .trim()
      .min(1, 'Code is required')
      .max(50)
      .regex(/^[A-Z0-9_]+$/, 'Use uppercase letters, numbers and underscores only'),
    name: z.string().trim().min(1, 'Name is required').max(200),
    mode: schoolConcessionModeSchema,
    value: amountSchema,
    applies_to_all_heads: z.boolean().optional().default(false),
    is_active: z.boolean().optional().default(true),
    notes: z.string().trim().max(2000).nullish(),
    head_ids: z.array(uuid).optional().default([]),
  })
  // DB: CONSTRAINT school_fee_concession_percent_range
  .refine((v) => v.mode !== 'percent' || v.value <= 100, {
    message: 'A percentage concession cannot exceed 100%',
    path: ['value'],
  })
  // Not a DB rule: a targeted scheme with no heads would silently discount
  // nothing, which reads as a broken concession rather than a configuration gap.
  .refine((v) => v.applies_to_all_heads || v.head_ids.length > 0, {
    message: 'Choose at least one fee head, or switch on "applies to all heads"',
    path: ['head_ids'],
  });

export const createSchoolFeeConcessionAssignmentSchema = z.object({
  learner_id: uuid,
  scheme_id: uuid,
  academic_year_id: uuid,
  notes: z.string().trim().max(2000).nullish(),
});

// ---------------------------------------------------------------------------
// Inferred form types
// ---------------------------------------------------------------------------

export type SchoolFeePlanFormValues = z.infer<typeof createSchoolFeePlanSchema>;
export type SchoolTermCalendarFormValues = z.infer<typeof schoolTermCalendarFormSchema>;
export type SchoolFeeConcessionSchemeFormValues = z.infer<typeof createSchoolFeeConcessionSchemeSchema>;
export type SchoolFeeConcessionAssignmentFormValues = z.infer<
  typeof createSchoolFeeConcessionAssignmentSchema
>;
