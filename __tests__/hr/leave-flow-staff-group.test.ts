/**
 * Which approval flow governs a leave request — the Teaching / Non-teaching
 * precedence.
 *
 * WHAT THIS PROTECTS. pickLeaveFlow is a deliberate mirror of SQL
 * `fn_hr_leave_pick_flow_for_group` (migration 20261225090000). Postgres decides
 * the flow for a real request at apply time and on re-route; this decides what
 * the editor shows the administrator. If the two drift, the screen shows one
 * chain and the request runs another — and because the chain is frozen onto the
 * application, the wrong approvers look exactly like the configured ones.
 *
 * The cases below are the four precedence levels, plus the two that matter most
 * in practice: an unknown group must never land on a group flow, and with no
 * group flows saved the answer must be identical to the pre-2026-09-19
 * behaviour (type match, else catch-all).
 *
 * Run: npx vitest run __tests__/hr/leave-flow-staff-group.test.ts
 */

import { describe, expect, it } from 'vitest';

import { pickLeaveFlow } from '@/lib/hr/leave/approval-chain';
import type { LeaveStaffGroup } from '@/types/hr-leave-types';

const CL = 'casual-leave-id';
const ML = 'medical-leave-id';

type Flow = { id: string; conditions: { leave_type_id?: string; staff_group?: LeaveStaffGroup } | null };

const flow = (
  id: string,
  leave_type_id?: string,
  staff_group?: LeaveStaffGroup,
): Flow => ({
  id,
  conditions: {
    ...(leave_type_id ? { leave_type_id } : {}),
    ...(staff_group ? { staff_group } : {}),
  },
});

const catchAll = flow('catch-all');
const clAll = flow('cl-all', CL);
const clTeaching = flow('cl-teaching', CL, 'teaching');
const clNonTeaching = flow('cl-non-teaching', CL, 'non_teaching');
const catchAllNonTeaching = flow('catch-all-non-teaching', undefined, 'non_teaching');

describe('pickLeaveFlow — the four precedence levels', () => {
  const all = [catchAll, clAll, clTeaching, clNonTeaching, catchAllNonTeaching];

  it('1. leave type + group beats everything', () => {
    expect(pickLeaveFlow(all, CL, 'non_teaching')?.id).toBe('cl-non-teaching');
    expect(pickLeaveFlow(all, CL, 'teaching')?.id).toBe('cl-teaching');
  });

  it('2. leave type + all team members, when the group has no flow of its own', () => {
    expect(pickLeaveFlow([catchAll, clAll, clTeaching], CL, 'non_teaching')?.id).toBe('cl-all');
  });

  it('3. catch-all + group, when the type has no flow at all', () => {
    expect(pickLeaveFlow(all, ML, 'non_teaching')?.id).toBe('catch-all-non-teaching');
  });

  it('4. catch-all + all team members is the last resort', () => {
    expect(pickLeaveFlow(all, ML, 'teaching')?.id).toBe('catch-all');
  });
});

describe('pickLeaveFlow — the safe edges', () => {
  it('an unknown group never lands on a group flow', () => {
    // A member of staff with no category must not be routed to the
    // non-teaching approver just because that flow happens to exist.
    expect(pickLeaveFlow([catchAll, clTeaching, clNonTeaching], CL, null)?.id).toBe('catch-all');
  });

  it('a group flow for the OTHER group is never picked', () => {
    expect(pickLeaveFlow([clTeaching], CL, 'non_teaching')).toBeNull();
  });

  it('a flow for another leave type is never picked', () => {
    expect(pickLeaveFlow([flow('ml-all', ML)], CL, 'teaching')).toBeNull();
  });

  it('no flows at all resolves to null, not a throw', () => {
    expect(pickLeaveFlow([], CL, 'teaching')).toBeNull();
  });

  it('a null conditions row is treated as the catch-all', () => {
    expect(pickLeaveFlow([{ id: 'legacy', conditions: null }], CL, 'teaching')?.id).toBe('legacy');
  });
});

describe('pickLeaveFlow — parity with the pre-group behaviour', () => {
  // Every institution is in this state today: 54 type-specific flows, 14
  // catch-alls, zero group flows. The answer must not move.
  const legacy = [catchAll, clAll, flow('ml-all', ML)];

  it('a type with its own flow uses it, for either group', () => {
    for (const g of ['teaching', 'non_teaching', null] as const) {
      expect(pickLeaveFlow(legacy, CL, g)?.id).toBe('cl-all');
    }
  });

  it('a type with no flow inherits the catch-all, for either group', () => {
    for (const g of ['teaching', 'non_teaching', null] as const) {
      expect(pickLeaveFlow(legacy, 'unknown-type', g)?.id).toBe('catch-all');
    }
  });
});
