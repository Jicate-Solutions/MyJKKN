// Audit External Auditor (Time-Boxed) — admin service
//
// Manages time-boxed read-only audit access for external peer-team auditors
// (Aassaan Aug 2026 mock visit + future external assessments).
//
// Substrate (LIVE on prod):
//   - custom_roles.role_key = 'external_auditor_timeboxed' (seed migration 20260422)
//     institution_scope='all', permissions = {audit.cycle/finding/attestation/parameter.view}
//   - user_institution_access table for per-institution grants
//   - user_roles table for role assignment
//
// TIME-BOX MECHANISM (migration 20261201130000):
//   `user_institution_access.expires_at` is created by
//   `supabase/migrations/20261201130000_external_auditor_access_expiry.sql`.
//   For the ~5 months between the Sprint 01 seed migration (which advertised
//   the column in a COMMENT) and that file, the column did not exist: this
//   service and the admin endpoints read and wrote it anyway, so no auditor's
//   access ever expired and computeStatus() below could never return
//   'expired'. The Status column on the admin screen was decorative.
//
//   expires_at is a SCHEDULE, NOT A PREDICATE. No RLS policy reads it, and
//   none should: 38 policies across 31 tables read this table without
//   consulting is_active and would equally not consult expires_at, so a
//   timestamp-based check would be a second flag nobody reads. Expiry is
//   enforced by `fn_expire_institution_access()` DELETING the row — the same
//   conclusion 20261201120000 reached for revoke. The cron
//   /api/cron/external-auditor-access-expiry runs that sweep hourly; each
//   delete is logged to role_audit_log by trg_log_institution_access_change.
//
//   Extending goes through `fn_extend_institution_access(uuid, integer)`
//   (SECURITY DEFINER) rather than a direct write, because the table has no
//   UPDATE policy for `authenticated` — the old direct write matched zero rows
//   and reported success. Revoke likewise deletes, via
//   `revoke_all_user_institution_access(uuid)`; is_active is no longer flipped
//   by either verb.
//
// PRE-REGISTERED PROFILES:
//   External auditors typically don't yet have an auth.users row. We stage a
//   profiles row with is_pre_registered=true (FK user_roles.user_id -> profiles.id
//   not auth.users.id — pattern per memory feedback_user_roles-pre-reg).

import { createClientSupabaseClient } from '@/lib/supabase/client';

export const EXTERNAL_AUDITOR_ROLE_KEY = 'external_auditor_timeboxed';

export interface ExternalAuditorRow {
  access_id: string;              // user_institution_access.id (primary row)
  user_id: string;                // profiles.id
  email: string;
  full_name: string | null;
  is_pre_registered: boolean;
  institution_ids: string[];      // all institutions this auditor can access
  institution_names: string[];
  granted_at: string | null;
  expires_at: string | null;      // first expires_at across this user's rows
  is_active: boolean;
  status: 'active' | 'expired' | 'revoked';
}

export interface CreateExternalAuditorInput {
  email: string;
  expires_at: string;             // ISO timestamp
  institution_ids: string[];
}

export class AuditExternalAuditorService {
  private static supabase = createClientSupabaseClient();

  /**
   * Compute status from is_active + expires_at.
   *
   * All three outcomes are reachable, which was not true before
   * 20261201130000 created expires_at:
   *
   *   'revoked'  the person holds NO access rows at all. The list endpoint
   *              seeds each bucket with is_active=false and only flips it true
   *              when a row is found, so "no grants" reads as revoked. Since
   *              20261201120000 both revoke and expiry DELETE the row rather
   *              than flipping the flag, this is now the ONLY way to get here
   *              — is_active is never stored false.
   *   'expired'  a grant's schedule has passed but the hourly sweep
   *              (/api/cron/external-auditor-access-expiry) has not yet
   *              deleted it. This is therefore a TRANSIENT state, normally
   *              visible for under an hour, after which the same auditor reads
   *              'revoked'. It is not a state the auditor can act from: the
   *              row is deleted, not merely marked, so access ends at sweep
   *              time and not a moment before. Displaying it matters anyway —
   *              it is the only warning an admin gets that a window has closed
   *              and needs extending.
   *   'active'   a grant with no schedule, or one still in the future.
   */
  static computeStatus(isActive: boolean, expiresAt: string | null): 'active' | 'expired' | 'revoked' {
    if (!isActive) return 'revoked';
    if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return 'expired';
    return 'active';
  }

  /**
   * Resolve the custom_roles.id for the external auditor role.
   */
  static async getRoleId(): Promise<string> {
    const { data, error } = await (this.supabase as any)
      .from('custom_roles')
      .select('id')
      .eq('role_key', EXTERNAL_AUDITOR_ROLE_KEY)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new Error(
        `Role '${EXTERNAL_AUDITOR_ROLE_KEY}' not found in custom_roles. ` +
        `Apply migration 20260422_audit_workflow_seeds_and_triggers.sql.`
      );
    }
    return (data as { id: string }).id;
  }
}
