/**
 * Who is told that an eligibility request was decided: the person it is FOR.
 *
 * HR can file a request on someone's behalf (migration 20271003101521 builds
 * the chain for it like any request), and created_by is then the HR filer. The
 * decided notice must still reach the team member, not HR.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LeaveEligibilityService } from '@/lib/services/hr/leave-eligibility-service';

const MEMBER_PROFILE = 'p-member';
const KEPT_OWNER = 'p-kept';

/**
 * A client answering the staff link and the row's kept owner. `kept` may be
 * an Error to model the column not being readable.
 */
function client(linked: string | null, kept: string | null | Error = null) {
  const seen: Array<{ table: string; id: string }> = [];
  const fake = {
    from(table: string) {
      return {
        select: () => ({
          eq: (_col: string, id: string) => {
            seen.push({ table, id });
            return {
              maybeSingle: async () => {
                if (table === 'staff') {
                  return { data: linked === null ? null : { profile_id: linked }, error: null };
                }
                if (kept instanceof Error) return { data: null, error: kept };
                return { data: { subject_profile_id: kept }, error: null };
              },
            };
          },
        }),
      };
    },
  };
  return { supabase: fake as unknown as SupabaseClient, seen };
}

/** The saved row, as the route passes it: created_by is HR. */
const saved = { id: 'e-1', employee_id: 's-member', created_by: 'p-hr' };

describe('LeaveEligibilityService.decidedNoticeRecipient', () => {
  it("a request HR filed on someone's behalf: the team member is told, not HR", async () => {
    const { supabase, seen } = client(MEMBER_PROFILE, KEPT_OWNER);
    expect(await LeaveEligibilityService.decidedNoticeRecipient(supabase, saved)).toBe(MEMBER_PROFILE);
    expect(seen).toEqual([{ table: 'staff', id: 's-member' }]);
  });

  it('a record unlinked since: the person the row was filed for (kept on the row)', async () => {
    const { supabase, seen } = client(null, KEPT_OWNER);
    expect(await LeaveEligibilityService.decidedNoticeRecipient(supabase, saved)).toBe(KEPT_OWNER);
    expect(seen).toEqual([
      { table: 'staff', id: 's-member' },
      { table: 'hr_leave_eligibilities', id: 'e-1' },
    ]);
  });

  it('nobody found: nobody is told, not the filer', async () => {
    const { supabase } = client(null, null);
    expect(await LeaveEligibilityService.decidedNoticeRecipient(supabase, saved)).toBeNull();
  });

  it('the kept owner cannot be read: nobody is told', async () => {
    const { supabase } = client(null, new Error('column does not exist'));
    expect(await LeaveEligibilityService.decidedNoticeRecipient(supabase, saved)).toBeNull();
  });
});

describe('the decide route uses it', () => {
  const route = readFileSync(
    path.resolve(__dirname, '..', '..', 'app/api/hr/leave/eligibility/[id]/decide/route.ts'),
    'utf8'
  );

  it('asks decidedNoticeRecipient, and never starts from created_by', () => {
    expect(route).toMatch(/LeaveEligibilityService\.decidedNoticeRecipient\(\s*serviceSupabase,\s*saved\s*\)/);
    expect(route).not.toMatch(/=\s*saved\.created_by/);
  });
});
