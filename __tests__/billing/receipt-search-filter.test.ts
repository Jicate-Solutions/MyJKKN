import { describe, it, expect } from 'vitest';
import { sanitizeSearch } from '@/lib/config/pagination';
import {
  buildLearnerSearchOr,
  buildReceiptSearchOr,
} from '@/app/(routes)/billing/receipts/_data/get-receipts';

// The two pure halves of the receipt search. The learner half resolves ids,
// the receipt half OR's them in alongside the parent columns — PostgREST
// rejects an embedded column inside a top-level or=(...), so the search cannot
// be expressed as one dotted-path filter.

describe('buildLearnerSearchOr', () => {
  it('covers first name, last name and roll number', () => {
    expect(buildLearnerSearchOr('aadhi')).toBe(
      'first_name.ilike.%aadhi%,last_name.ilike.%aadhi%,roll_number.ilike.%aadhi%'
    );
  });
});

describe('buildReceiptSearchOr', () => {
  it('keeps the original receipt-number and payer predicates', () => {
    expect(buildReceiptSearchOr('RCP-2026', [])).toBe(
      'receipt_number.ilike.%RCP-2026%,payer_name.ilike.%RCP-2026%'
    );
  });

  it('OR-s in the resolved learners, so a student match widens the result', () => {
    expect(buildReceiptSearchOr('aadhi', ['id-1', 'id-2'])).toBe(
      'receipt_number.ilike.%aadhi%,payer_name.ilike.%aadhi%,student_id.in.(id-1,id-2)'
    );
  });

  it('omits the student clause entirely when no learner matched', () => {
    expect(buildReceiptSearchOr('zzz', [])).not.toContain('student_id');
  });
});

describe('sanitised terms cannot inject into the or=(...) grammar', () => {
  // `,` separates conditions, `(`/`)` group and `.` separates
  // column.operator.value — a raw term carrying any of them corrupts the filter.
  const hostile = 'a,payer_name.is.null),(b';

  it('leaves no PostgREST metacharacters in the learner filter', () => {
    const filter = buildLearnerSearchOr(sanitizeSearch(hostile));
    expect(filter.split(',')).toHaveLength(3);
    expect(filter).not.toContain('(');
    expect(filter).not.toContain(')');
    expect(filter).toBe(
      'first_name.ilike.%apayer_nameisnullb%,last_name.ilike.%apayer_nameisnullb%,roll_number.ilike.%apayer_nameisnullb%'
    );
  });

  it('leaves no PostgREST metacharacters in the receipt filter', () => {
    const filter = buildReceiptSearchOr(sanitizeSearch(hostile), []);
    expect(filter.split(',')).toHaveLength(2);
    expect(filter).not.toContain('(');
    expect(filter).not.toContain(')');
  });

  it('reduces an all-punctuation term to nothing, so it is treated as no search', () => {
    expect(sanitizeSearch('(),.*')).toBe('');
  });
});
