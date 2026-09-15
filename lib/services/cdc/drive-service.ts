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
  CdcDriveCircular,
  CdcDriveEligibility,
  CdcDriveEligibilityInput,
  CdcDriveInsert,
  CdcDriveStatus,
  CdcDriveStateTransition,
  CdcDriveType,
  CdcDriveTransitionPayload,
  CdcDriveUpdate,
  CdcRecruiter,
} from '@/types/cdc';
import { canTransition, CDC_DRIVE_STATUS_LABELS } from '@/types/cdc';
import { normalizeInstitutionSemesters } from './drive-targeting';

/** Map the flat circular_* columns to the API's CdcDriveCircular shape (null when none). */
export function driveCircularOf(drive: CdcDrive): CdcDriveCircular | null {
  if (!drive.circular_drive_file_id) return null;
  return {
    drive_file_id: drive.circular_drive_file_id,
    file_name: drive.circular_file_name ?? 'circular',
    mime_type: drive.circular_mime_type ?? 'application/octet-stream',
    size_bytes: drive.circular_size_bytes ?? null,
    url: drive.campus_circular_url ?? null,
    uploaded_at: drive.circular_uploaded_at ?? null,
    uploaded_by: drive.circular_uploaded_by ?? null,
  };
}

/** Map cdc_drives CHECK-constraint violations to messages a coordinator can act on. */
function friendlyDriveError(error: { code?: string; message?: string }): Error {
  const msg = error.message ?? '';
  if (error.code === '23514') {
    if (msg.includes('cdc_drives_drive_times_sane')) {
      return new Error('End time must be after the start time');
    }
    if (msg.includes('cdc_drives_willingness_window_sane')) {
      return new Error('Willingness window close must be after its open time');
    }
    if (msg.includes('rounds_count')) {
      return new Error('Rounds count must be between 1 and 10');
    }
    if (msg.includes('min_cgpa')) return new Error('Minimum CGPA must be between 0 and 10');
    if (msg.includes('arrears')) return new Error('Maximum arrears cannot be negative');
  }
  return error instanceof Error ? error : Object.assign(new Error(msg || 'Database error'), error);
}

