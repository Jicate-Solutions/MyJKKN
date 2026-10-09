/**
 * Insta Solver complaint route — the "This complaint is about the Joint MD"
 * tick (Director ruling, 9 Oct 2026).
 *
 *   POST /api/instasolver/complaint
 *
 * What the route itself must do (the routing and hiding rules live in the
 * database and are proved by supabase/tests/grievance/run.sh):
 *   - pass the tick to the one insert path as aboutJointMd, only for a real
 *     boolean true;
 *   - never use the I8 "about my superior" route when the tick is set — that
 *     route's target IS the Joint MD — so the insert carries no assignee;
 *   - tell the filer whether it went to the Director or is held.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const JOINT_MD = '583f39e2-8334-4028-ba72-e4aadfdf7483';
const CATEGORY = 'c0000000-0000-0000-0000-000000000001';

const createLCIssue = vi.fn();
const resolveSuperiorRouteProfileId = vi.fn();
const confirmProfileExists = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u-learner' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: 'u-learner', role: 'student', full_name: 'L', email: 'l@x', institution_id: 'inst-a' },
            error: null,
          }),
        }),
      }),
    }),
  }),
  createServiceRoleClient: () => ({}),
}));

vi.mock('@/lib/services/learners-council/issue-service', () => ({
  LCIssueService: { createLCIssue: (...args: unknown[]) => createLCIssue(...args) },
}));

vi.mock('@/lib/validations/grievance-ticket', () => ({
  validateGrievanceDescription: () => null,
}));

vi.mock('@/lib/instasolver/complaint', () => ({
  INSTASOLVER_SOURCE: 'instasolver',
  confirmProfileExists: (...args: unknown[]) => confirmProfileExists(...args),
  mapRoleToRaisedByType: () => 'learner',
  mintAnonymousToken: () => 'tok',
  readComplaintCategories: async () => ({
    ok: true,
    anonymousColumnPresent: true,
    categories: [{ id: CATEGORY, name: 'Academic', allow_anonymous: true }],
  }),
  resolveSuperiorRouteProfileId: (...args: unknown[]) => resolveSuperiorRouteProfileId(...args),
  validateSubject: () => null,
}));

import { POST } from '@/app/api/instasolver/complaint/route';

function post(body: Record<string, unknown>) {
  return POST({ json: async () => body } as never);
}

const BASE = {
  category_id: CATEGORY,
  subject: 'The lab is locked',
  description: 'The lab has been locked every afternoon for two weeks.',
};

type CreateOptions = {
  aboutJointMd?: boolean;
  assignedTo?: string | null;
  extraMetadata?: Record<string, unknown>;
};
const lastOptions = () => createLCIssue.mock.calls.at(-1)?.[2] as CreateOptions;

beforeEach(() => {
  createLCIssue.mockReset();
  createLCIssue.mockResolvedValue({ ticket_number: 'GRV-1', assigned_to: 'the-director' });
  resolveSuperiorRouteProfileId.mockReset();
  resolveSuperiorRouteProfileId.mockResolvedValue(JOINT_MD);
  confirmProfileExists.mockReset();
  confirmProfileExists.mockResolvedValue(true);
});

describe('the "about the Joint MD" tick', () => {
  it('reaches the insert as aboutJointMd, with no assignee', async () => {
    const res = await post({ ...BASE, about_joint_md: true });
    expect(res.status).toBe(200);
    expect(createLCIssue).toHaveBeenCalledTimes(1);
    expect(lastOptions().aboutJointMd).toBe(true);
    expect(lastOptions().assignedTo ?? null).toBeNull();
  });

  it('never uses the I8 route (its target is the Joint MD), even with "about my HOD" ticked too', async () => {
    await post({ ...BASE, about_joint_md: true, about_superior: true });
    expect(resolveSuperiorRouteProfileId).not.toHaveBeenCalled();
    expect(lastOptions().assignedTo ?? null).toBeNull();
    expect(lastOptions().assignedTo).not.toBe(JOINT_MD);
    expect(lastOptions().extraMetadata?.about_superior).toBe(true);
    expect(lastOptions().extraMetadata?.routing).toBeUndefined();
    expect(lastOptions().aboutJointMd).toBe(true);
  });

  it('tells the filer it went to the Director', async () => {
    const res = await post({ ...BASE, about_joint_md: true });
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.notice).toBe('Sent straight to the Director. The Joint MD cannot see this complaint.');
  });

  it('tells the filer it is held when no Director is set', async () => {
    createLCIssue.mockResolvedValue({ ticket_number: 'GRV-2', assigned_to: null });
    const json = await (await post({ ...BASE, about_joint_md: true })).json();
    expect(json.notice).toBe('Saved and held for the Director. The Joint MD cannot see this complaint.');
  });

  it('only a real boolean true counts as ticked', async () => {
    for (const v of ['true', 1, 'yes', null]) {
      await post({ ...BASE, about_joint_md: v });
      expect(lastOptions().aboutJointMd).toBe(false);
    }
  });

  it('without the tick, "about my HOD" still goes to the I8 route as before', async () => {
    const json = await (await post({ ...BASE, about_superior: true })).json();
    expect(resolveSuperiorRouteProfileId).toHaveBeenCalledTimes(1);
    expect(lastOptions().assignedTo).toBe(JOINT_MD);
    expect(lastOptions().extraMetadata?.routing).toBe('superior_bypass');
    expect(lastOptions().aboutJointMd).toBe(false);
    expect(json.notice).toBeUndefined();
  });
});
