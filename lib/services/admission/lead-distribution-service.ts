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

  static async get({
    sourceEnum,
    fromDate,
    toDate,
    institutionId,
  }: GetDistributionInput): Promise<DistributionResult> {
    const supabase = this.supabase;

    let q = (supabase as any)
      .from('admission_leads')
      .select('id, source, funnel_stage, assigned_counselor_id, assigned_at, created_at, institution_id')
      .eq('source', sourceEnum);

    if (fromDate) q = q.gte('created_at', fromDate.toISOString());
    if (toDate) {
      const endOfDay = new Date(toDate);
      endOfDay.setHours(23, 59, 59, 999);
      q = q.lte('created_at', endOfDay.toISOString());
    }
    if (institutionId) q = q.eq('institution_id', institutionId);

    const { data: leads, error } = await q;
    if (error) {
      logger.error('admissions', 'Error fetching distribution leads', error);
      throw error;
    }

    type LeadRow = {
      id: string;
      source: string;
      funnel_stage: string | null;
      assigned_counselor_id: string | null;
      assigned_at: string | null;
      created_at: string;
      institution_id: string | null;
    };

    const rows = (leads ?? []) as LeadRow[];

    // Bucket leads by user_id (assigned_counselor_id IS profiles.id)
    const buckets = new Map<string | null, LeadRow[]>();
    for (const r of rows) {
      const k = r.assigned_counselor_id;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(r);
    }

    // Pull counselor metadata for assigned bucket
    const userIds = Array.from(buckets.keys()).filter(
      (k): k is string => !!k
    );

    const counselorMap = new Map<
      string,
      {
        counselor_id: string;
        user_id: string;
        name: string;
        email: string | null;
        designation: string | null;
      }
    >();
    if (userIds.length > 0) {
      const { data: counselors } = await (supabase as any)
        .from('admission_counselors')
        .select('id, user_id, name, email, designation')
        .in('user_id', userIds);
      for (const c of (counselors ?? []) as {
        id: string;
        user_id: string;
        name: string;
        email: string | null;
        designation: string | null;
      }[]) {
        counselorMap.set(c.user_id, {
          counselor_id: c.id,
          user_id: c.user_id,
          name: c.name,
          email: c.email,
          designation: c.designation,
        });
      }
    }

    // Roles by user_id (for the role badge)
    const roleMap = await this.getRoleKeysByUserIds(userIds);

    const perCounselor: CounselorDistribution[] = [];
    let totalConversions = 0;
    let totalProgressed = 0;
    let totalAssigned = 0;
    let totalUnassigned = 0;

    for (const [userId, leadList] of buckets.entries()) {
      const totalLeads = leadList.length;
      const newLeads = leadList.filter((l) => l.funnel_stage === NEW_STAGE).length;
      const conversions = leadList.filter((l) =>
        CONVERSION_STAGES.includes(l.funnel_stage as (typeof CONVERSION_STAGES)[number])
      ).length;
      const lostLeads = leadList.filter((l) =>
        FAILED_STAGES.includes(l.funnel_stage as (typeof FAILED_STAGES)[number])
      ).length;
      const progressedLeads = totalLeads - newLeads - lostLeads;

      const lastAssignedAt =
        leadList
          .map((l) => l.assigned_at)
          .filter((t): t is string => !!t)
          .sort()
          .at(-1) ?? null;

      const c = userId ? counselorMap.get(userId) : null;
      const isUnassigned = !userId;

      if (isUnassigned) totalUnassigned += totalLeads;
      else totalAssigned += totalLeads;
      totalConversions += conversions;
      totalProgressed += progressedLeads + conversions;

      perCounselor.push({
        counselor_id: c?.counselor_id ?? null,
        user_id: userId ?? null,
        name: c?.name ?? (isUnassigned ? 'Unassigned' : 'Unknown user'),
        email: c?.email ?? null,
        designation: c?.designation ?? null,
        role_key: userId ? (roleMap.get(userId) ?? null) : null,
        totalLeads,
        newLeads,
        progressedLeads,
        conversions,
        lostLeads,
        conversionRate:
          totalLeads > 0 ? Math.round((conversions / totalLeads) * 1000) / 10 : 0,
        progressionRate:
          totalLeads > 0
            ? Math.round(((progressedLeads + conversions) / totalLeads) * 1000) / 10
            : 0,
        lastAssignedAt,
      });
    }

    // Sort: highest volume first, unassigned bucket last
    perCounselor.sort((a, b) => {
      if (!a.user_id && b.user_id) return 1;
      if (a.user_id && !b.user_id) return -1;
      return b.totalLeads - a.totalLeads;
    });

    const totalLeads = rows.length;

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
    const { data, error } = await (this.supabase as any)
      .from('user_roles')
      .select(`user_id, role:custom_roles!role_id ( role_key )`)
      .in('user_id', userIds);
    if (error) return out;
    const COUNSELOR_KEYS = new Set([
      'admission_counselor',
      'expo_counselor',
      'learner_counselor',
      'staff_counselor',
    ]);
    for (const row of (data ?? []) as {
      user_id: string;
      role: { role_key: string } | null;
    }[]) {
      const k = row.role?.role_key;
      if (!k) continue;
      if (COUNSELOR_KEYS.has(k) || !out.has(row.user_id)) {
        out.set(row.user_id, k);
      }
    }
    return out;
  }
}
