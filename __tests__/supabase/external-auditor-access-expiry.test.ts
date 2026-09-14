// An external auditor's access has never expired.
//
// The admin screen carried a live "+7 days" button and a Status column, but
// `user_institution_access.expires_at` was never created by any migration —
// the service's own header said the column had to land "before this feature
// can be deployed", and it was deployed anyway. So the PATCH handler wrote a
// column that did not exist, through the caller's RLS client (which has no
// UPDATE policy on that table), counted `updated += 1` regardless, and
// reported success. computeStatus() could never return 'expired'.
//
// 20261201130000 adds the column and makes expiry mean DELETE, exactly as
// 20261201120000 made revoke mean DELETE — because the 38 RLS policies across
// 31 tables that read this table consult neither is_active nor expires_at.
//
// These assertions guard the three things that are easy to undo by good
// intentions: making expiry a flag again ("don't delete, just mark it"),
// dropping the scope guard ("extend should work on anyone"), and handing
// `authenticated` the mass-delete sweep.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

// The service builds a browser Supabase client in a static initializer, so
// importing it for a pure function would otherwise demand live env vars.
// Same shape the rest of the suite uses.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
}));

import { AuditExternalAuditorService } from '@/lib/services/audit/audit-external-auditor-service';

const MIGRATION = readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20261201130000_external_auditor_access_expiry.sql'
  ),
  'utf8'
);

const ROUTE = readFileSync(
  path.join(process.cwd(), 'app/api/audit/external-auditors/[id]/route.ts'),
  'utf8'
);

/** Migration with SQL line-comments stripped — the header quotes the very
 *  constructs these assertions look for. */
const CODE = MIGRATION.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

/** Just the PATCH (extend) handler; DELETE has its own test file.
 *
 *  Comments are stripped. The handler's own comments quote the very
 *  constructs these assertions forbid ("`updated += 1` ran whether or not
 *  anything changed"), so asserting over the raw text would fail on the
 *  explanation of the bug rather than the bug. */
const PATCH_HANDLER = ROUTE.slice(
  ROUTE.indexOf('export const PATCH'),
  ROUTE.indexOf('export const DELETE')
)
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

describe('the missing column', () => {
  it('adds expires_at to user_institution_access', () => {
    expect(CODE).toMatch(
      /ALTER TABLE public\.user_institution_access\s+ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;/
    );
  });

  it('does not put expires_at into any policy predicate', () => {
    // The whole design: expires_at is a SCHEDULE, not a predicate. A policy
    // reading it would be the second flag nobody consults — the original bug
    // with a new column name.
    expect(CODE).not.toMatch(/CREATE\s+POLICY/i);
    expect(CODE).not.toMatch(/ALTER\s+POLICY/i);
  });
});

describe('expiry deletes, it does not flag', () => {
  it('the sweep DELETEs expired rows', () => {
    expect(CODE).toMatch(
      /DELETE FROM user_institution_access\s+WHERE expires_at IS NOT NULL\s+AND expires_at <= now\(\);/
    );
  });

  it('never expires a NULL schedule', () => {
    // NULL expires_at means "permanent". The IS NOT NULL guard is the only
    // thing standing between the sweep and every grant in the table.
    const sweep = CODE.slice(CODE.indexOf('fn_expire_institution_access'));
    expect(sweep).toMatch(/expires_at IS NOT NULL/);
  });

  it('reports a real count rather than a boolean', () => {
    expect(CODE).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_expire_institution_access/);
    expect(CODE).toMatch(/GET DIAGNOSTICS v_deleted = ROW_COUNT;/);
  });

  it('does not reintroduce the soft delete', () => {
    expect(CODE).not.toMatch(/UPDATE\s+user_institution_access[\s\S]{0,160}is_active\s*=\s*false/i);
  });
});

