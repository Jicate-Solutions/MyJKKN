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

/** A client whose staff table holds one row, or none. */
function client(profileId: string | null) {
  const seen: { table?: string; id?: string } = {};
  const fake = {
    from(table: string) {
      seen.table = table;
      return {
        select: () => ({
          eq: (_col: string, id: string) => {
            seen.id = id;
            return {
              maybeSingle: async () => ({
                data: profileId === null ? null : { profile_id: profileId },
                error: null,
              }),
            };
          },
        }),
      };
    },
  };
  return { supabase: fake as unknown as SupabaseClient, seen };
}

describe('LeaveEligibilityService.decidedNoticeRecipient', () => {
  it('a request HR filed on someone\'s behalf: the team member is told, not HR', async () => {
    const { supabase, seen } = client(MEMBER_PROFILE);
    // The saved row, as the route passes it: created_by is HR.
    const saved = { employee_id: 's-member', created_by: 'p-hr' };
    const to = await LeaveEligibilityService.decidedNoticeRecipient(supabase, saved);
    expect(to).toBe(MEMBER_PROFILE);
    expect(seen).toEqual({ table: 'staff', id: 's-member' });
  });

  it('their own request: the same person', async () => {
    const { supabase } = client(MEMBER_PROFILE);
    const to = await LeaveEligibilityService.decidedNoticeRecipient(supabase, {
      employee_id: 's-member',
    });
    expect(to).toBe(MEMBER_PROFILE);
  });

  it('a team member with no sign-in: nobody is told, not the filer', async () => {
    const { supabase } = client(null);
    const saved = { employee_id: 's-member', created_by: 'p-hr' };
    const to = await LeaveEligibilityService.decidedNoticeRecipient(supabase, saved);
    expect(to).toBeNull();
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
