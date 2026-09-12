import { describe, it, expect } from 'vitest';
import { leaveDocumentRequirement } from '@/lib/hr/leave-document-rule';

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
//
// THE EMERGENCY DEFERRAL IS GONE (2026-09-12). The rule used to take a third
// argument and let an "emergency" request be filed without the document on the
// promise that one followed within 48 hours. HR removed the feature, so there is
// no longer anything that can excuse a missing document, and `documentOutstanding`
// — whose only reachable state was "an emergency filed empty" — went with it.

const ALWAYS = { requires_documents: true, document_required_after_days: null };
const AFTER_3 = { requires_documents: true, document_required_after_days: 3 };
const NEVER = { requires_documents: false, document_required_after_days: null };

describe('leaveDocumentRequirement — a type that never wants one', () => {
  it('asks for nothing and offers nothing', () => {
    const r = leaveDocumentRequirement(NEVER, 5);
    expect(r).toEqual({ required: false, optional: false, reason: null });
  });

  it('treats a missing policy the same as one that wants nothing', () => {
    // The drawer passes null before a leave type is chosen.
    expect(leaveDocumentRequirement(null, 1).required).toBe(false);
    expect(leaveDocumentRequirement(undefined, 1).optional).toBe(false);
  });
});

describe('leaveDocumentRequirement — On-Duty, always required', () => {
  it('requires one for a single day', () => {
    const r = leaveDocumentRequirement(ALWAYS, 1);
    expect(r.required).toBe(true);
    expect(r.reason).toMatch(/requires a supporting document/);
  });

  it('requires one for a half day', () => {
    expect(leaveDocumentRequirement(ALWAYS, 0.5).required).toBe(true);
  });

  it('requires one however long the request is — nothing defers it any more', () => {
    // The regression this pins: On-Duty and Clinical Duty are (true, null), and
    // 47 requests were filed empty ONLY because the emergency flag deferred the
    // document. With that gone, every length must come back required — a
    // re-introduced escape hatch would silently reopen that hole.
    for (const days of [0.5, 1, 3, 10, 365]) {
      expect(leaveDocumentRequirement(ALWAYS, days).required, `${days} days`).toBe(true);
      expect(leaveDocumentRequirement(ALWAYS, days).optional, `${days} days`).toBe(false);
    }
  });
});

describe('leaveDocumentRequirement — a threshold, e.g. Half Pay Leave past 3 days', () => {
  it('does NOT require one at or under the threshold, but still offers it', () => {
    for (const days of [1, 2, 3]) {
      const r = leaveDocumentRequirement(AFTER_3, days);
      expect(r.required, `${days} days`).toBe(false);
      // optional, not absent: the applicant may have the certificate already,
      // and hiding the field would stop them attaching it.
      expect(r.optional, `${days} days`).toBe(true);
      expect(r.reason).toMatch(/only required past 3 days/);
    }
  });

  it('requires one the moment the request passes it', () => {
    const r = leaveDocumentRequirement(AFTER_3, 3.5);
    expect(r.required).toBe(true);
    expect(r.reason).toMatch(/longer than 3 days/);
  });

  it('says "1 day" not "1 days"', () => {
    const r = leaveDocumentRequirement(
      { requires_documents: true, document_required_after_days: 1 }, 1,
    );
    expect(r.reason).toMatch(/past 1 day\./);
  });
});

describe('the drawer and the server cannot drift', () => {
  it('agrees on every combination that matters', () => {
    // Exhaustive over the live shapes. If a future edit makes the drawer and
    // the service diverge, it has to change this table first.
    const cases: Array<[typeof ALWAYS, number, boolean]> = [
      [ALWAYS,  0.5, true],
      [ALWAYS,  1,   true],
      [ALWAYS,  10,  true],
      [AFTER_3, 3,   false],
      [AFTER_3, 4,   true],
      [NEVER,   99,  false],
    ];
    for (const [policy, days, expected] of cases) {
      expect(
        leaveDocumentRequirement(policy, days).required,
        `${JSON.stringify(policy)} / ${days}d`,
      ).toBe(expected);
    }
  });
});