describe('extending is restricted to external auditors', () => {
  it('refuses a target who is not an external auditor', () => {
    // Without this, "extend" is a scheduled revoke for everyone else: a
    // permanent (NULL) grant would be given its first schedule and then
    // deleted by the sweep. Pointed at the CEO/COO/Registrar rows, one call
    // would queue their whole cross-institution access for deletion.
    expect(CODE).toMatch(/is not an external auditor/);
    expect(CODE).toMatch(/ERRCODE = '42501'/);
  });

  it('accepts either role path, as role_has_institution_access does', () => {
    // MyJKKN resolves a role two ways. Checking only user_roles would refuse a
    // legitimate auditor carried on the legacy profiles.role fallback.
    const guard = CODE.slice(CODE.indexOf('fn_extend_institution_access'));
    expect(guard).toMatch(/FROM user_roles ur/);
    expect(guard).toMatch(/FROM profiles pr/);
    expect(guard).toMatch(/external_auditor_timeboxed/);
  });

  it('keeps the permission gate as well as the target check', () => {
    // Permission says you may manage auditors; it does not say the uuid you
    // passed is one. Both checks are required.
    expect(CODE).toMatch(
      /is_super_admin\(\)\s+OR is_admin\(\)\s+OR user_has_permission\('audit\.external_auditor\.manage'\)/
    );
  });

  it('clamps the day count in SQL, not only in the route', () => {
    // The RPC is granted to `authenticated`; the route is not its only
    // possible caller, and a guard that lives only in the caller is not one.
    expect(CODE).toMatch(/v_days := LEAST\(90, GREATEST\(1, COALESCE\(extend_days, 7\)\)\);/);
  });

  it('extends from now when the schedule has already lapsed', () => {
    expect(CODE).toMatch(/GREATEST\(COALESCE\(expires_at, now\(\)\), now\(\)\)/);
  });
});

describe('grants', () => {
  it('revokes anon on both new functions', () => {
    // Supabase's ALTER DEFAULT PRIVILEGES gives anon its own EXECUTE grant on
    // every new function, separate from PUBLIC. Revoking PUBLIC alone leaves
    // them callable with the anon key in every browser bundle.
    expect(CODE).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_expire_institution_access\(\) FROM anon, PUBLIC;/
    );
    expect(CODE).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_extend_institution_access\(uuid, integer\) FROM anon, PUBLIC;/
    );
  });

  it('never hands `authenticated` the mass-delete sweep', () => {
    const grant = CODE.match(
      /GRANT\s+EXECUTE ON FUNCTION public\.fn_expire_institution_access\(\) TO ([^;]+);/
    );
    expect(grant).not.toBeNull();
    expect(grant![1]).toContain('service_role');
    expect(grant![1]).not.toContain('authenticated');
  });
});

describe('the PATCH handler reports what happened', () => {
  it('goes through the RPC instead of writing the table', () => {
    expect(PATCH_HANDLER).toMatch(/rpc\(\s*'fn_extend_institution_access'/);
    expect(PATCH_HANDLER).not.toMatch(/\.from\(\s*'user_institution_access'\s*\)/);
  });

  it('no longer fabricates a count', () => {
    // The exact regression: a counter incremented whether or not the write
    // changed anything.
    expect(PATCH_HANDLER).not.toMatch(/updated\s*\+=\s*1/);
  });

  it('no longer carries the missing-column fallback', () => {
    expect(PATCH_HANDLER).not.toMatch(/missingColumn/);
  });
});

describe('computeStatus can finally return every branch', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it('an inactive grant reads revoked', () => {
    expect(AuditExternalAuditorService.computeStatus(false, future)).toBe('revoked');
  });

  it('a lapsed schedule reads expired — unreachable before this migration', () => {
    expect(AuditExternalAuditorService.computeStatus(true, past)).toBe('expired');
  });

  it('a future schedule reads active', () => {
    expect(AuditExternalAuditorService.computeStatus(true, future)).toBe('active');
  });

  it('no schedule reads active, not expired', () => {
    // Every pre-existing row holds NULL after this migration. Reading those as
    // 'expired' would paint the whole screen red on apply.
    expect(AuditExternalAuditorService.computeStatus(true, null)).toBe('active');
  });
});
