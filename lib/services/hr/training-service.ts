/**
 * HR Training Service (T5.3)
 *
 * Operates on `hr_training_sessions` (delivered training instances) and
 * `hr_training_enrollments` (per-staff enrollment in a session).
 *
 * Naming note: the spec §T5.3 mentions `hr_training_programs`, but a
 * different catalog-style table by that exact name already exists in prod
 * (org+cadre-scoped, no scheduling). To avoid a destructive ALTER, this
 * service uses `hr_training_sessions` for the scheduled-instance shape.
 * Public-facing UI still says "Training Programs" — the rename is internal.
 *
 * Static class — SupabaseClient passed as first argument (mirrors
 * RecruitmentJobsService).
 *
 * Spec: specs/hr-module-decomposition-2026-05-09.md §T5.3
 *
 * Methods:
 *   listSessions        — paginated list with filters
 *   listOpenSessions    — staff-facing browse (status in open/in_progress)
 *   getSession          — single record by id
 *   createSession       — create a new training session (status defaults to 'draft')
 *   updateSession       — update mutable fields
 *   deleteSession       — hard delete (cascades to enrollments)
 *
 *   listEnrollments     — enrollments for a session OR a staff member
 *   getEnrollment       — single enrollment row
 *   enrollStaff         — self / officer enrollment (status defaults to 'registered')
 *   markAttended        — flip status to 'attended'
 *   completeEnrollment  — flip status to 'completed' + set completed_at + certificate_url
 *   dropEnrollment      — flip status to 'dropped'
 *
 *   listAllowedCategories — reads hr.staff_development.training_categories policy
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// =====================================================================================
// Types
// =====================================================================================

export type TrainingCategory = 'induction' | 'internal' | 'specialised' | 'fdp';
export type TrainingStatus =
  | 'draft'
  | 'open'
  | 'in_progress'
  | 'completed'
  | 'cancelled';
export type EnrollmentStatus =
  | 'registered'
  | 'attended'
  | 'completed'
  | 'dropped';

export interface HRTrainingSession {
  id: string;
  title: string;
  description: string | null;
  category: TrainingCategory;
  start_date: string;
  end_date: string;
  location: string | null;
  capacity: number | null;
  status: TrainingStatus;
  institution_id: string | null;
  facilitator_name: string | null;
  metadata: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Backwards-compat alias — UI still calls these "programs" in copy. */
export type HRTrainingProgram = HRTrainingSession;

export interface HRTrainingEnrollment {
  id: string;
  session_id: string;
  staff_id: string;
  status: EnrollmentStatus;
  certificate_url: string | null;
  feedback: Record<string, unknown>;
  enrolled_at: string;
  completed_at: string | null;
  enrolled_by: string | null;
  created_at: string;
  updated_at: string;
}

export type HRTrainingSessionInsert = Omit<
  HRTrainingSession,
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
> & {
  created_by?: string | null;
};

export type HRTrainingSessionUpdate = Partial<
  Omit<HRTrainingSession, 'id' | 'created_at' | 'updated_at'>
>;

export interface SessionFilters {
  status?: TrainingStatus | TrainingStatus[];
  category?: TrainingCategory;
  institution_id?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SessionListResponse {
  data: HRTrainingSession[];
  metadata: {
    total: number;
    page: number;
    pageSize: number;
  };
}

const TABLE_SESSIONS = 'hr_training_sessions' as const;
const TABLE_ENROLLMENTS = 'hr_training_enrollments' as const;

// =====================================================================================
// Service
// =====================================================================================

export class TrainingService {
  // ----- Sessions: List / Get -----

  static async listSessions(
    supabase: SupabaseClient,
    filters: SessionFilters = {},
  ): Promise<SessionListResponse> {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from(TABLE_SESSIONS)
      .select('*', { count: 'exact' })
      .order('start_date', { ascending: false })
      .range(from, to);

    if (filters.status) {
      const statuses = Array.isArray(filters.status)
        ? filters.status
        : [filters.status];
      q = q.in('status', statuses);
    }
    if (filters.category) {
      q = q.eq('category', filters.category);
    }
    if (filters.institution_id) {
      q = q.eq('institution_id', filters.institution_id);
    }
    if (filters.search) {
      q = q.or(
        `title.ilike.%${filters.search}%,description.ilike.%${filters.search}%`,
      );
    }

    const { data, count, error } = await q;
    if (error) throw error;

    return {
      data: (data ?? []) as HRTrainingSession[],
      metadata: {
        total: count ?? 0,
        page,
        pageSize,
      },
    };
  }

  /**
   * Staff-facing browse — only surfaces 'open' and 'in_progress' sessions.
   */
  static async listOpenSessions(
    supabase: SupabaseClient,
  ): Promise<HRTrainingSession[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_SESSIONS) as any)
      .select('*')
      .in('status', ['open', 'in_progress'])
      .order('start_date', { ascending: true });

