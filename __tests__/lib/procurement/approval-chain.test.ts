import { describe, expect, it } from 'vitest';
import { chainLine, currentStep, latestRound, isMyTurn } from '@/lib/procurement/approval-chain';
import type { RequestApproval } from '@/types/procurement';

let n = 0;
const row = (p: Partial<RequestApproval>): RequestApproval => ({
  id: `s${++n}`,
  request_id: 'r',
  stage: 'request',
  round: 1,
  step_order: 1,
  label: 'HOD',
  approver_kind: 'hod',
  approver_ids: ['hod-1'],
  status: 'waiting',
  acted_by: null,
  acted_at: null,
  on_behalf: false,
  remarks: null,
  ...p,
});

describe('approval chain helpers', () => {
  const rows = [
    row({ round: 1, step_order: 1, status: 'returned' }),
    row({ round: 2, step_order: 1, status: 'approved' }),
    row({ round: 2, step_order: 2, label: 'Principal', approver_ids: ['p-1'], status: 'pending' }),
    row({ round: 2, step_order: 3, label: 'CAO', approver_ids: ['c-1'], status: 'waiting' }),
  ];

  it('keeps only the latest round, in step order', () => {
    expect(latestRound(rows).map((r) => r.label)).toEqual(['HOD', 'Principal', 'CAO']);
  });

  it('finds the step waiting now', () => {
    expect(currentStep(rows)?.label).toBe('Principal');
  });

  it('says where the request is', () => {
    expect(chainLine(rows)).toBe('Step 2 of 3 — Principal');
  });

  it('knows whose turn it is', () => {
    expect(isMyTurn(rows, 'p-1')).toBe(true);
    expect(isMyTurn(rows, 'hod-1')).toBe(false);
    expect(isMyTurn(rows, undefined)).toBe(false);
  });

  it('is empty for a request without a chain', () => {
    expect(currentStep([])).toBeNull();
    expect(chainLine([])).toBe('');
    expect(latestRound([])).toEqual([]);
  });
});
