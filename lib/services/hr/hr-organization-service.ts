import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  HROrganizationAdminRow,
  HROrganizationSetIncludedPayload,
} from '@/types/hr-organizations';

/**
 * Which institutions are part of the HR module.
 *
 * Both RPCs are super-admin only and check it themselves; the page hides the
 * controls rather than letting somebody fill in a form the server refuses.
 */
export class HROrganizationService {
  /**
   * Every HR organization, INCLUDING excluded ones.
   *
   * Deliberately not built on fn_hr_orgs_for_institutions — that resolver now
   * filters excluded organizations out, so reusing it here would make an
   * excluded institution impossible to find and therefore impossible to switch
   * back on. This is the one read that must see all of them.
   */
  static async adminList(supabase: SupabaseClient): Promise<HROrganizationAdminRow[]> {
    const { data, error } = await supabase.rpc('hr_organizations_admin_list');
    if (error) throw error;
    return (data ?? []) as HROrganizationAdminRow[];
  }

  /**
   * Include or exclude one institution.
   *
   * Nothing is deleted: balances, attendance and applications are retained and
   * simply stop being visible, so re-enabling restores everything. The result
   * carries `frozen_pending` — how many in-flight leave requests just became
   * unreachable — which is worth showing back to the operator.
   */
  static async setIncluded(
    supabase: SupabaseClient,
    payload: HROrganizationSetIncludedPayload
  ): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.rpc('hr_organization_set_included', {
      p_hr_org_id: payload.hr_organization_id,
      p_included: payload.included,
      p_reason: payload.reason,
    });
    if (error) throw error;
    return data as Record<string, unknown>;
  }
}
