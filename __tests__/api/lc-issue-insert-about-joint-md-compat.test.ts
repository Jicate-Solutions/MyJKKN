/**
 * LCIssueService.createLCIssue — the one insert path for complaints — when the
 * app reaches production before migration 20271010020000 adds
 * grievance_tickets.about_joint_md (deep review of #4079 round 2, M5).
 *
 *   - WITH the "about the Joint MD" tick: fail loudly, in words the filer can
 *     act on, and never retry without the tick (that would send a complaint
 *     about the Joint MD down the normal path, where she can see it);
 *   - WITHOUT the tick: file it in the shape it had before that migration;
 *   - any other database error is still the raw "Failed to create issue".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({ createClientSupabaseClient: () => ({}) }));
vi.mock('@/lib/services/learners-council/notification-service', () => ({ LCNotificationService: {} }));

import { LCIssueService } from '@/lib/services/learners-council/issue-service';

const CATEGORY = 'c0000000-0000-4000-8000-000000000001';
let columnExists = true;
let otherFailure = false;
const inserted: Record<string, unknown>[] = [];

function client() {
  return {
    from: (table: string) => {
      if (table === 'grievance_categories') {
        const c = { select: () => c, eq: () => c, maybeSingle: async () => ({ data: null, error: null }) };
        return c;
      }
      if (table === 'profiles') {
        const c = {
          select: () => c,
          eq: () => c,
          single: async () => ({ data: { full_name: 'A Learner', email: 'l@x', role: 'learner' }, error: null }),
        };
        return c;
      }
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              inserted.push(row);
              if (otherFailure) return { data: null, error: { code: '23503', message: 'insert violates foreign key' } };
              if (!columnExists && 'about_joint_md' in row) {
                return {
                  data: null,
                  error: { code: 'PGRST204', message: "Could not find the 'about_joint_md' column of 'grievance_tickets' in the schema cache" },
                };
              }
              return { data: { id: 't1', ticket_number: 'GRV-1', ...row }, error: null };
            },
          }),
        }),
      };
    },
  };
}

const file = (aboutJointMd: boolean) =>
  LCIssueService.createLCIssue(
    { institution_id: 'i1', subject: 's', description: 'a long enough description', category: CATEGORY, priority: 'medium' },
    'u1',
    { client: client() as never, source: 'instasolver', aboutJointMd }
  );

beforeEach(() => {
  columnExists = true;
  otherFailure = false;
  inserted.length = 0;
});

describe('column present (migration applied)', () => {
  it('the tick is written', async () => {
    await file(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].about_joint_md).toBe(true);
  });
});

describe('column missing (app deployed first)', () => {
  beforeEach(() => {
    columnExists = false;
  });

  it('WITH the tick: refuses loudly and never files it without the tick', async () => {
    await expect(file(true)).rejects.toThrow(/not switched on yet, so nothing was filed/);
    expect(inserted).toHaveLength(1);
    expect(inserted.every(r => r.about_joint_md === true)).toBe(true);
  });

  it('WITHOUT the tick: files it in the old shape', async () => {
    const t = await file(false);
    expect(t.ticket_number).toBe('GRV-1');
    expect(inserted.every(r => !('about_joint_md' in r))).toBe(true);
  });
});

describe('any other database error', () => {
  it('is still the raw failure the route hides', async () => {
    otherFailure = true;
    await expect(file(true)).rejects.toThrow(/^Failed to create issue:/);
    expect(inserted).toHaveLength(1);
  });
});
