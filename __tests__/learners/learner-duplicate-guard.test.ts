import { describe, it, expect } from 'vitest';
import {
  learnerIdentityKey,
  findDuplicateLearners,
  describeDuplicateLearner,
} from '@/lib/services/learner-duplicate-guard';

const INSTITUTION = '5736d86f-5dab-4b7f-9aa1-b3bb1a2dd334';
const YEAR = '2206801d-8662-4776-b090-7db61fcce087';

// The exact pair that forked in production: same person, college emails differ by
// one transposed pair.
const original = {
  student_mobile: '9361247661',
  first_name: 'SASIDHARAN',
  last_name: 'K',
  admission_year_id: YEAR,
  institution_id: INSTITUTION,
};

/** Minimal PostgREST query-builder stand-in that records the filters it was given. */
function fakeSupabase(rows: any[]) {
  const calls: Record<string, any[]> = { eq: [], not: [], neq: [] };
  const builder: any = {
    select: () => builder,
    eq: (...args: any[]) => (calls.eq.push(args), builder),
    not: (...args: any[]) => (calls.not.push(args), builder),
    neq: (...args: any[]) => (calls.neq.push(args), builder),
    then: (resolve: any) => resolve({ data: rows, error: null }),
  };
  return { client: { from: () => builder } as any, calls };
}

describe('learnerIdentityKey', () => {
  it('matches the same person regardless of case and spacing', () => {
    expect(learnerIdentityKey(original)).toBe(
      learnerIdentityKey({ ...original, first_name: '  sasidharan ', last_name: 'k' })
    );
  });

  it('returns null while a draft is missing the mobile, so it is not judged yet', () => {
    expect(learnerIdentityKey({ ...original, student_mobile: '' })).toBeNull();
    expect(learnerIdentityKey({ ...original, admission_year_id: null })).toBeNull();
  });

  it('keeps different admission years apart (re-admission is legitimate)', () => {
    expect(learnerIdentityKey(original)).not.toBe(
      learnerIdentityKey({ ...original, admission_year_id: 'another-year' })
    );
  });
});

describe('findDuplicateLearners', () => {
  const duplicateRow = {
    id: 'fe654255-e567-4653-ac9c-427b2bdb0b47',
    application_id: 'JKKN-COP-1538',
    first_name: 'Sasidharan',
    last_name: 'K',
    college_email: 'sasidharank26bp@jkkn.ac.in',
    lifecycle_status: 'enquiry',
  };

  it('flags the same name on the same mobile, year and institution', async () => {
    const { client } = fakeSupabase([duplicateRow]);
    const found = await findDuplicateLearners(client, original, 'c212e673-c597-4282-ab06-d9d943aca1c0');
    expect(found.map((c) => c.application_id)).toEqual(['JKKN-COP-1538']);
    expect(describeDuplicateLearner(found[0])).toContain('JKKN-COP-1538');
  });

  it('does not flag a sibling who shares the mobile but not the name', async () => {
    const { client } = fakeSupabase([{ ...duplicateRow, first_name: 'Priya' }]);
    expect(await findDuplicateLearners(client, original, null)).toEqual([]);
  });

  it('never queries on an incomplete identity', async () => {
    const { client, calls } = fakeSupabase([duplicateRow]);
    expect(await findDuplicateLearners(client, { ...original, student_mobile: null }, null)).toEqual([]);
    expect(calls.eq).toHaveLength(0);
  });

  it('excludes the learner being saved and the closed statuses', async () => {
    const { client, calls } = fakeSupabase([]);
    await findDuplicateLearners(client, original, 'self-id');
    expect(calls.neq).toEqual([['id', 'self-id']]);
    expect(calls.not[0][2]).toBe('(rejected,inactive,exited,graduated,alumni)');
  });

  it('omits the self filter instead of sending the string "undefined"', async () => {
    const { client, calls } = fakeSupabase([]);
    await findDuplicateLearners(client, original, undefined);
    expect(calls.neq).toHaveLength(0);
  });
});
