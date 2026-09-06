import { describe, it, expect } from 'vitest';
import {
  GRIEVANCE_DESCRIPTION_MIN_LENGTH,
  describeCheckConstraintViolation,
  validateGrievanceDescription,
} from '../grievance-ticket';

// The exact refusal Postgres sent back in BUG-01.
const descriptionCheckError = {
  code: '23514',
  message:
    'new row for relation "grievance_tickets" violates check constraint "grievance_tickets_description_check"',
  details: 'Failing row contains (…).',
};

describe('validateGrievanceDescription', () => {
  it('refuses the entry that caused BUG-01', () => {
    expect(validateGrievanceDescription('Testing')).toContain(
      String(GRIEVANCE_DESCRIPTION_MIN_LENGTH)
    );
  });

  it('accepts an entry that meets the length', () => {
    expect(validateGrievanceDescription('Lift is broken')).toBeNull();
  });

  it('counts code points the way char_length() does, not UTF-16 units', () => {
    // Ten emoji are 20 UTF-16 units but only 10 characters to Postgres, so both
    // sides must agree that this passes.
    expect(validateGrievanceDescription('🙂'.repeat(10))).toBeNull();
    // Nine emoji are 18 UTF-16 units — String.length alone would wrongly accept.
    expect(validateGrievanceDescription('🙂'.repeat(9))).not.toBeNull();
  });
});

describe('describeCheckConstraintViolation', () => {
  it('ignores anything that is not a check-constraint violation', () => {
    expect(describeCheckConstraintViolation(null)).toBeNull();
    expect(
      describeCheckConstraintViolation({ code: '42501', message: 'row-level security' })
    ).toBeNull();
  });

  it('names the description field and never echoes the constraint', () => {
    const refusal = describeCheckConstraintViolation(descriptionCheckError, {
      description: 'Testing',
    });
    expect(refusal).not.toBeNull();
    expect(refusal!.success).toBe(false);
    expect(refusal!.field).toBe('description');
    expect(refusal!.error).not.toContain('grievance_tickets_description_check');
    expect(refusal!.error).not.toContain('check constraint');
  });

  it('falls back to general wording for a constraint it does not know', () => {
    const refusal = describeCheckConstraintViolation({
      code: '23514',
      message: 'violates check constraint "grievance_tickets_some_future_check"',
    });
    expect(refusal!.field).toBeNull();
    expect(refusal!.error).not.toContain('grievance_tickets_some_future_check');
  });

  it('does not repeat the length rule to someone who already met it', () => {
    // Drift guard: if the database rule moves, "at least 10 characters" would be
    // a dead end for an entry that is already longer than that.
    const refusal = describeCheckConstraintViolation(descriptionCheckError, {
      description: 'This description is comfortably longer than the mirrored rule.',
    });
    expect(refusal!.field).toBeNull();
    expect(refusal!.error).not.toContain(String(GRIEVANCE_DESCRIPTION_MIN_LENGTH));
  });
});
