/**
 * Sprint 2 — CDC Drive Service
 *
 * Handles the drive lifecycle: list / get / create / transition (with state-machine guards) /
 * cancel. Reads cdc_drives + cdc_drive_state_transitions + lookups.
 *
 * State machine: draft → announced → willingness_open → eligibility_locked →
 *   attendance_day → results_announced → closed, plus `cancelled` side-state.
 * Walk-in drive types may skip intermediate states (cdc_drive_types.skip_states).
 *
 * Design decisions locked in specs/myjkkn-cdc-module-2026-05-18.md (Round 2.4 + 3.2).
 * DB schema live on production since 2026-05-18 (PR #958).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CdcDrive,
  CdcDriveInsert,
  CdcDriveStatus,
  CdcDriveStateTransition,
  CdcDriveType,
  CdcDriveTransitionPayload,
  CdcRecruiter,
} from '@/types/cdc';
import { canTransition, CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';

// =====================================================================================
// List filters
// =====================================================================================

export interface CdcDriveFilters {
  status?: CdcDriveStatus | CdcDriveStatus[];
  recruiter_id?: string;
  drive_type_id?: string;
  institution_id?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

// =====================================================================================
// Drive Service
// =====================================================================================

export class CdcDriveService {
  // ----- List / Get -----

  static async listDrives(supabase: SupabaseClient, filters: CdcDriveFilters = {}) {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let q = supabase
      .from('cdc_drives')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      q = q.in('status', statuses);
    }
    if (filters.recruiter_id) q = q.eq('recruiter_id', filters.recruiter_id);
    if (filters.drive_type_id) q = q.eq('drive_type_id', filters.drive_type_id);
    if (filters.institution_id) q = q.contains('institutions', [filters.institution_id]);
    if (filters.search) q = q.ilike('title', `%${filters.search}%`);

    const { data, count, error } = await q;
    if (error) throw error;
    return {
      data: (data ?? []) as CdcDrive[],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    };
  }

  static async getDrive(supabase: SupabaseClient, id: string): Promise<CdcDrive | null> {
    const { data, error } = await supabase
      .from('cdc_drives')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data as CdcDrive | null;
  }

  /**
   * Get drive + state transition history + willingness count + linked recruiter + drive type.
   * Single round-trip pattern for the detail page.
   */
  static async getDriveDetail(supabase: SupabaseClient, id: string) {
    const drive = await this.getDrive(supabase, id);
    if (!drive) return null;

    const [transitionsRes, willingnessRes, recruiterRes, driveTypeRes] = await Promise.all([
      supabase
        .from('cdc_drive_state_transitions')
        .select('*')
        .eq('drive_id', id)
        .order('transitioned_at', { ascending: true }),
      supabase
        .from('cdc_drive_willingness')
        .select('*', { count: 'exact', head: true })
        .eq('drive_id', id),
      supabase
        .from('cdc_recruiters')
        .select('*')
        .eq('id', drive.recruiter_id)
        .maybeSingle(),
      supabase
        .from('cdc_drive_types')
        .select('*')
        .eq('id', drive.drive_type_id)
        .maybeSingle(),
    ]);

    return {
      data: drive,
      state_transitions: (transitionsRes.data ?? []) as CdcDriveStateTransition[],
      willingness_count: willingnessRes.count ?? 0,
      recruiter: (recruiterRes.data ?? null) as CdcRecruiter | null,
      drive_type: (driveTypeRes.data ?? null) as CdcDriveType | null,
    };
  }

  // ----- Create -----

  /**
   * Create a new drive in `draft` status. Caller must be cdc_head, cdc_coordinator,
   * or super_admin (enforced by RLS on cdc_drives INSERT policy).
   */
  static async createDrive(
    supabase: SupabaseClient,
    payload: CdcDriveInsert,
    createdBy: string
  ): Promise<CdcDrive> {
    if (!payload.institutions || payload.institutions.length === 0) {
      throw new Error('Drive must target at least one institution');
    }

    const insertPayload: Record<string, unknown> = {
      recruiter_id: payload.recruiter_id,
      drive_type_id: payload.drive_type_id,
      title: payload.title,
      description: payload.description ?? null,
      institutions: payload.institutions,
      status: 'draft',
      rounds_count: payload.rounds_count ?? 1,
      // Venue mode (BUG-004045) + off-campus live-location link (BUG-004096).
      drive_mode: payload.drive_mode ?? 'on_campus',
      location_url: payload.location_url ?? null,
      drive_date: payload.drive_date ?? null,
      drive_start_time: payload.drive_start_time ?? null,
      drive_end_time: payload.drive_end_time ?? null,
      willingness_window_open_at: payload.willingness_window_open_at ?? null,
      willingness_window_close_at: payload.willingness_window_close_at ?? null,
      venue_label: payload.venue_label ?? null,
      venue_reservation_id: payload.venue_reservation_id ?? null,
      coordinator_approval_deadline_hours: payload.coordinator_approval_deadline_hours ?? null,
      industry_mentor_id: payload.industry_mentor_id ?? null,
      expected_package_lpa: payload.expected_package_lpa ?? null,
      job_role_title: payload.job_role_title ?? null,
      job_location: payload.job_location ?? null,
      created_by: createdBy,
    };

    const { data, error } = await supabase
      .from('cdc_drives')
      .insert(insertPayload)
      .select()
      .single();
    if (error) throw error;
    return data as CdcDrive;
  }

  // ----- State transitions (state-machine guarded) -----

  /**
   * Transition a drive to a new state. Validates against CDC_DRIVE_STATE_GRAPH and the
   * drive type's `skip_states` jsonb column (Round 3.2 walk-in support).
   *
   * Two-step pattern:
   *   1. UPDATE cdc_drives.status (DB CHECK enforces enum membership; we enforce graph)
   *   2. INSERT cdc_drive_state_transitions (audit row — substrate trigger may already do this,
   *      but we INSERT explicitly so the row has the right `reason` + `transitioned_by`)
   *
   * If `to_status === 'cancelled'`, we also write `cancelled_at`/`cancelled_by`/
   * `cancellation_reason` on the drive row.
   */
  static async transitionDrive(
    supabase: SupabaseClient,
    driveId: string,
    payload: CdcDriveTransitionPayload,
    transitionedBy: string
  ): Promise<CdcDrive> {
    const drive = await this.getDrive(supabase, driveId);
    if (!drive) throw new Error('Drive not found');

    // Fetch drive type to check skip_states for walk-in support
    const { data: driveType, error: dtErr } = await supabase
      .from('cdc_drive_types')
      .select('skip_states')
      .eq('id', drive.drive_type_id)
      .maybeSingle();
    if (dtErr) throw dtErr;
    const skipStates = (driveType?.skip_states as string[] | null) ?? null;

    if (!canTransition(drive.status, payload.to_status, skipStates)) {
      throw new Error(
        `Invalid transition: ${CDC_DRIVE_STATUS_LABELS[drive.status]} → ${CDC_DRIVE_STATUS_LABELS[payload.to_status]} not allowed`
      );
    }

    const now = new Date().toISOString();
    const driveUpdate: Record<string, unknown> = {
      status: payload.to_status,
      updated_at: now,
      updated_by: transitionedBy,
    };
    if (payload.to_status === 'cancelled') {
      driveUpdate.cancelled_at = now;
      driveUpdate.cancelled_by = transitionedBy;
      driveUpdate.cancellation_reason = payload.reason ?? null;
    }

    const { data: updated, error: updateErr } = await supabase
      .from('cdc_drives')
      .update(driveUpdate)
      .eq('id', driveId)
      .select()
      .single();
    if (updateErr) throw updateErr;

    // Insert audit row (substrate may have a trigger; explicit INSERT ensures reason + actor)
    const { error: insErr } = await supabase
      .from('cdc_drive_state_transitions')
      .insert({
        drive_id: driveId,
        from_status: drive.status,
        to_status: payload.to_status,
        transitioned_by: transitionedBy,
        transitioned_at: now,
        reason: payload.reason ?? null,
        metadata: payload.metadata ?? null,
      });
    if (insErr) {
      // Non-fatal: state already changed; surface but don't roll back
      console.warn('[cdc/drive-service] state transition audit insert failed:', insErr);
    }

    return updated as CdcDrive;
  }

  /**
   * Convenience wrapper: cancel a drive (any status → cancelled).
   */
  static async cancelDrive(
    supabase: SupabaseClient,
    driveId: string,
    reason: string,
    cancelledBy: string
  ): Promise<CdcDrive> {
    return this.transitionDrive(
      supabase,
      driveId,
      { to_status: 'cancelled', reason },
      cancelledBy
    );
  }
}

// =====================================================================================
// Lookup Service — drive types, sectors, offer types, recruiters
// =====================================================================================

export class CdcLookupService {
  static async getAll(supabase: SupabaseClient) {
    const [driveTypesRes, sectorsRes, offerTypesRes, recruitersRes] = await Promise.all([
      supabase
        .from('cdc_drive_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('cdc_industry_sectors')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('cdc_offer_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('cdc_recruiters')
        .select('*')
        .eq('is_active', true)
        .eq('is_blacklisted', false)
        .order('name', { ascending: true }),
    ]);

    if (driveTypesRes.error) throw driveTypesRes.error;
    if (sectorsRes.error) throw sectorsRes.error;
    if (offerTypesRes.error) throw offerTypesRes.error;
    if (recruitersRes.error) throw recruitersRes.error;

    return {
      drive_types: driveTypesRes.data ?? [],
      industry_sectors: sectorsRes.data ?? [],
      offer_types: offerTypesRes.data ?? [],
      recruiters: recruitersRes.data ?? [],
    };
  }
}
