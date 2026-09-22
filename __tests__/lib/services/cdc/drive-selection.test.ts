import { describe, expect, it } from 'vitest';
import { canRecordDecisions, summarizeSelection } from '@/lib/services/cdc/drive-selection';

const FINAL = '2026-09-19T10:00:00.000Z';

describe('canRecordDecisions', () => {
  it('needs a finalized participant list', () => {
    const r = canRecordDecisions({ status: 'attendance_day', participants_finalized_at: null });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/finalize/i);
  });

  it('is open from participants finalized until results, and shut once closed', () => {
    for (const status of ['eligibility_locked', 'attendance_day', 'results_announced'] as const) {
      expect(canRecordDecisions({ status, participants_finalized_at: FINAL }).ok).toBe(true);
    }
    expect(canRecordDecisions({ status: 'closed', participants_finalized_at: FINAL })).toMatchObject({ ok: false, reason: expect.stringMatching(/closed/i) });
    expect(canRecordDecisions({ status: 'cancelled', participants_finalized_at: FINAL }).ok).toBe(false);
    expect(canRecordDecisions({ status: 'willingness_open', participants_finalized_at: FINAL }).ok).toBe(false);
  });
});

describe('summarizeSelection', () => {
  it('counts decisions, attendance and offer-letter coverage for selected learners only', () => {
    const offer = { id: 'd1', document_type: 'offer_letter' as const, file_name: 'x.pdf', version: 1, status: 'uploaded', uploaded_at: FINAL };
    const joining = { ...offer, id: 'd2', document_type: 'joining_letter' as const };
    const s = summarizeSelection([
      { decision: 'selected', attendance_status: 'present', documents: [offer] },
      { decision: 'selected', attendance_status: 'late', documents: [joining] }, // selected, but no OFFER letter yet
      { decision: 'waitlisted', attendance_status: 'present', documents: [] },
      { decision: 'rejected', attendance_status: 'present', documents: [offer] }, // an offer on a rejected row is not "offer uploaded"
      { decision: null, attendance_status: 'absent', documents: [] },
    ]);
    expect(s).toEqual({
      participants: 5,
      attended: 4,
      selected: 2,
      waitlisted: 1,
      rejected: 1,
      hold: 0,
      undecided: 1,
      offer_uploaded: 1,
      offer_pending: 1,
    });
  });
});
