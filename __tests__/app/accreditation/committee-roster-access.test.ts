import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  decideCommitteeListAccess,
  decideCommitteeDetailAccess,
  COMMITTEE_ACCESS_CONTACT,
} from '@/app/(routes)/accreditation/naac/committees/_lib/committee-access';

// ---------------------------------------------------------------------------
// Director decision 8 — "access to committee pages follows committee-roster
// membership, not job title."
//
// These assert what a viewer is TOLD and whether the door opens. They do not
// re-derive the RLS expression: a test that re-implements the SQL only proves
// this file agrees with itself, which is how this project has twice shipped a
// live bug under green tests. The database half is proved by the readability
// probe written into the migration's §3c, run as a real member — not here.
// ---------------------------------------------------------------------------

describe('decideCommitteeListAccess', () => {
  it('lets a permission holder in without needing a roster read', () => {
    const d = decideCommitteeListAccess({
      hasViewPermission: true,
      rosterCommitteeIds: [],
    });
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('permission');
  });

  it('lets an ordinary member in on one roster row alone', () => {
    const d = decideCommitteeListAccess({
      hasViewPermission: false,
      rosterCommitteeIds: ['ce403c74-85b9-452e-aaec-6757bab0f915'],
    });
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('roster');
  });

  it('refuses in words, and names who to ask, when neither route applies', () => {
    const d = decideCommitteeListAccess({
      hasViewPermission: false,
      rosterCommitteeIds: [],
    });
    expect(d.allowed).toBe(false);
    expect(d.title).toContain('do not have access');
    // The refusal has to say the roster is the way in — otherwise a member who
    // was appointed but never added has no idea what to ask for.
    expect(d.detail).toContain('roster');
    expect(d.contact).toBe(COMMITTEE_ACCESS_CONTACT);
    expect(d.contact.length).toBeGreaterThan(0);
  });

  it('never opens on an empty roster read — an empty list is a refusal, not a page', () => {
    // The whole trap: RLS denial returns 0 rows with no error, so "denied" and
    // "nothing exists" look identical. The gate must resolve that tie by
    // refusing, so the viewer gets a sentence instead of a blank screen.
    const d = decideCommitteeListAccess({
      hasViewPermission: false,
      rosterCommitteeIds: [],
    });
    expect(d.allowed).toBe(false);
  });
});

describe('decideCommitteeDetailAccess', () => {
  const A = 'ce403c74-85b9-452e-aaec-6757bab0f915';
  const B = '19c00ca0-f3b2-4b4b-83e0-349b10e58122';

  it('opens the committee the viewer sits on', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      rosterCommitteeIds: [A],
      committeeId: A,
    });
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('roster');
  });

  it('does NOT open a different committee — membership is per committee', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      rosterCommitteeIds: [A],
      committeeId: B,
    });
    expect(d.allowed).toBe(false);
  });

  it('tells a member of another committee exactly why this one is shut', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      rosterCommitteeIds: [A],
      committeeId: B,
    });
    expect(d.detail).toContain('another committee');
    expect(d.contact).toBe(COMMITTEE_ACCESS_CONTACT);
  });

  it('gives a viewer on no roster at all the plain version, not the confusing one', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: false,
      rosterCommitteeIds: [],
      committeeId: B,
    });
    expect(d.allowed).toBe(false);
    expect(d.detail).not.toContain('another committee');
    expect(d.detail).toContain('roster');
  });

  it('a permission holder opens any committee regardless of roster', () => {
    const d = decideCommitteeDetailAccess({
      hasViewPermission: true,
      rosterCommitteeIds: [],
      committeeId: B,
    });
    expect(d.allowed).toBe(true);
    expect(d.via).toBe('permission');
  });
});

// ---------------------------------------------------------------------------
// Migration hygiene. Not a proof that the policy works — a guard on the four
// properties a reviewer would otherwise have to eyeball, each of which has its
// own recorded incident in this repo.
// ---------------------------------------------------------------------------
describe('20260809102300_committee_roster_access.sql', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'supabase/migrations/20260809102300_committee_roster_access.sql',
    ),
    'utf8',
  );

  it('locks the helper away from anon and keeps it callable by authenticated', () => {
    // Supabase's default privileges grant anon EXECUTE on every new function
    // independently of PUBLIC, so revoking PUBLIC alone leaves it open to the
    // anon key that ships in the browser bundle.
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_user_is_committee_member\(uuid\) FROM anon, PUBLIC;/,
    );
    expect(sql).toMatch(
      /GRANT\s+EXECUTE ON FUNCTION public\.fn_user_is_committee_member\(uuid\) TO authenticated;/,
    );
  });

  it('declares the helper SECURITY DEFINER with a pinned search_path', () => {
    // SECURITY DEFINER is what stops members_select recursing into the table
    // the helper reads. Losing it is not a style regression, it is a hang.
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public');
  });

  it('never matches an external member, and never a NULL identity', () => {
    expect(sql).toContain('m.is_external  = false');
    expect(sql).toContain('m.user_id      IS NOT NULL');
    // Identity comes from auth.uid() inside the function, never a parameter —
    // a SECURITY DEFINER function trusting a caller-supplied id is an IDOR.
    expect(sql).toContain('m.user_id      = auth.uid()');
    expect(sql).not.toMatch(/fn_user_is_committee_member\(\s*p_user_id/);
  });

  it('adds the roster arm to all four SELECT policies and to no write policy', () => {
    const rosterArm = /fn_user_is_committee_member\(/g;
    for (const policy of [
      'committees_select',
      'members_select',
      'acm_select',
      'acr_select',
    ]) {
      const line = sql
        .split('\n')
        .find((l) => l.startsWith(`ALTER POLICY "${policy}"`));
      expect(line, `${policy} must be rewritten`).toBeTruthy();
      expect(line).toMatch(rosterArm);
    }
    // Read-only widening: no insert/update/delete policy is touched at all.
    const altered = sql
      .split('\n')
      .filter((l) => l.startsWith('ALTER POLICY'))
      .map((l) => l.split('"')[1]);
    expect(altered.sort()).toEqual([
      'acm_select',
      'acr_select',
      'committees_select',
      'members_select',
    ]);
  });

  it('uses the grantable naac permission family, not the ungrantable one', () => {
    // accreditation.committees.* appears in zero rows of custom_roles and zero
    // lines of permissions.ts — no role can ever satisfy it.
    expect(sql).toContain("user_has_permission('accreditation.naac.committees.view'");
    const altersOnly = sql
      .split('\n')
      .filter((l) => l.startsWith('ALTER POLICY'))
      .join('\n');
    expect(altersOnly).not.toMatch(/'accreditation\.committees\./);
  });
});
