// "Revoke" on a cross-institution grant used to mean `is_active = false`.
// 38 RLS policies across 31 tables read user_institution_access WITHOUT
// consulting is_active — the whole Internship module, WhatsApp automation, LTI,
// off-days and both leave-approval tables — so the access stayed live while the
// admin was told the revoke succeeded.
//
// 20261201120000 makes revoke DELETE the row, so there is nothing left for a
// policy to miss. These assertions exist because the soft-delete is an easy,
// well-intentioned thing to reintroduce ("keep the history!") — and the history
// is already kept: trg_log_institution_access_change logs the DELETE to
// role_audit_log as 'institution_access_revoked'.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const MIGRATION = readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20261201120000_revoke_institution_access_deletes_row.sql'
  ),
  'utf8'
);

const ROUTE = readFileSync(
  path.join(process.cwd(), 'app/api/audit/external-auditors/[id]/route.ts'),
  'utf8'
);

/**
 * Just the DELETE (offboarding) handler.
 *
 * The PATCH handler in the same file still updates user_institution_access
 * directly to extend an auditor's access. That is deliberately NOT changed
 * here — it is a different operation, and it has its own unresolved problem:
 * it writes `expires_at`, a column that does not exist on production, and it
 * uses the same caller-scoped client, so it is very likely a no-op reporting
 * success too. Worth its own investigation; asserting over the whole file
 * would conflate the two.
 */
const DELETE_HANDLER = ROUTE.slice(ROUTE.indexOf('export const DELETE'));

/** Migration with SQL line-comments stripped — the header quotes the very
 *  constructs these assertions look for. */
const CODE = MIGRATION.split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .join('\n');

describe('revoking institution access deletes the row', () => {
  it('single-grant revoke DELETEs', () => {
    expect(CODE).toMatch(/DELETE FROM user_institution_access\s+WHERE user_id = target_user_id\s+AND institution_id = target_institution_id;/);
  });

  it('single-grant revoke no longer flips is_active', () => {
    // The exact regression: UPDATE ... SET is_active = false.
    expect(CODE).not.toMatch(/UPDATE\s+user_institution_access[\s\S]{0,120}is_active\s*=\s*false/i);
  });

  it('whole-person revoke exists and reports a real count', () => {
    expect(CODE).toMatch(/CREATE OR REPLACE FUNCTION public\.revoke_all_user_institution_access/);
    expect(CODE).toMatch(/GET DIAGNOSTICS v_deleted = ROW_COUNT;/);
    expect(CODE).toMatch(/RETURNS integer/);
  });

  it('both revoke functions keep an authorization gate', () => {
    // SECURITY DEFINER bypasses RLS, so the gate inside is the only boundary.
    const gates = CODE.match(/RAISE EXCEPTION 'revoke_[a-z_]*: [^']*required'/g) ?? [];
    expect(gates).toHaveLength(2);
    expect(CODE).toMatch(/is_super_admin\(\) OR is_admin\(\) OR user_has_permission\('roles\.create'\)/);
    expect(CODE).toMatch(/user_has_permission\('audit\.external_auditor\.manage'\)/);
  });

  it('locks both functions against anon', () => {
    expect(CODE).toMatch(/REVOKE EXECUTE ON FUNCTION public\.revoke_user_institution_access\(uuid, uuid\) FROM anon, PUBLIC;/);
    expect(CODE).toMatch(/REVOKE EXECUTE ON FUNCTION public\.revoke_all_user_institution_access\(uuid\) FROM anon, PUBLIC;/);
  });

  it('clears any row left in the soft-deleted state', () => {
    expect(CODE).toMatch(/DELETE FROM public\.user_institution_access\s+WHERE is_active = false;/);
  });
});

describe('external-auditor offboarding endpoint', () => {
  it('goes through the SECURITY DEFINER RPC', () => {
    expect(DELETE_HANDLER).toMatch(/rpc\(\s*'revoke_all_user_institution_access'/);
  });

  it('no longer writes user_institution_access with the caller client', () => {
    // withAuth gives the CALLER'S RLS-scoped client, and the table has no
    // UPDATE/DELETE policy for `authenticated` — the old write matched zero
    // rows and still returned {revoked: true}.
    expect(DELETE_HANDLER).not.toMatch(/from\('user_institution_access'\)[\s\S]{0,80}\.update\(/);
  });

  it('reports how many grants were actually removed', () => {
    expect(DELETE_HANDLER).toMatch(/grants_removed/);
  });
});
