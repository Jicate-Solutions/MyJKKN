// lib/services/schools-network/jkkn-owners-service.ts
// ============================================================================
// SchoolJkknOwnersService — assign / revoke JKKN-side owners
// (outreach_coordinator or program_lead) for a school.
//
// Writes via fn_school_assign_owner / fn_school_revoke_owner so the
// definer-side checks (role-vs-partner CHECK, admin-only) live in one place.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  SchoolJkknOwner,
  SchoolJkknOwnerRow,
  AssignOwnerInput,
} from '@/lib/types/schools-network';
import { fetchProfileNames } from './profile-names';

const LOG = 'schools-network/jkkn-owners';

function mapOwnerRow(row: SchoolJkknOwnerRow): SchoolJkknOwner {
  return {
    id: row.id,
    schoolId: row.school_id,
    jkknUserId: row.jkkn_user_id,
    jkknUserName: row.profiles?.full_name ?? undefined,
    role: row.role,
    programPartnerId: row.program_partner_id,
    programPartnerName: row.program_partners?.name ?? null,
    assignedAt: row.assigned_at,
    assignedBy: row.assigned_by,
    isActive: row.is_active,
  };
}

export class SchoolJkknOwnersService {
  /**
   * List all active owners for a school. Includes profile + partner joins so
   * UI can show "X is the program_lead for HP CSR".
   */
  static async listForSchool(
    supabase: SupabaseClient,
    schoolId: string,
    includeInactive = false
  ): Promise<{ rows: SchoolJkknOwner[]; error: string | null }> {
    // NO profiles embed here: jkkn_user_id is a FK to auth.users, not
    // public.profiles — PostgREST cannot resolve `profiles:jkkn_user_id(...)`
    // and 500s the list (same class as sessions listForSchool). Names are
    // merged from a second RLS-scoped query via fetchProfileNames.
    let q = supabase
      .from('school_jkkn_owners')
      .select(
        `
        *,
        program_partners(name)
      `
      )
      .eq('school_id', schoolId)
      .order('assigned_at', { ascending: false });

    if (!includeInactive) q = q.eq('is_active', true);

    const { data, error } = await q;
    if (error) {
      logger.error(LOG, 'listForSchool failed', error);
      return { rows: [], error: error.message };
    }
    const names = await fetchProfileNames(
      supabase,
      (data ?? []).map((r: { jkkn_user_id: string | null }) => r.jkkn_user_id)
    );
    return {
      rows: (data ?? []).map((r: Record<string, unknown>) =>
        mapOwnerRow({
          ...r,
          profiles: r.jkkn_user_id
            ? { full_name: names.get(r.jkkn_user_id as string) ?? null }
            : null,
        } as SchoolJkknOwnerRow)
      ),
      error: null,
    };
  }

  /**
   * Assign an owner. Validates that program_lead has a program_partner_id.
   */
  static async assign(
    supabase: SupabaseClient,
    schoolId: string,
    input: AssignOwnerInput
  ): Promise<{ id: string | null; error: string | null }> {
    if (!input.jkknUserId) return { id: null, error: 'jkknUserId is required' };
    if (!input.role) return { id: null, error: 'role is required' };
    if (input.role === 'program_lead' && !input.programPartnerId) {
      return {
        id: null,
        error: 'programPartnerId is required when role is program_lead',
      };
    }

    const { data, error } = await supabase.rpc('fn_school_assign_owner', {
      p_school_id: schoolId,
      p_jkkn_user_id: input.jkknUserId,
      p_role: input.role,
      p_program_partner_id: input.programPartnerId ?? null,
    });

    if (error) {
      logger.error(LOG, 'fn_school_assign_owner failed', error);
      return { id: null, error: error.message };
    }
    return { id: (data as string) ?? null, error: null };
  }

  /**
   * Revoke a single owner assignment (soft delete via is_active=false in the
   * RPC). Returns true on success.
   */
  static async revoke(
    supabase: SupabaseClient,
    ownerId: string
  ): Promise<{ ok: boolean; error: string | null }> {
    const { data, error } = await supabase.rpc('fn_school_revoke_owner', {
      p_owner_id: ownerId,
    });

    if (error) {
      logger.error(LOG, 'fn_school_revoke_owner failed', error);
      return { ok: false, error: error.message };
    }
    return { ok: Boolean(data), error: null };
  }
}