    if (error) throw error;
    return (data ?? []) as HRTrainingSession[];
  }

  static async getSession(
    supabase: SupabaseClient,
    id: string,
  ): Promise<HRTrainingSession | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_SESSIONS) as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return (data ?? null) as HRTrainingSession | null;
  }

  // ----- Sessions: Mutations -----

  static async createSession(
    supabase: SupabaseClient,
    input: HRTrainingSessionInsert,
  ): Promise<HRTrainingSession> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_SESSIONS) as any)
      .insert(input)
      .select('*')
      .single();

    if (error) throw error;
    return data as HRTrainingSession;
  }

  static async updateSession(
    supabase: SupabaseClient,
    id: string,
    patch: HRTrainingSessionUpdate,
  ): Promise<HRTrainingSession> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_SESSIONS) as any)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as HRTrainingSession;
  }

  static async deleteSession(
    supabase: SupabaseClient,
    id: string,
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(TABLE_SESSIONS) as any)
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  // ----- Enrollments: List / Get -----

  static async listEnrollments(
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
   * Returns enrollments for a session joined with staff display info
   * (name). Used by /hr/admin/training/[id] enrollment list.
   */
  static async listEnrollmentsWithStaff(
    supabase: SupabaseClient,
    session_id: string,
  ): Promise<Array<HRTrainingEnrollment & { staff_name: string | null }>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: enrollments, error: enrollErr } = await (
      supabase.from(TABLE_ENROLLMENTS) as any
    )
      .select('*')
      .eq('session_id', session_id)
      .order('enrolled_at', { ascending: false });

    if (enrollErr) throw enrollErr;
    const rows = (enrollments ?? []) as HRTrainingEnrollment[];
    if (rows.length === 0) return [];

    const staffIds = Array.from(new Set(rows.map((r) => r.staff_id)));
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

    return rows.map((r) => ({
      ...r,
      staff_name: nameById.get(r.staff_id) ?? null,
    }));
  }

  static async getEnrollment(
    supabase: SupabaseClient,
    id: string,
  ): Promise<HRTrainingEnrollment | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_ENROLLMENTS) as any)
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return (data ?? null) as HRTrainingEnrollment | null;
  }

  // ----- Enrollments: Mutations -----

  static async enrollStaff(
    supabase: SupabaseClient,
    args: { session_id: string; staff_id: string; enrolled_by?: string | null },
  ): Promise<HRTrainingEnrollment> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_ENROLLMENTS) as any)
      .insert({
        session_id: args.session_id,
        staff_id: args.staff_id,
        status: 'registered',
        enrolled_by: args.enrolled_by ?? null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return data as HRTrainingEnrollment;
  }

  static async markAttended(
    supabase: SupabaseClient,
    id: string,
  ): Promise<HRTrainingEnrollment> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_ENROLLMENTS) as any)
      .update({ status: 'attended' })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as HRTrainingEnrollment;
  }

  static async completeEnrollment(
    supabase: SupabaseClient,
    id: string,
    args: { certificate_url?: string | null } = {},
  ): Promise<HRTrainingEnrollment> {
    const patch: Partial<HRTrainingEnrollment> = {
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    if (args.certificate_url !== undefined) {
      patch.certificate_url = args.certificate_url;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_ENROLLMENTS) as any)
      .update(patch)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as HRTrainingEnrollment;
  }

  static async dropEnrollment(
    supabase: SupabaseClient,
    id: string,
  ): Promise<HRTrainingEnrollment> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from(TABLE_ENROLLMENTS) as any)
      .update({ status: 'dropped' })
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return data as HRTrainingEnrollment;
  }

  // ----- Policy reader (category options for UI) -----

  /**
   * Reads `hr.staff_development` policy and returns the configured category
   * subset. Falls back to the full enum if policy not yet seeded.
   *
   * Policy shape:
   *   { training_categories: ['induction','internal','specialised'] }
   */
  static async listAllowedCategories(
    supabase: SupabaseClient,
  ): Promise<TrainingCategory[]> {
    const fallback: TrainingCategory[] = [
      'induction',
      'internal',
      'specialised',
      'fdp',
    ];
    try {
      const { data, error } = await supabase.rpc('fn_get_policy', {
        p_key: 'hr.staff_development',
        p_scope_id: null,
      });
      if (error || !data) return fallback;

      const cats = (data as Record<string, unknown>)?.training_categories;
      if (Array.isArray(cats) && cats.length > 0) {
        const valid = cats.filter(
          (c): c is TrainingCategory =>
            typeof c === 'string' &&
            fallback.includes(c as TrainingCategory),
        );
        return valid.length > 0 ? valid : fallback;
      }
      return fallback;
    } catch {
      return fallback;
    }
  }
}
