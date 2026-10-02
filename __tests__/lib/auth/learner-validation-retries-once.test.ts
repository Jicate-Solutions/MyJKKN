/**
 * StudentValidationService.validateStudentAccess — a momentary query failure
 * is retried once before 'database_error' is reported, and 'database_error'
 * stays distinct from a real lifecycle block (the proxy signs out only on the
 * latter).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let profileAnswers: Array<{ data: unknown; error: unknown }>;
let profileCalls = 0;
let lifecycleStatus = 'active';

vi.mock('@/lib/supabase/server', () => ({
  createServiceRoleClient: () => ({
    from(table: string) {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        maybeSingle: async () => {
          if (table === 'profiles') {
            const answer = profileAnswers[Math.min(profileCalls, profileAnswers.length - 1)];
            profileCalls += 1;
            return answer;
          }
          return {
            data: { id: 'l1', lifecycle_status: lifecycleStatus, first_name: 'A', last_name: 'B', roll_number: 'R1' },
            error: null,
          };
        },
      };
      return builder;
    },
  }),
}));

const PROFILE = { data: { learner_id: 'l1', role: 'student', email: 'a@jkkn.ac.in', full_name: 'A B' }, error: null };
const FAILED = { data: null, error: { code: '57014', message: 'statement timeout' } };

beforeEach(() => {
  profileCalls = 0;
  lifecycleStatus = 'active';
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

async function validate() {
  const { StudentValidationService } = await import('@/lib/services/auth/student-validation-service');
  return StudentValidationService.validateStudentAccess('user-1', 0);
}

describe('validateStudentAccess — one retry on a failed read', () => {
  it('a single failed read is absorbed by the retry', async () => {
    profileAnswers = [FAILED, PROFILE];
    const result = await validate();
    expect(result.allowed).toBe(true);
    expect(profileCalls).toBe(2);
  });

  it('two failed reads report database_error (not a lifecycle block)', async () => {
    profileAnswers = [FAILED];
    const result = await validate();
    expect(result.reason).toBe('database_error');
    expect(result.accessTier).toBeUndefined();
    expect(profileCalls).toBe(2);
  });

  it('a real lifecycle block is answered on the first read, without a retry', async () => {
    profileAnswers = [PROFILE];
    lifecycleStatus = 'exited';
    const result = await validate();
    expect(result).toMatchObject({ allowed: false, accessTier: 'none', reason: 'student_exited' });
    expect(profileCalls).toBe(1);
  });
});
