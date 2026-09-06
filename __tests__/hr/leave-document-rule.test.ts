import { describe, it, expect } from 'vitest';
import {
  leaveDocumentRequirement,
  documentOutstanding,
} from '@/lib/hr/leave-document-rule';

// What these tests cover: the ONE predicate the Apply Leave drawer and
// LeaveService.createApplication both call. They must agree, because the two
// disagreeing has a specific, nasty shape — a drawer that does not ask for a
// file the server then demands is a dead end the applicant cannot escape from,
// and no error message tells them what to do.
//
// The live policies this encodes:
//   On-Duty        (true,  null) — always required
//   Half Pay Leave (true,  3)    — required only past 3 days
//   Casual Leave   (false, null) — never asked for

const ALWAYS = { requires_documents: true, document_required_after_days: null };
const AFTER_3 = { requires_documents: true, document_required_after_days: 3 };
const NEVER = { requires_documents: false, document_required_after_days: null };

describe('leaveDocumentRequirement — a type that never wants one', () => {
  it('asks for nothing and offers nothing', () => {
    const r = leaveDocumentRequirement(NEVER, 5, false);
    expect(r).toEqual({ required: false, optional: false, reason: null });
  });

  it('treats a missing policy the same as one that wants nothing', () => {
    // The drawer passes null before a leave type is chosen.
    expect(leaveDocumentRequirement(null, 1, false).required).toBe(false);
    expect(leaveDocumentRequirement(undefined, 1, false).optional).toBe(false);
  });

  it('is not swayed by the emergency flag', () => {
    expect(leaveDocumentRequirement(NEVER, 5, true).optional).toBe(false);
  });
});

describe('leaveDocumentRequirement — On-Duty, always required', () => {
  it('requires one for a single day', () => {
    const r = leaveDocumentRequirement(ALWAYS, 1, false);
    expect(r.required).toBe(true);
    expect(r.reason).toMatch(/requires a supporting document/);
  });

  it('requires one for a half day', () => {
    expect(leaveDocumentRequirement(ALWAYS, 0.5, false).required).toBe(true);
  });
});

describe('leaveDocumentRequirement — a threshold, e.g. Half Pay Leave past 3 days', () => {
  it('does NOT require one at or under the threshold, but still offers it', () => {
    for (const days of [1, 2, 3]) {
      const r = leaveDocumentRequirement(AFTER_3, days, false);
      expect(r.required, `${days} days`).toBe(false);
      // optional, not absent: the applicant may have the certificate already,
      // and hiding the field would stop them attaching it.
      expect(r.optional, `${days} days`).toBe(true);
      expect(r.reason).toMatch(/only required past 3 days/);
    }
  });

  it('requires one the moment the request passes it', () => {
    const r = leaveDocumentRequirement(AFTER_3, 3.5, false);
    expect(r.required).toBe(true);
    expect(r.reason).toMatch(/longer than 3 days/);
  });

  it('says "1 day" not "1 days"', () => {
    const r = leaveDocumentRequirement(
      { requires_documents: true, document_required_after_days: 1 }, 1, false,
    );
    expect(r.reason).toMatch(/past 1 day\./);
  });
});

describe('leaveDocumentRequirement — emergency defers, it does not exempt', () => {
  it('lets an emergency request through without the document', () => {
    // The drawer has always promised "supporting documents required within
    // 48h". Blocking here would make emergency leave impossible to file in an
    // emergency, which is the one situation the flag exists for.
    const r = leaveDocumentRequirement(ALWAYS, 5, true);
    expect(r.required).toBe(false);
    expect(r.optional).toBe(true);
    expect(r.reason).toMatch(/within 48 hours/);
  });

  it('still requires it when the request is NOT an emergency', () => {
    expect(leaveDocumentRequirement(ALWAYS, 5, false).required).toBe(true);
  });

  it('does not manufacture a requirement below the threshold', () => {
    const r = leaveDocumentRequirement(AFTER_3, 2, true);
    expect(r.required).toBe(false);
    // The threshold reason wins — it is the more specific truth, and telling
    // someone about a 48-hour deadline for a document they never owed would be
    // worse than saying nothing.
    expect(r.reason).toMatch(/only required past 3 days/);
  });
});

describe('documentOutstanding — what approvers get warned about', () => {
  it('flags an emergency filed with nothing attached', () => {
    expect(documentOutstanding(ALWAYS, 5, true, 0)).toBe(true);
  });

  it('clears once anything is attached', () => {
    expect(documentOutstanding(ALWAYS, 5, true, 1)).toBe(false);
  });

  it('never flags a type that wanted no document', () => {
    expect(documentOutstanding(NEVER, 5, true, 0)).toBe(false);
  });

  it('never flags a request under the threshold', () => {
    expect(documentOutstanding(AFTER_3, 2, true, 0)).toBe(false);
  });

  it('never flags a non-emergency — it could not have been submitted empty', () => {
    expect(documentOutstanding(ALWAYS, 5, false, 0)).toBe(false);
  });
});

describe('the drawer and the server cannot drift', () => {
  it('agrees on every combination that matters', () => {
    // Exhaustive over the live shapes. If a future edit makes the drawer and
    // the service diverge, it has to change this table first.
    const cases: Array<[typeof ALWAYS, number, boolean, boolean]> = [
      [ALWAYS,  0.5, false, true],
      [ALWAYS,  1,   false, true],
      [ALWAYS,  10,  false, true],
      [ALWAYS,  10,  true,  false],
      [AFTER_3, 3,   false, false],
      [AFTER_3, 4,   false, true],
      [AFTER_3, 4,   true,  false],
      [NEVER,   99,  false, false],
    ];
    for (const [policy, days, emergency, expected] of cases) {
      expect(
        leaveDocumentRequirement(policy, days, emergency).required,
        `${JSON.stringify(policy)} / ${days}d / emergency=${emergency}`,
      ).toBe(expected);
    }
  });
});
