/**
 * CDC Sprint 7b — Operational Dashboard Service
 *
 * Aggregation queries for the Director-facing /cdc/admin/dashboard page.
 * Each function is small and returns a typed result so widgets can be
 * loaded independently (one React Query key per widget).
 *
 * All queries are read-only COUNT/SELECT against cdc_* tables; no schema
 * changes, no new RPCs. RLS already restricts these tables to CDC staff +
 * super-admin via existing policies (substrate_02 + substrate_03).
 *
 * Created: 2026-05-19 (T1.3)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { CDC_DRIVE_STATUS_LABELS, type CdcDriveStatus } from '@/types/cdc';

// =====================================================================================
// Result types
// =====================================================================================

export interface CdcDashboardKpis {
  drivesInFlight: number;          // status NOT IN (draft, closed, cancelled)
  pendingWillingness: number;      // willingness rows where status = 'willing' AND confirmed_at IS NULL
  placementsYtd: number;           // cdc_placements created since Jan 1 current year
  overdueCoordinatorItems: number; // cdc_coordinator_overdue_log where resolved_at IS NULL
}

export interface CdcDriveStatusBucket {
  status: CdcDriveStatus;
  label: string;
  count: number;
}

export interface CdcTopRecruiter {
  recruiterId: string;
  name: string;
  placementCount: number;
}

export interface CdcIdpInstitutionRow {
  institutionId: string;
  institutionName: string;
  idpSubmissionsYtd: number;
}

export interface CdcTrainingEnrollmentsYtd {
  count: number;
}

// =====================================================================================
// Helpers
// =====================================================================================

function startOfYearIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();
}

function currentAcademicYearLabel(): string {
  // Indian academic year — runs roughly Jun→May. If we're in Jan-May, the
  // current AY started in the previous calendar year.
  const now = new Date();
  const month = now.getUTCMonth(); // 0-indexed
  const startYear = month < 5 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYearShort}`;
}

// =====================================================================================
// Service
// =====================================================================================

export class CdcDashboardService {
  // ----- KPI Cards -----

  static async getDrivesInFlight(supabase: SupabaseClient): Promise<number> {
    const { count, error } = await supabase
      .from('cdc_drives')
      .select('id', { count: 'exact', head: true })
      .not('status', 'in', '(draft,closed,cancelled)');
    if (error) throw error;
    return count ?? 0;
  }

  static async getPendingWillingness(supabase: SupabaseClient): Promise<number> {
    const { count, error } = await supabase
      .from('cdc_drive_willingness')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'willing')
      .is('confirmed_at', null);
    if (error) throw error;
    return count ?? 0;
  }

  static async getPlacementsYtd(supabase: SupabaseClient): Promise<number> {
    const { count, error } = await supabase
      .from('cdc_placements')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfYearIso());
    if (error) throw error;
    return count ?? 0;
  }

  static async getOverdueCoordinatorItems(supabase: SupabaseClient): Promise<number> {
    const { count, error } = await supabase
      .from('cdc_coordinator_overdue_log')
      .select('id', { count: 'exact', head: true })
      .is('resolved_at', null);
    if (error) throw error;
    return count ?? 0;
  }

  static async getKpis(supabase: SupabaseClient): Promise<CdcDashboardKpis> {
    const [drivesInFlight, pendingWillingness, placementsYtd, overdueCoordinatorItems] =
      await Promise.all([
        this.getDrivesInFlight(supabase),
        this.getPendingWillingness(supabase),
        this.getPlacementsYtd(supabase),
        this.getOverdueCoordinatorItems(supabase),
      ]);
    return { drivesInFlight, pendingWillingness, placementsYtd, overdueCoordinatorItems };
  }

  // ----- Drives by Status -----

  static async getDrivesByStatus(supabase: SupabaseClient): Promise<CdcDriveStatusBucket[]> {
    // One query that pulls just the status column, then we bucket client-side.
    // Avoids needing a new aggregation RPC for a small-volume table.
    const { data, error } = await supabase
      .from('cdc_drives')
      .select('status');
    if (error) throw error;

    const buckets: Record<CdcDriveStatus, number> = {
      draft: 0,
      announced: 0,
      willingness_open: 0,
      eligibility_locked: 0,
      attendance_day: 0,
      results_announced: 0,
      closed: 0,
      cancelled: 0,
    };

    for (const row of (data ?? []) as Array<{ status: CdcDriveStatus }>) {
      if (row.status && buckets[row.status] !== undefined) {
        buckets[row.status] += 1;
      }
    }

    return (Object.keys(buckets) as CdcDriveStatus[]).map((status) => ({
      status,
      label: CDC_DRIVE_STATUS_LABELS[status],
      count: buckets[status],
    }));
  }

  // ----- Top Recruiters by Placement Count -----

  static async getTopRecruiters(
    supabase: SupabaseClient,
    limit = 5
  ): Promise<CdcTopRecruiter[]> {
    // Pull recruiter_id from placements; aggregate client-side; join names from cdc_recruiters.
    // Small dataset (recruiter cardinality << placement cardinality), so this is fine.
    const { data, error } = await supabase
      .from('cdc_placements')
      .select('recruiter_id');
    if (error) throw error;

    const counts = new Map<string, number>();
    for (const row of (data ?? []) as Array<{ recruiter_id: string | null }>) {
      if (!row.recruiter_id) continue;
      counts.set(row.recruiter_id, (counts.get(row.recruiter_id) ?? 0) + 1);
    }

    const top = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    if (top.length === 0) return [];

    const ids = top.map(([id]) => id);
    const { data: recruiters, error: recErr } = await supabase
      .from('cdc_recruiters')
      .select('id, name')
      .in('id', ids);
    if (recErr) throw recErr;

    const nameById = new Map(
      ((recruiters ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r.name])
    );

    return top.map(([recruiterId, placementCount]) => ({
      recruiterId,
      name: nameById.get(recruiterId) ?? '(unknown)',
      placementCount,
    }));
  }

  // ----- IDP Submission Rate by Institution -----

  static async getIdpByInstitution(
    supabase: SupabaseClient
  ): Promise<CdcIdpInstitutionRow[]> {
    // cdc_idp_responses links to learners_profiles → institutions.
    // Indirect join via Supabase relation syntax.
    const ayLabel = currentAcademicYearLabel();
    const { data, error } = await supabase
      .from('cdc_idp_responses')
      .select('learner:learners_profiles!inner(institution_id)')
      .eq('academic_year_label', ayLabel);
    if (error) throw error;

    type Row = { learner: { institution_id: string | null } | null };
    const counts = new Map<string, number>();
    for (const row of (data ?? []) as unknown as Row[]) {
      const instId = row.learner?.institution_id;
      if (!instId) continue;
      counts.set(instId, (counts.get(instId) ?? 0) + 1);
    }

    if (counts.size === 0) return [];

    const ids = Array.from(counts.keys());
    const { data: institutions, error: instErr } = await supabase
      .from('institutions')
      .select('id, name')
      .in('id', ids);
    if (instErr) throw instErr;

    const nameById = new Map(
      ((institutions ?? []) as Array<{ id: string; name: string }>).map((i) => [i.id, i.name])
    );

    return Array.from(counts.entries())
      .map(([institutionId, idpSubmissionsYtd]) => ({
        institutionId,
        institutionName: nameById.get(institutionId) ?? '(unknown)',
        idpSubmissionsYtd,
      }))
      .sort((a, b) => b.idpSubmissionsYtd - a.idpSubmissionsYtd);
  }

  // ----- Training Enrollments YTD -----

  static async getTrainingEnrollmentsYtd(
    supabase: SupabaseClient
  ): Promise<CdcTrainingEnrollmentsYtd> {
    const { count, error } = await supabase
      .from('cdc_training_enrollments')
      .select('id', { count: 'exact', head: true })
      .gte('enrolled_at', startOfYearIso());
    if (error) throw error;
    return { count: count ?? 0 };
  }
}
