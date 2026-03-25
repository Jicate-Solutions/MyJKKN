// lib/services/admission/group-dashboard-service.ts
// Cross-institution admission metrics and group-level analytics

import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  GroupDashboardData,
  InstitutionAdmissionSummary,
  CrossCampusDuplicate,
} from '@/types/admission-workflow-config';

export class GroupDashboardService {
  private static supabase = createClientSupabaseClient();

  /**
   * Get admission summary across all institutions the user has access to
   */
  static async getGroupDashboard(): Promise<GroupDashboardData> {
    // Get all institutions the user has access to
    const { data: institutions, error: instError } = await this.supabase
      .from('institutions')
      .select('id, name');

    if (instError) {
      console.error('[admission/group] Failed to fetch institutions:', instError);
      throw instError;
    }

    if (!institutions || institutions.length === 0) {
      return {
        institutions: [],
        totals: {
          total_leads: 0,
          total_applied: 0,
          total_enrolled: 0,
          total_seats: 0,
          overall_fill_percentage: 0,
        },
      };
    }

    const institutionIds = institutions.map((i) => i.id);

    // Get lead counts per institution per stage
    const { data: leadsData, error: leadsError } = await (this.supabase as any)
      .from('admission_leads')
      .select('institution_id, funnel_stage')
      .in('institution_id', institutionIds);

    if (leadsError) {
      console.error('[admission/group] Failed to fetch leads:', leadsError);
      throw leadsError;
    }

    // Get seat configs
    const currentYear = new Date().getFullYear();
    const academicYear = `${currentYear}-${(currentYear + 1).toString().slice(2)}`;

    const { data: seatData } = await (this.supabase as any)
      .from('institution_seat_config')
      .select('institution_id, total_seats')
      .in('institution_id', institutionIds)
      .eq('academic_year', academicYear);

    // Aggregate by institution
    const leadsByInst = new Map<string, { total: number; applied: number; enrolled: number }>();
    for (const lead of (leadsData || []) as { institution_id: string; funnel_stage: string }[]) {
      const current = leadsByInst.get(lead.institution_id) || { total: 0, applied: 0, enrolled: 0 };
      current.total += 1;
      if (['application_submitted', 'documents_pending', 'documents_verified',
        'interview_scheduled', 'interview_completed', 'offer_sent',
        'offer_accepted', 'token_paid', 'enrolled'].includes(lead.funnel_stage)) {
        current.applied += 1;
      }
      if (lead.funnel_stage === 'enrolled') {
        current.enrolled += 1;
      }
      leadsByInst.set(lead.institution_id, current);
    }

    const seatsByInst = new Map<string, number>();
    for (const seat of (seatData || []) as { institution_id: string; total_seats: number }[]) {
      const existing = seatsByInst.get(seat.institution_id) || 0;
      seatsByInst.set(seat.institution_id, existing + seat.total_seats);
    }

    // Build summaries
    const summaries: InstitutionAdmissionSummary[] = institutions.map((inst) => {
      const leads = leadsByInst.get(inst.id) || { total: 0, applied: 0, enrolled: 0 };
      const seats = seatsByInst.get(inst.id) || 0;
      return {
        institution_id: inst.id,
        institution_name: inst.name,
        total_leads: leads.total,
        applied: leads.applied,
        enrolled: leads.enrolled,
        total_seats: seats,
        fill_percentage: seats > 0 ? Math.round((leads.enrolled / seats) * 100) : 0,
      };
    });

    // Sort by enrolled descending
    summaries.sort((a, b) => b.enrolled - a.enrolled);

    // Calculate totals
    const totals = summaries.reduce(
      (acc, s) => ({
        total_leads: acc.total_leads + s.total_leads,
        total_applied: acc.total_applied + s.applied,
        total_enrolled: acc.total_enrolled + s.enrolled,
        total_seats: acc.total_seats + s.total_seats,
        overall_fill_percentage: 0,
      }),
      { total_leads: 0, total_applied: 0, total_enrolled: 0, total_seats: 0, overall_fill_percentage: 0 }
    );
    totals.overall_fill_percentage =
      totals.total_seats > 0
        ? Math.round((totals.total_enrolled / totals.total_seats) * 100)
        : 0;

    return { institutions: summaries, totals };
  }

  /**
   * Find cross-campus duplicate leads
   */
  static async findCrossCampusDuplicates(): Promise<CrossCampusDuplicate[]> {
    const { data, error } = await (this.supabase as any).rpc(
      'find_cross_campus_duplicates'
    );

    if (error) {
      // RPC may not exist - fall back to client-side query
      console.warn('[admission/group] Cross-campus dedup RPC not available, using fallback');
      return this.findDuplicatesFallback();
    }

    return (data || []) as CrossCampusDuplicate[];
  }

  private static async findDuplicatesFallback(): Promise<CrossCampusDuplicate[]> {
    // Simple fallback: find leads with same phone across institutions
    const { data, error } = await (this.supabase as any)
      .from('admission_leads')
      .select('id, institution_id, full_name, phone, email, funnel_stage')
      .not('funnel_stage', 'in', '("enrolled","lost")')
      .not('phone', 'is', null)
      .order('phone');

    if (error || !data) return [];

    const leads = data as {
      id: string;
      institution_id: string;
      full_name: string;
      phone: string;
      email: string | null;
      funnel_stage: string;
    }[];

    // Group by phone and find cross-institution matches
    const phoneMap = new Map<string, typeof leads>();
    for (const lead of leads) {
      if (!lead.phone) continue;
      const existing = phoneMap.get(lead.phone) || [];
      existing.push(lead);
      phoneMap.set(lead.phone, existing);
    }

    const duplicates: CrossCampusDuplicate[] = [];
    for (const [, group] of phoneMap) {
      if (group.length < 2) continue;
      // Check cross-institution
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (group[i].institution_id !== group[j].institution_id) {
            duplicates.push({
              lead_1_id: group[i].id,
              institution_1: group[i].institution_id,
              institution_1_name: '',
              lead_2_id: group[j].id,
              institution_2: group[j].institution_id,
              institution_2_name: '',
              full_name: group[i].full_name,
              phone: group[i].phone,
              confidence: group[i].email === group[j].email ? 1.0 : 0.9,
            });
          }
        }
      }
    }

    return duplicates.sort((a, b) => b.confidence - a.confidence);
  }
}
