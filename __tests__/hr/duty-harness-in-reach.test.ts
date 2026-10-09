/**
 * Follow-up to the #4152 review, finding 4: who an HR item reaches by role.
 * An item with no college must not go to every college's approvers.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createServiceRoleClient: () => ({}) }));

import { inReach } from '@/lib/services/hr/duty-harness/db-deps';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const holders = [
  { userId: 'approver-a', scopeAll: false, institutionId: A },
  { userId: 'approver-b', scopeAll: false, institutionId: B },
  { userId: 'approver-all', scopeAll: true, institutionId: A }
];

describe('inReach — which role holders an item reaches', () => {
  it('an item of a college reaches that college and the every-college holders', () => {
    expect(inReach(holders, A, false)).toEqual(['approver-a', 'approver-all']);
    expect(inReach(holders, B, false)).toEqual(['approver-all', 'approver-b']);
  });

  it('an item with no college reaches only the every-college holders, not every approver', () => {
    expect(inReach(holders, null, false)).toEqual(['approver-all']);
    expect(inReach(holders.slice(0, 2), null, false)).toEqual([]);
  });

  it("'any' scope (recruitment steps) still reaches every holder", () => {
    expect(inReach(holders, null, true)).toEqual(['approver-a', 'approver-all', 'approver-b']);
  });
});
