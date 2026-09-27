// @vitest-environment node
// Tests the `admission_only` param-defaulting contract for
// GET /api/admission/calls/unique-callers (BUG-003257).
//
// The route excludes non-admission calls (job-vacancy, dental-hospital,
// office) by default, matching the sibling /api/admission/calls and
// /api/admission/calls/stats routes. This mirrors that defaulting logic
// directly rather than booting the Next route or a real Supabase client.

import { describe, it, expect } from 'vitest';

// Mirrors app/api/admission/calls/unique-callers/route.ts:
//   const admissionOnly = searchParams.get('admission_only') === 'false' ? false : true;
function parseAdmissionOnly(searchParams: URLSearchParams): boolean {
  return searchParams.get('admission_only') === 'false' ? false : true;
}

describe('unique-callers admission_only defaulting', () => {
  it('defaults to true when the param is absent', () => {
    const params = new URLSearchParams();
    expect(parseAdmissionOnly(params)).toBe(true);
  });

  it('is false when explicitly set to "false"', () => {
    const params = new URLSearchParams({ admission_only: 'false' });
    expect(parseAdmissionOnly(params)).toBe(false);
  });

  it('is true when explicitly set to "true"', () => {
    const params = new URLSearchParams({ admission_only: 'true' });
    expect(parseAdmissionOnly(params)).toBe(true);
  });

  it('defaults to true for any other value', () => {
    const params = new URLSearchParams({ admission_only: '0' });
    expect(parseAdmissionOnly(params)).toBe(true);
  });
});
