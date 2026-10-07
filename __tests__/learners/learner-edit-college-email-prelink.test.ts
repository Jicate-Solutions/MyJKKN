// The single learner edit (LearnerProfileService.updateLearnerProfile) pre-links
// a profile found by the new college email BEFORE it updates the learner, so
// the learner email sync would then see that profile as the learner's own and
// let a colleague's account become a learner's (2026-10-07). The email is
// checked first; a refused email throws and nothing is written.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  answer: null as string | null,
  stored: 'old.one@jkkn.ac.in' as string | null,
  writes: [] as Array<{ table: string; op: string }>,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'hr-1' } }, error: null }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      m.rpcCalls.push({ fn, args });
      if (fn === 'fn_learner_email_refusal') return { data: m.answer, error: null };
      return { data: false, error: null };
    },
    from: (table: string) => {
      let op = 'select';
      let cols = '';
      const chain: Record<string, unknown> = {
        select: (c: string) => { cols = c; return chain; }, eq: () => chain, neq: () => chain,
        update: () => { op = 'update'; m.writes.push({ table, op }); return chain; },
        maybeSingle: async () => ({
          data: table === 'profiles'
            ? { id: 'colleague', full_name: 'C', learner_id: null }
            : cols === 'college_email' ? { college_email: m.stored } : null,
          error: null,
        }),
        single: async () => ({ data: null, error: { message: 'stop here' } }),
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(res),
      };
      return chain;
    },
  }),
}));
vi.mock('@/lib/utils/activity-logger-client', () => ({ logActivityClient: async () => {}, LearnerActivityTemplates: {} }));
vi.mock('@/lib/utils/track-usage', () => ({ trackUsage: () => {} }));

import { LearnerProfileService } from '@/lib/services/learner-profile-service';

beforeEach(() => {
  m.answer = null;
  m.stored = 'old.one@jkkn.ac.in';
  m.writes = [];
  m.rpcCalls = [];
});

describe('LearnerProfileService.updateLearnerProfile and a colleague\'s email', () => {
  it('refuses before pre-linking: no profile and no learner row is written', async () => {
    m.answer = 'team_member';
    await expect(
      LearnerProfileService.updateLearnerProfile('learner-1', { college_email: 'plain@jkkn.ac.in' } as never)
    ).rejects.toThrow(/belongs to a team-member record/);
    expect(m.writes).toEqual([]);
    expect(m.rpcCalls).toContainEqual({ fn: 'fn_learner_email_refusal', args: { p_email: 'plain@jkkn.ac.in', p_learner_id: 'learner-1' } });
  });

  it('an unchanged college email (any case or spaces) is not asked about and links nobody: a phone-only edit of such a learner goes ahead', async () => {
    m.answer = 'refused'; // the email on file is, say, on a team-member record
    m.stored = 'plain@jkkn.ac.in';
    await LearnerProfileService.updateLearnerProfile('learner-1', {
      college_email: ' PLAIN@jkkn.ac.in', student_mobile: '9111111111',
    } as never).catch((e: Error) => { if (/college email|team-member/.test(e.message)) throw e; });
    expect(m.rpcCalls.some((c) => c.fn === 'fn_learner_email_refusal')).toBe(false);
    expect(m.writes.filter((w) => w.table === 'profiles')).toEqual([]);
  });

  it('an allowed email goes on to the pre-link as before', async () => {
    await LearnerProfileService.updateLearnerProfile('learner-1', { college_email: 'guest.one@gmail.com' } as never).catch(() => {});
    expect(m.writes.some((w) => w.table === 'profiles' && w.op === 'update')).toBe(true);
  });
});
