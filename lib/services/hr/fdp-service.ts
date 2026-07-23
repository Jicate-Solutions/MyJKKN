/**
 * HR FDP Service (T5.4) — Faculty Development Programme Extended
 *
 * Sits on top of TrainingService (T5.3 substrate). FDP-specific operations:
 * catalog browse, application lifecycle (applied → hod_approved →
 * director_approved → attended → completed), and FDP-specific session fields.
 *
 * Data model (NO parallel tables):
 *   - hr_training_sessions WHERE category='fdp'
 *       AND fdp_application_metadata->>'is_catalog' = 'true'
 *     → curated FDP catalog entries faculty can apply to.
 *   - hr_training_enrollments → application/enrollment rows with the
 *     extended status enum (applied/hod_approved/director_approved/rejected
 *     in addition to T5.3's registered/attended/completed/dropped).
 *   - hr_training_enrollments.application_log → append-only audit array.
 *
 * Spec: specs/hr-module-decomposition-2026-05-09.md §T5.4
 *
 * Methods:
 *   getCatalog            — FDP catalog entries faculty can browse + apply to
 *   getCatalogEntry       — single catalog row
 *   listApplications      — applications for a catalog entry OR a staff member
 *   getApplication        — single application row
 *   applyForFdp           — staff submits application (status='applied')
 *   advanceApplication    — HoD/Director move state forward or reject
 *
 * Apply lifecycle:
 *   applied
 *     → hod_approved          (HoD approves; advanceApplication target)
 *       → director_approved   (Director approves)
 *         → attended          (faculty attended; reuses T5.3 status)
 *           → completed       (certificate issued; reuses T5.3 status)
 *   any → rejected            (terminal; advanceApplication with target='rejected')
 *   any → dropped             (faculty withdraws; reuses T5.3 status)
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  HRTrainingSession,
  HRTrainingEnrollment,
  EnrollmentStatus,
} from './training-service';

// =====================================================================================
// Types
// =====================================================================================

export type SponsoringBody = 'UGC' | 'AICTE' | 'internal' | 'other';

/** FDP application states — superset of T5.3 EnrollmentStatus. */
export type FdpApplicationStatus =
  | 'applied'
  | 'hod_approved'
  | 'director_approved'
  | 'rejected'
  // Reused from T5.3 for the post-approval lifecycle
  | 'attended'
  | 'completed'
  | 'dropped';

/** Append-only entry written to enrollments.application_log. */
export interface FdpApplicationLogEntry {
  ts: string;
  from_status: FdpApplicationStatus | null;
  to_status: FdpApplicationStatus;
  actor_id: string | null;
  note: string | null;
}

/** Shape of fdp_application_metadata jsonb on hr_training_sessions. */
export interface FdpApplicationMetadata {
  is_catalog?: boolean;
  application_open_at?: string | null;
  application_close_at?: string | null;
  requires_hod_approval?: boolean;
  requires_director_approval?: boolean;
  // Free-form passthrough — extra keys allowed.
  [key: string]: unknown;
}

/** FDP catalog row — hr_training_sessions row narrowed for FDP usage. */
export interface FdpCatalogEntry extends HRTrainingSession {
  external_faculty_name: string | null;
  external_faculty_org: string | null;
  sponsoring_body: SponsoringBody | string | null;
  funding_amount: number | null;
  fdp_certificate_template_id: string | null;
  fdp_application_metadata: FdpApplicationMetadata;
}

const TABLE_SESSIONS = 'hr_training_sessions' as const;
const TABLE_ENROLLMENTS = 'hr_training_enrollments' as const;

// =====================================================================================
// Service
// =====================================================================================

export class FdpService {
  // ----- Catalog -----

  /**
   * Returns FDP catalog entries. Default: only rows flagged
   * `is_catalog=true` in fdp_application_metadata. Pass {includeUnpublished:true}
   * for the admin catalog index that wants to see drafts too.
   */
  static async getCatalog(
    supabase: SupabaseClient,
    args: { includeUnpublished?: boolean } = {},
  ): Promise<FdpCatalogEntry[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabase.from(TABLE_SESSIONS) as any)
      .select('*')
      .eq('category', 'fdp')
      .order('start_date', { ascending: false });

    if (!args.includeUnpublished) {
      // Postgres-jsonb: ->>'is_catalog' = 'true'
      q = q.eq('fdp_application_metadata->>is_catalog', 'true');
    }

