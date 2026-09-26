// Regression: changing an enquiry's institution in the edit form must re-mint
// its application_id ("JKKN ID") under the new institution's counselling code.
// The DB trigger set_learner_application_id only re-mints an EMPTY id, so the
// service has to clear it when institution_id changes — otherwise a learner
// moved to CAS keeps JKKN-JS-3 (BUG-004341, BUG-004285, BUG-004023).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { LearnerProfileService } from '../learner-profile-service';

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: vi.fn() }));
vi.mock('@/lib/utils/activity-logger-client', () => ({
  logActivityClient: vi.fn(),
  LearnerActivityTemplates: {
    learnerProfileUpdated: () => ({
      actionType: 'update',
      resourceType: 'learner',
      description: 'updated',
      sub_type: 'profile',
    }),
  },
}));
vi.mock('@/lib/utils/track-usage', () => ({ trackUsage: vi.fn() }));
vi.mock('@/lib/services/school-defaults-service', () => ({
  SchoolDefaultsService: {
    enforceSchoolDefaults: vi.fn(async (_i: string, _e: string, dto: Record<string, unknown>) => dto),
  },
}));

const OLD_INST = '11111111-1111-4111-8111-111111111111';
const NEW_INST = '22222222-2222-4222-8222-222222222222';

function fakeSupabase(savedInstitutionId: string) {
  const updates: Array<Record<string, unknown>> = [];
  const from = vi.fn((table: string) => {
    let payload: Record<string, unknown> | null = null;
    const b: any = {
      select: () => b,
      eq: () => b,
      neq: () => b,
      update: (p: Record<string, unknown>) => {
        payload = p;
        if (table === 'learners_profiles') updates.push(p);
        return b;
      },
      maybeSingle: async () =>
        table === 'learners_profiles'
          ? { data: { institution_id: savedInstitutionId }, error: null }
          : { data: null, error: null },
      single: async () => {
        if (table === 'institutions') return { data: { id: 'i', entity_type: 'college' }, error: null };
        if (payload) return { data: { id: 'L1', ...payload, is_profile_complete: false }, error: null };
        return { data: { institution_id: savedInstitutionId }, error: null };
      },
    };
    return b;
  });
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    from,
  };
  (createClientSupabaseClient as any).mockReturnValue(supabase);
  return updates;
}

describe('LearnerProfileService.updateLearnerProfile — institution change', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(LearnerProfileService as any, 'calculateProfileCompleteness').mockReturnValue(false);
    vi.spyOn(LearnerProfileService as any, 'checkAndAutoActivate').mockImplementation(
      async (_id: unknown, profile: unknown) => ({ profile }),
    );
    vi.spyOn(LearnerProfileService as any, 'syncProfileStatus').mockResolvedValue(undefined);
  });

  it('clears application_id so the trigger re-mints it when the institution changes', async () => {
    const updates = fakeSupabase(OLD_INST);
    await LearnerProfileService.updateLearnerProfile('L1', { institution_id: NEW_INST } as any);
    expect(updates[0]).toHaveProperty('application_id', null);
    expect(updates[0]).toHaveProperty('institution_id', NEW_INST);
  });

  it('leaves application_id alone when the institution is unchanged', async () => {
    const updates = fakeSupabase(OLD_INST);
    await LearnerProfileService.updateLearnerProfile('L1', { institution_id: OLD_INST } as any);
    expect(updates[0]).not.toHaveProperty('application_id');
  });

  it('leaves application_id alone when the update does not touch institution_id', async () => {
    const updates = fakeSupabase(OLD_INST);
    await LearnerProfileService.updateLearnerProfile('L1', { first_name: 'X' } as any);
    expect(updates[0]).not.toHaveProperty('application_id');
  });
});
