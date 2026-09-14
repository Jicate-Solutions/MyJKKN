/**
 * Bulk approve / reject rules for the Leave / Short Time Off approval tables
 * (2026-09-11): a bulk button only sends what the database will accept.
 */

import { describe, expect, it } from 'vitest';

import {
  describeApprovalSkipped, splitBulkApprove, splitBulkReject,
} from '@/app/(routes)/hr/leave/_components/approval-bulk';
import type { HRLeaveApprovalQueueRow } from '@/types/hr';

const row = (id: string, p: Partial<HRLeaveApprovalQueueRow> = {}) =>
  ({
    id, status: 'pending', can_decide: true, biometric_gap_from: null,
    chain_length: 1, current_step: 0, step_is_final: true, ...p,
  }) as HRLeaveApprovalQueueRow;

const rows = [
  row('ok'),
  row('escalated', { status: 'escalated' }),
  row('approved', { status: 'approved', can_decide: false }),
  row('withdrawn', { status: 'withdrawn', can_decide: false }),
  row('own', { can_decide: false }),
  row('gap-final', { biometric_gap_from: '2026-09-01' }),
  // A review step writes no attendance stamp, so the biometric gate skips it.
  row('gap-review', { biometric_gap_from: '2026-09-01', chain_length: 2, step_is_final: false }),
];

describe('splitBulkApprove', () => {
  it('approves open, decidable rows; a missing biometric blocks only a final approval', () => {
    const s = splitBulkApprove(rows);
    expect(s.eligible.map((r) => r.id)).toEqual(['ok', 'escalated', 'gap-review']);
    expect(s.skipped).toEqual({ decided: 2, notYours: 1, biometric: 1 });
    expect(describeApprovalSkipped(s.skipped)).toBe(
      '2 already decided, 1 you cannot decide, 1 missing biometric'
    );
  });
});

describe('splitBulkReject', () => {
  it('rejects every open, decidable row — a missing biometric does not block it', () => {
    const s = splitBulkReject(rows);
    expect(s.eligible.map((r) => r.id)).toEqual(['ok', 'escalated', 'gap-final', 'gap-review']);
    expect(s.skipped).toEqual({ decided: 2, notYours: 1, biometric: 0 });
  });

  it('describes nothing when nothing was left out', () => {
    expect(describeApprovalSkipped(splitBulkReject([row('a')]).skipped)).toBe('');
  });
});