function circularColumns(
  circular: CdcDriveCircular | null | undefined,
  actorId: string
): Record<string, unknown> {
  if (circular === undefined) return {};
  if (circular === null) {
    return {
      circular_drive_file_id: null,
      circular_file_name: null,
      circular_mime_type: null,
      circular_size_bytes: null,
      circular_uploaded_at: null,
      circular_uploaded_by: null,
      campus_circular_url: null,
    };
  }
  return {
    circular_drive_file_id: circular.drive_file_id,
    circular_file_name: circular.file_name,
    circular_mime_type: circular.mime_type,
    circular_size_bytes: circular.size_bytes ?? null,
    circular_uploaded_at: circular.uploaded_at ?? new Date().toISOString(),
    circular_uploaded_by: circular.uploaded_by ?? actorId,
    campus_circular_url: circular.url ?? null,
  };
}

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

    const [transitionsRes, willingnessRes, willingRes, institutionsRes, recruiterRes, driveTypeRes, eligibilityRes, logRes] = await Promise.all([
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
        .from('cdc_drive_willingness')
        .select('*', { count: 'exact', head: true })
        .eq('drive_id', id)
        .in('status', ['willing', 'confirmed']),
      drive.institutions.length > 0
        ? supabase.from('institutions').select('id, name').in('id', drive.institutions)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }>, error: null }),
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
      supabase.from('cdc_drive_eligibility').select('*').eq('drive_id', id).maybeSingle(),
      supabase
        .from('cdc_drive_notification_log')
        .select('status, push_status, sent_at')
        .eq('drive_id', id)
        .eq('notification_type', 'cdc.drive.willingness_open')
        .limit(50000),
    ]);

    const notification_summary = {
      sent: 0,
      no_profile: 0,
      push_delivered: 0,
      push_failed: 0,
      no_subscription: 0,
      last_sent_at: null as string | null,
    };
    for (const r of (logRes.data ?? []) as Array<{ status: string; push_status: string | null; sent_at: string }>) {
      if (r.status === 'sent') notification_summary.sent += 1;
      if (r.status === 'no_profile') notification_summary.no_profile += 1;
      if (r.push_status === 'delivered') notification_summary.push_delivered += 1;
      if (r.push_status === 'failed' || r.push_status === 'stale_removed') notification_summary.push_failed += 1;
      if (r.push_status === 'no_subscription' || r.push_status === 'opted_out') notification_summary.no_subscription += 1;
      if (!notification_summary.last_sent_at || r.sent_at > notification_summary.last_sent_at) {
        notification_summary.last_sent_at = r.sent_at;
      }
    }

    const institution_names: Record<string, string> = {};
    for (const row of (institutionsRes.data ?? []) as Array<{ id: string; name: string }>) {
      institution_names[row.id] = row.name;
    }

    return {
      data: drive,
      state_transitions: (transitionsRes.data ?? []) as CdcDriveStateTransition[],
      willingness_count: willingnessRes.count ?? 0,
      willing_count: willingRes.count ?? 0,
      recruiter: (recruiterRes.data ?? null) as CdcRecruiter | null,
      drive_type: (driveTypeRes.data ?? null) as CdcDriveType | null,
      institution_names,
      eligibility: (eligibilityRes.data ?? null) as CdcDriveEligibility | null,
      notification_summary,
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
      institution_semesters: normalizeInstitutionSemesters(
        payload.institution_semesters,
        payload.institutions
      ),
      ...circularColumns(payload.circular, createdBy),
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
    if (error) throw friendlyDriveError(error);
    const created = data as CdcDrive;
    if (payload.eligibility) {
      await this.upsertEligibility(supabase, created.id, payload.eligibility, createdBy);
    }
    return created;
  }

  // ----- Update (audience / circular / details) -----

  /**
   * Partial update. Institutions + semester targeting may change in any
   * non-terminal state; when the drive is already open for willingness the
   * caller (PATCH route) notifies ONLY the newly eligible learners
   * (cdc_drive_notification_log is the duplicate guard). The circular can be
   * replaced / removed at any time. RLS (cdc_drives_write -> is_cdc_staff)
   * still gates the write.
   */
  static async updateDrive(
    supabase: SupabaseClient,
    driveId: string,
    payload: CdcDriveUpdate,
    updatedBy: string
  ): Promise<{ drive: CdcDrive; targeting_changed: boolean }> {
    const drive = await this.getDrive(supabase, driveId);
    if (!drive) throw new Error('Drive not found');
    if (drive.status === 'closed' || drive.status === 'cancelled') {
      throw new Error(`A ${CDC_DRIVE_STATUS_LABELS[drive.status].toLowerCase()} drive cannot be edited`);
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    };

    let targeting_changed = false;
    if (payload.institutions !== undefined || payload.institution_semesters !== undefined) {
      const institutions = payload.institutions ?? drive.institutions;
      if (!institutions || institutions.length === 0) {
        throw new Error('Drive must target at least one institution');
      }
      const nextTargeting = normalizeInstitutionSemesters(
        payload.institution_semesters ?? drive.institution_semesters,
        institutions
      );
      targeting_changed =
        JSON.stringify([...institutions].sort()) !== JSON.stringify([...drive.institutions].sort()) ||
        JSON.stringify(nextTargeting) !==
          JSON.stringify(normalizeInstitutionSemesters(drive.institution_semesters, drive.institutions));
      update.institutions = institutions;
      update.institution_semesters = nextTargeting;
    }

    if (payload.title !== undefined) {
      if (!payload.title.trim()) throw new Error('Title is required');
      update.title = payload.title.trim();
    }
    if (payload.recruiter_id !== undefined) update.recruiter_id = payload.recruiter_id;
    if (payload.drive_type_id !== undefined) update.drive_type_id = payload.drive_type_id;
    if (payload.description !== undefined) update.description = payload.description;
    if (payload.rounds_count !== undefined) update.rounds_count = payload.rounds_count;
    if (payload.drive_mode !== undefined) {
      update.drive_mode = payload.drive_mode;
      update.location_url = payload.drive_mode === 'off_campus' ? (payload.location_url ?? drive.location_url) : null;
    } else if (payload.location_url !== undefined) {
      update.location_url = payload.location_url;
    }
    if (payload.drive_date !== undefined) update.drive_date = payload.drive_date;
    if (payload.drive_start_time !== undefined) update.drive_start_time = payload.drive_start_time;
    if (payload.drive_end_time !== undefined) update.drive_end_time = payload.drive_end_time;
    if (payload.willingness_window_close_at !== undefined) {
      update.willingness_window_close_at = payload.willingness_window_close_at;
    }
    if (payload.venue_label !== undefined) update.venue_label = payload.venue_label;
    if (payload.expected_package_lpa !== undefined) update.expected_package_lpa = payload.expected_package_lpa;
    if (payload.job_role_title !== undefined) update.job_role_title = payload.job_role_title;
    if (payload.job_location !== undefined) update.job_location = payload.job_location;
    Object.assign(update, circularColumns(payload.circular, updatedBy));

    const { data, error } = await supabase
      .from('cdc_drives')
      .update(update)
      .eq('id', driveId)
      .select()
      .single();
    if (error) throw friendlyDriveError(error);

    if (payload.eligibility !== undefined) {
      await this.upsertEligibility(supabase, driveId, payload.eligibility, updatedBy);
    }

    return { drive: data as CdcDrive, targeting_changed };
  }

  /**
   * Eligibility thresholds (cdc_drive_eligibility, UNIQUE per drive). These are
   * informational for learners on the willingness page; the AUDIENCE is
   * institution_semesters. program_ids stays as-is (legacy drives) or empty.
   */
  static async upsertEligibility(
    supabase: SupabaseClient,
    driveId: string,
    input: CdcDriveEligibilityInput | null,
    actorId: string
  ): Promise<void> {
    if (input === null) {
      const { error } = await supabase.from('cdc_drive_eligibility').delete().eq('drive_id', driveId);
      if (error) throw error;
      return;
    }
    const { data: existing } = await supabase
      .from('cdc_drive_eligibility')
      .select('id, program_ids')
      .eq('drive_id', driveId)
      .maybeSingle();
    const now = new Date().toISOString();
    const row: Record<string, unknown> = {
      drive_id: driveId,
      min_cgpa: input.min_cgpa ?? null,
      max_arrears: input.max_arrears ?? null,
      min_semester: input.min_semester ?? null,
      passed_out_allowed: input.passed_out_allowed ?? false,
      additional_notes: input.additional_notes ?? null,
      updated_at: now,
      updated_by: actorId,
    };
    if (existing) {
      const { error } = await supabase.from('cdc_drive_eligibility').update(row).eq('id', existing.id);
      if (error) throw friendlyDriveError(error);
    } else {
      const { error } = await supabase
        .from('cdc_drive_eligibility')
        .insert({ ...row, program_ids: [], created_by: actorId });
      if (error) throw friendlyDriveError(error);
    }
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
