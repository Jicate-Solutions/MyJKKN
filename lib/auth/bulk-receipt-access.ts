// lib/auth/bulk-receipt-access.ts
//
// Access resolution for the three bulk-receipt API routes:
//   GET  /api/billing/receipts/bulk-template
//   GET  /api/billing/receipts/bulk-template/count
//   POST /api/billing/receipts/bulk-import
//
// WHY THIS EXISTS AS ITS OWN MODULE
// ---------------------------------
// All three routes talk to Postgres through `createServiceRoleClient()`, which
// bypasses RLS completely. Until 2026-08 that was safe because every route
// started with a hard `assertSuperAdmin()` — the super-admin check WAS the
// tenant boundary. Now that the feature is gated on a delegable permission
// (`billing.receipts.bulk_create`, toggled per custom role in Role
// Management), a permission holder scoped to one institution would otherwise
// reach every institution's bills. There is no RLS underneath to catch it.
//
// So this resolver returns BOTH answers the routes need, and each route must
// use both:
//   1. may this user run bulk receipts at all?
//   2. which institutions' bills may they touch?
//
// Dropping (2) reintroduces a cross-tenant read/write. Do not "simplify" the
// callers by discarding institutionIds.

import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * The permission key that gates bulk receipt generation. Catalogued in
 * lib/constants/permissions.ts; granted to roles by migration
 * 20260801100000_billing_receipts_bulk_create_permission.sql.
 */
export const BULK_RECEIPT_PERMISSION = 'billing.receipts.bulk_create';

export interface BulkReceiptAccess {
  allowed: boolean;
  isSuperAdmin: boolean;
  /**
   * Institutions whose bills this caller may template, count, or receipt.
   *
   * EMPTY means "unrestricted" and is only ever returned alongside
   * isSuperAdmin === true. A permission holder who resolves to zero accessible
   * institutions is denied outright (allowed: false) rather than falling
   * through to the empty-means-everything branch — that inversion is exactly
   * how a scoped user would silently gain global access.
   */
  institutionIds: string[];
  /** Human-readable 403 body. Present whenever allowed === false. */
  reason?: string;
}

/**
 * Resolve whether `userId` may run bulk receipt generation, and over which
 * institutions.
 *
 * Permission is answered by the `user_has_permission(uuid, text)` RPC rather
 * than by re-reading custom_roles here. That function is SECURITY DEFINER and
 * already encodes the 3-step chain the RLS policies use (super-admin bypass →
 * user_roles → legacy profiles.role fallback), so the route's answer stays
 * identical to the database's. Hand-rolling the chain in TypeScript is what
 * caused the expo bulk-capture 403s for pre-multi-role users.
 */
export async function resolveBulkReceiptAccess(
  userId: string
): Promise<BulkReceiptAccess> {
  const supabase = createServiceRoleClient();

  // Super admins keep unrestricted access — same two-field test the routes
  // used before this key existed, so nothing regresses for them.
  const { data: profile } = await (supabase as any)
    .from('profiles')
    .select('role, is_super_admin')
    .eq('id', userId)
    .single();

  if (profile?.is_super_admin === true || profile?.role === 'super_admin') {
    return { allowed: true, isSuperAdmin: true, institutionIds: [] };
  }

  const { data: hasPermission, error: permError } = await (supabase as any).rpc(
    'user_has_permission',
    { user_id: userId, permission_key: BULK_RECEIPT_PERMISSION }
  );

  if (permError) {
    console.error(
      '[bulk-receipt-access] user_has_permission failed:',
      permError.message
    );
    // Fail closed. A transient RPC error must not read as "allowed".
    return {
      allowed: false,
      isSuperAdmin: false,
      institutionIds: [],
      reason: 'Could not verify your permissions. Please retry.'
    };
  }

  if (hasPermission !== true) {
    return {
      allowed: false,
      isSuperAdmin: false,
      institutionIds: [],
      reason:
        'Forbidden — bulk receipt generation requires the "Bulk Generate Receipts (Excel Upload)" permission.'
    };
  }

  // get_user_accessible_institutions() already honours
  // custom_roles.institution_scope='all' (branch 3), so a Chief Accountant
  // scoped to all institutions gets the full list while an institution-scoped
  // role gets only its own — no branching on role names needed here.
  const { data: rows, error: instError } = await (supabase as any).rpc(
    'get_user_accessible_institutions',
    { target_user_id: userId }
  );

  if (instError) {
    console.error(
      '[bulk-receipt-access] get_user_accessible_institutions failed:',
      instError.message
    );
    return {
      allowed: false,
      isSuperAdmin: false,
      institutionIds: [],
      reason: 'Could not resolve your institution access. Please retry.'
    };
  }

  const institutionIds: string[] = ((rows as any[]) ?? [])
    .map((r) => r.institution_id)
    .filter(Boolean);

  if (institutionIds.length === 0) {
    return {
      allowed: false,
      isSuperAdmin: false,
      institutionIds: [],
      reason:
        'Forbidden — you have the bulk receipt permission but no institution access. Ask an administrator to assign your institution.'
    };
  }

  return { allowed: true, isSuperAdmin: false, institutionIds };
}

/**
 * Narrow a caller-supplied `institution_id` filter against what they may
 * actually reach.
 *
 * Returns an error string when the requested institution is outside the
 * caller's scope. Callers should 403 on that rather than quietly returning
 * zero rows — a silent empty result reads to the user as "no outstanding
 * bills", which is the wrong and unactionable answer.
 */
export function assertInstitutionInScope(
  access: BulkReceiptAccess,
  requestedInstitutionId: string | undefined
): string | null {
  if (access.isSuperAdmin) return null;
  if (!requestedInstitutionId) return null;
  if (access.institutionIds.includes(requestedInstitutionId)) return null;
  return 'Forbidden — you do not have access to the selected institution.';
}
