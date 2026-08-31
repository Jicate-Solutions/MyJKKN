// The threshold-basis setting: schema contract tests.
// Relationship assertions only — no live-data fixtures (they drift hourly).
import { describe, it, expect } from 'vitest';
import { admissionStatusFormSchema, THRESHOLD_BASIS_LABELS } from '@/types/admission-status';

const base = {
  scope: 'learner' as const,
  code: 'active',
  label: 'Active',
  color: '#22C55E',
  sort_order: 10,
};

describe('threshold_basis on the admission status form', () => {
  it('defaults to due-as-on-date — the 2026-08-11 ruling — when omitted', () => {
    const parsed = admissionStatusFormSchema.parse(base);
    expect(parsed.threshold_basis).toBe('due_to_date');
  });

  it('accepts every basis that has a UI label, and no others', () => {
    for (const basis of Object.keys(THRESHOLD_BASIS_LABELS)) {
      expect(admissionStatusFormSchema.parse({ ...base, threshold_basis: basis }).threshold_basis).toBe(basis);
    }
    expect(() =>
      admissionStatusFormSchema.parse({ ...base, threshold_basis: 'semester_wise' })
    ).toThrow(); // semester-wise is not offered: bills carry no semester column
  });

  it('keeps the existing learner-scope rule intact for the threshold percent', () => {
    expect(() =>
      admissionStatusFormSchema.parse({ ...base, scope: 'lead', fee_paid_threshold_percent: 60 })
    ).toThrow();
  });

  it('label map and schema enum stay in lockstep — a new basis without a label fails here', () => {
    // admissionStatusFormSchema is z.object({...}).refine().refine().refine(), and
    // every .refine() wraps the schema in a ZodEffects, which carries no .shape —
    // only the ZodObject underneath does. Reading .shape straight off the export
    // therefore yields undefined and this assertion died on a TypeError before it
    // ever compared anything. Peel the refinement wrappers off first, and keep
    // peeling, so adding a fourth cross-field rule does not silently break it again.
    let objectSchema: any = admissionStatusFormSchema;
    while (objectSchema?._def?.schema) objectSchema = objectSchema._def.schema;
    const enumValues = objectSchema.shape.threshold_basis._def.innerType.options as string[];
    expect([...enumValues].sort()).toEqual(Object.keys(THRESHOLD_BASIS_LABELS).sort());
  });
});
