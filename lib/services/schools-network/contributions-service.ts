// lib/services/schools-network/contributions-service.ts
// ============================================================================
// SchoolContributionsService — log + list contributions (devices, branding,
// websites, funds, training kits) made TO a school by JKKN or a program
// partner.
//
// Writes via fn_school_contribution_record (RPC, definer-checked).
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/enhanced-logger';
import type {
  SchoolContribution,
  SchoolContributionRow,
  RecordContributionInput,
} from '@/lib/types/schools-network';

const LOG = 'schools-network/contributions';

function mapContributionRow(row: SchoolContributionRow): SchoolContribution {
  return {
    id: row.id,
    schoolId: row.school_id,
    kind: row.kind,
    description: row.description,
    valueInr: row.value_inr,
    deliveredAt: row.delivered_at,
    programPartnerId: row.program_partner_id,
    programPartnerName: row.program_partners?.name ?? null,
    evidenceUrl: row.evidence_url,
    metadata: row.metadata ?? {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SchoolContributionsService {
  static async record(
    supabase: SupabaseClient,
    schoolId: string,
    input: RecordContributionInput
  ): Promise<{ id: string | null; error: string | null }> {
    if (!input.kind) return { id: null, error: 'kind is required' };
    if (!input.description) return { id: null, error: 'description is required' };
    if (input.valueInr != null && input.valueInr < 0) {
      return { id: null, error: 'valueInr must be >= 0' };
    }

    const { data, error } = await supabase.rpc('fn_school_contribution_record', {
      p_school_id: schoolId,
      p_kind: input.kind,
      p_description: input.description,
      p_value_inr: input.valueInr ?? null,
      p_delivered_at: input.deliveredAt ?? null,
      p_program_partner_id: input.programPartnerId ?? null,
      p_evidence_url: input.evidenceUrl ?? null,
    });

    if (error) {
      logger.error(LOG, 'fn_school_contribution_record failed', error);
      return { id: null, error: error.message };
    }
    return { id: (data as string) ?? null, error: null };
  }

  static async listForSchool(
    supabase: SupabaseClient,
    schoolId: string,
    limit = 50,
    offset = 0
  ): Promise<{ rows: SchoolContribution[]; error: string | null }> {
    const { data, error } = await supabase
      .from('school_contributions')
      .select('*, program_partners(name)')
      .eq('school_id', schoolId)
      .order('delivered_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      logger.error(LOG, 'listForSchool failed', error);
      return { rows: [], error: error.message };
    }

    const rows = (data ?? []).map((r) => mapContributionRow(r as SchoolContributionRow));
    return { rows, error: null };
  }
}
