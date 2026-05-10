// lib/services/admission/lead-distribution-service.ts
//
// Per-counselor lead distribution and progression for a given source.
// Powers the "Lead Distribution" tab on the source detail page.

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import type { LeadSourceEnum } from './source-master-service';

export interface CounselorDistribution {
  counselor_id: string | null;       // admission_counselors.id (null = unassigned bucket)
  user_id: string | null;            // profiles.id of assignee
  name: string;
  email: string | null;
  designation: string | null;
  role_key: string | null;
  totalLeads: number;
  newLeads: number;                  // funnel_stage = 'new'
  progressedLeads: number;           // funnel_stage NOT in ('new', 'lost', 'not_reachable')
  conversions: number;               // funnel_stage in ('enrolled', 'confirmed')
  lostLeads: number;                 // funnel_stage = 'lost'
  conversionRate: number;            // 0..100
  progressionRate: number;           // 0..100 — how many made it past 'new'
  lastAssignedAt: string | null;
}

export interface DistributionSummary {
  totalLeads: number;
  totalAssigned: number;
  totalUnassigned: number;
  totalConversions: number;
  totalProgressed: number;
  conversionRate: number;
  progressionRate: number;
  uniqueCounselors: number;
}

export interface DistributionResult {
  summary: DistributionSummary;
  perCounselor: CounselorDistribution[];
}

interface GetDistributionInput {
  sourceEnum: LeadSourceEnum;
  fromDate?: Date | null;
  toDate?: Date | null;
  institutionId?: string | null;
}

const NEW_STAGE = 'new';
const CONVERSION_STAGES = ['enrolled', 'confirmed'] as const;
const FAILED_STAGES = ['lost', 'not_reachable'] as const;

export class LeadDistributionService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * Server-side aggregation via SQL function. Replaces a client-side bucket-
   * and-count that fetched up to 14k+ raw lead rows and silently capped at
   * the PostgREST 1000-row default — so for any source with >1000 leads the
   * panel was under-reporting.
   */
  static async get({
    sourceEnum,
    fromDate,
    toDate,
    institutionId,
  }: GetDistributionInput): Promise<DistributionResult> {
    const supabase = this.supabase;

    const { data: rows, error } = await (supabase as any).rpc(
      'get_source_distribution',
      {
        p_source: sourceEnum,
        p_from: fromDate ? fromDate.toISOString() : null,
        p_to: toDate
          ? (() => {
              const end = new Date(toDate);
              end.setHours(23, 59, 59, 999);
              return end.toISOString();
            })()
          : null,
        p_institution_id: institutionId ?? null,
      }
    );

    if (error) {
      logger.error('admissions', 'Error fetching distribution rows', error);
      throw error;
    }

    type AggRow = {
      counselor_id: string | null;
      user_id: string | null;
      counselor_name: string | null;
      counselor_email: string | null;
      counselor_designation: string | null;
      total_leads: number | string;
      new_leads: number | string;
      progressed_leads: number | string;
      conversions: number | string;
      lost_leads: number | string;
      last_assigned_at: string | null;
    };

    const aggRows = (rows ?? []) as AggRow[];

    const userIds = aggRows
      .map((r) => r.user_id)
      .filter((u): u is string => !!u);
    const roleMap = await this.getRoleKeysByUserIds(userIds);

    let totalConversions = 0;
    let totalProgressed = 0;
    let totalAssigned = 0;
    let totalUnassigned = 0;
    let totalLeads = 0;

    const perCounselor: CounselorDistribution[] = aggRows.map((r) => {
      const total = Number(r.total_leads) || 0;
      const news = Number(r.new_leads) || 0;
      const progressed = Number(r.progressed_leads) || 0;
      const conversions = Number(r.conversions) || 0;
      const lost = Number(r.lost_leads) || 0;
      const isUnassigned = !r.user_id;

      totalLeads += total;
      if (isUnassigned) totalUnassigned += total;
      else totalAssigned += total;
      totalConversions += conversions;
      totalProgressed += progressed + conversions;

      return {
        counselor_id: r.counselor_id ?? null,
        user_id: r.user_id ?? null,
        name:
          r.counselor_name ??
          (isUnassigned ? 'Unassigned' : 'Unknown user'),
        email: r.counselor_email ?? null,
        designation: r.counselor_designation ?? null,
        role_key: r.user_id ? (roleMap.get(r.user_id) ?? null) : null,
        totalLeads: total,
        newLeads: news,
        progressedLeads: progressed,
        conversions,
        lostLeads: lost,
        conversionRate:
          total > 0 ? Math.round((conversions / total) * 1000) / 10 : 0,
        progressionRate:
          total > 0
            ? Math.round(((progressed + conversions) / total) * 1000) / 10
            : 0,
        lastAssignedAt: r.last_assigned_at ?? null,
      };
    });

    perCounselor.sort((a, b) => {
      if (!a.user_id && b.user_id) return 1;
      if (a.user_id && !b.user_id) return -1;
      return b.totalLeads - a.totalLeads;
    });

    return {
      summary: {
        totalLeads,
        totalAssigned,
        totalUnassigned,
        totalConversions,
        totalProgressed,
        conversionRate:
          totalLeads > 0
            ? Math.round((totalConversions / totalLeads) * 1000) / 10
            : 0,
        progressionRate:
          totalLeads > 0
            ? Math.round((totalProgressed / totalLeads) * 1000) / 10
            : 0,
        uniqueCounselors: perCounselor.filter((p) => p.user_id).length,
      },
      perCounselor,
    };
  }

  private static async getRoleKeysByUserIds(
    userIds: string[]
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (userIds.length === 0) return out;
    // SECURITY DEFINER RPC bypasses RLS on user_roles/custom_roles. Same fix
    // pattern as use-eligible-counselors and counselor-source-service —
    // admission-office users can read their own role memberships, not other
    // users', so a client-side join silently produced empty role badges.
    // Introduced in migration 20260509170000_admission_counselor_role_lookup_helper.sql.
    const { data, error } = await (this.supabase as any).rpc(
      'get_counselor_role_keys_for_users',
      { p_user_ids: userIds }
    );
    if (error) return out;
    for (const row of (data ?? []) as {
      user_id: string;
      role_key: string;
      role_name: string;
    }[]) {
      if (row.user_id && row.role_key) out.set(row.user_id, row.role_key);
    }
    return out;
  }
}