    const { data, error } = await q;
    if (error) throw error;
    return ((data ?? []) as FdpCatalogEntry[]).map(coerceCatalogEntry);
  }

  static async getCatalogEntry(
    supabase: SupabaseClient,
    id: string,
  ): Promise<FdpCatalogEntry | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_SESSIONS) as any)
      .select('*')
      .eq('id', id)
      .eq('category', 'fdp')
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return coerceCatalogEntry(data as FdpCatalogEntry);
  }

  // ----- Applications -----

  /**
   * Staff member applies for an FDP catalog entry.
   *
   * Behavior:
   *   - Inserts a hr_training_enrollments row with status='applied'.
   *   - Seeds application_log with the initial 'applied' entry.
   *   - Application logic + RLS prevent double-application (UNIQUE session_id+staff_id).
   */
  static async applyForFdp(
    supabase: SupabaseClient,
    args: {
      session_id: string;
      staff_id: string;
      actor_id?: string | null;
      note?: string | null;
    },
  ): Promise<HRTrainingEnrollment> {
    const log: FdpApplicationLogEntry[] = [
      {
        ts: new Date().toISOString(),
        from_status: null,
        to_status: 'applied',
        actor_id: args.actor_id ?? args.staff_id,
        note: args.note ?? null,
      },
    ];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_ENROLLMENTS) as any)
      .insert({
        session_id: args.session_id,
        staff_id: args.staff_id,
        status: 'applied',
        enrolled_by: args.actor_id ?? null,
        application_log: log,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as HRTrainingEnrollment;
  }

  /**
   * Move an application forward (or reject it). Append-only log update.
   * Caller (UI/route layer) is responsible for verifying the actor's role
   * matches the transition (HoD for applied→hod_approved, Director for
   * hod_approved→director_approved). RLS does coarse access; field-level
   * is enforced here in the app layer.
   */
  static async advanceApplication(
    supabase: SupabaseClient,
    args: {
      enrollment_id: string;
      target_status: FdpApplicationStatus;
      actor_id?: string | null;
      note?: string | null;
    },
  ): Promise<HRTrainingEnrollment> {
    // Read current row to get existing log + status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: readErr } = await (
      supabase.from(TABLE_ENROLLMENTS) as any
    )
      .select('*')
      .eq('id', args.enrollment_id)
      .single();
    if (readErr) throw readErr;
    const row = existing as HRTrainingEnrollment & {
      application_log: FdpApplicationLogEntry[];
    };

    if (!isValidTransition(row.status as FdpApplicationStatus, args.target_status)) {
      throw new Error(
        `Invalid FDP transition: ${row.status} → ${args.target_status}`,
      );
    }

    const nextLog: FdpApplicationLogEntry[] = [
      ...(Array.isArray(row.application_log) ? row.application_log : []),
      {
        ts: new Date().toISOString(),
        from_status: row.status as FdpApplicationStatus,
        to_status: args.target_status,
        actor_id: args.actor_id ?? null,
        note: args.note ?? null,
      },
    ];

    const patch: Record<string, unknown> = {
      status: args.target_status,
      application_log: nextLog,
    };

    // When transitioning to 'completed' set completed_at
    if (args.target_status === 'completed') {
      patch.completed_at = new Date().toISOString();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_ENROLLMENTS) as any)
      .update(patch)
      .eq('id', args.enrollment_id)
      .select('*')
      .single();
    if (error) throw error;
    return data as HRTrainingEnrollment;
  }

  /** List applications for a session OR a staff member. */
  static async listApplications(
    supabase: SupabaseClient,
    args: { session_id?: string; staff_id?: string },
  ): Promise<HRTrainingEnrollment[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabase.from(TABLE_ENROLLMENTS) as any)
      .select('*')
      .order('enrolled_at', { ascending: false });
    if (args.session_id) q = q.eq('session_id', args.session_id);
    if (args.staff_id) q = q.eq('staff_id', args.staff_id);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as HRTrainingEnrollment[];
  }

  /**
   * Like listApplications but joined with staff display names for the admin
   * detail page. Mirrors TrainingService.listEnrollmentsWithStaff.
   */
  static async listApplicationsWithStaff(
    supabase: SupabaseClient,
    session_id: string,
  ): Promise<Array<HRTrainingEnrollment & { staff_name: string | null }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase.from(TABLE_ENROLLMENTS) as any)
      .select('*')
      .eq('session_id', session_id)
      .order('enrolled_at', { ascending: false });
    if (error) throw error;
    const list = (rows ?? []) as HRTrainingEnrollment[];
    if (list.length === 0) return [];

    const staffIds = Array.from(new Set(list.map((r) => r.staff_id)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: staffRows, error: staffErr } = await (supabase.from('staff') as any)
      .select('id, first_name, last_name')
      .in('id', staffIds);
    if (staffErr) throw staffErr;
    const nameById = new Map<string, string>();
    for (const s of (staffRows ?? []) as Array<{
      id: string;
      first_name: string | null;
      last_name: string | null;
    }>) {
      const n = [s.first_name, s.last_name].filter(Boolean).join(' ').trim();
      nameById.set(s.id, n || s.id);
    }

    return list.map((r) => ({
      ...r,
      staff_name: nameById.get(r.staff_id) ?? null,
    }));
  }
}

// =====================================================================================
// Helpers
// =====================================================================================

function coerceCatalogEntry(row: FdpCatalogEntry): FdpCatalogEntry {
  // jsonb arrives as Record<string, unknown>; cast for ergonomics.
  return {
    ...row,
    fdp_application_metadata:
      (row.fdp_application_metadata ?? {}) as FdpApplicationMetadata,
  };
}

/**
 * Allowed transitions in the FDP lifecycle. Returns true if `from → to` is
 * legal. Caller layer separately enforces role-based authorization.
 */
function isValidTransition(
  from: FdpApplicationStatus | EnrollmentStatus,
  to: FdpApplicationStatus,
): boolean {
  const allowed: Record<string, FdpApplicationStatus[]> = {
    applied: ['hod_approved', 'rejected', 'dropped'],
    hod_approved: ['director_approved', 'rejected', 'dropped'],
    director_approved: ['attended', 'rejected', 'dropped'],
    attended: ['completed', 'dropped'],
    completed: [],
    rejected: [],
    dropped: [],
    // T5.3 legacy statuses faculty may have started with
    registered: ['attended', 'dropped'],
  };
  const next = allowed[from] ?? [];
  return next.includes(to);
}
