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
// TIME-BOX MECHANISM (partial — requires one-line DDL before go-live):
//   The Sprint 01 seed migration references `user_institution_access.expires_at`
//   but that column does NOT yet exist on prod (verified against
//   supabase/setup/01_tables.sql + types/supabase.ts 2026-04-23). This service
//   reads/writes expires_at as if it exists — a follow-up migration
//   `ALTER TABLE user_institution_access ADD COLUMN expires_at TIMESTAMPTZ`
//   must land before this feature can be deployed. Revoke also flips is_active=false
//   so the row becomes inert even without expires_at honored by RLS.
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
