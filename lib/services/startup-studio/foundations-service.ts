// lib/services/startup-studio/foundations-service.ts
// Startup Studio — Foundations (Level 0) service.
//
// The pre-Appathon founder-formation on-ramp built on the ss_foundations_* substrate
// (migrations 20260602000001 + 20260602000002). Mirrors the sf100-service.ts pattern:
// static methods on BaseService, queries through the RLS-scoped injected client, shared
// notification dispatch via notifications + user_notifications.
//
// Decisions (spec §16): submit=complete / review=quality flag (#3,#7); per-student GLOBAL
// completion over the canon required set (#12); snapshot field-schema per response (#5);
// versioned resubmits (#6); facilitator proxy-fill via submitted_by (#9); graduation % from
// fn_get_policy_int('startup_studio.foundations_graduation_pct', 80) (NOT hardcoded).

import { BaseService, type BaseListResponse } from '../base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  FoundationsCohort,
  FoundationsEnrollment,
  FoundationsWorksheet,
  FoundationsResponse,
  FoundationsWorksheetWithResponse,
  FoundationsProgress,
  SubmitFoundationsResponseDto,
  ReviewFoundationsResponseDto,
} from '@/types/startup-studio/foundations';

const GRADUATION_POLICY_KEY = 'startup_studio.foundations_graduation_pct';
// Director decision (2026-06-22 interview): Explorer = ALL canon worksheets done.
// Still overridable per-institution via the policy row; this is the default.
const GRADUATION_DEFAULT_PCT = 100;

/** Roster row: enrollment joined with the student profile. */
export interface FoundationsRosterEntry extends FoundationsEnrollment {
  student: { id: string; full_name: string | null; email: string | null } | null;
}

/** Review-queue row: a submitted response joined with worksheet + student context. */
export interface FoundationsReviewItem extends FoundationsResponse {
  worksheet: Pick<FoundationsWorksheet, 'id' | 'title' | 'session_no' | 'strand'> | null;
  student: { id: string; full_name: string | null; email: string | null } | null;
}

export class FoundationsService extends BaseService {
  // =========================================================================
  // Group 1 — Cohorts
  // =========================================================================

  static async listCohorts(filters?: {
    institution_id?: string;
    status?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<BaseListResponse<FoundationsCohort>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('ss_foundations_cohorts')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters?.institution_id) query = query.eq('institution_id', filters.institution_id);
    if (filters?.status) query = query.eq('status', filters.status);
    if (filters?.search) {
      query = query.ilike('name', `%${sanitizeSearch(filters.search)}%`);
    }

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to list cohorts: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as FoundationsCohort[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  static async getCohort(cohortId: string): Promise<FoundationsCohort | null> {
    const { data, error } = await this.supabase
      .from('ss_foundations_cohorts')
      .select('*')
      .eq('id', cohortId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error('Failed to fetch cohort: ' + error.message);
    }
    return data as FoundationsCohort;
  }

  static async createCohort(
    data: {
      name: string;
      institution_id: string;
      academic_year?: string | null;
      lead_mentor_id?: string | null;
      enrollment_mode?: 'facilitator' | 'self' | 'both';
      status?: string;
      starts_on?: string | null;
      ends_on?: string | null;
    },
    createdBy: string
  ): Promise<FoundationsCohort> {
    const { data: cohort, error } = await this.supabase
      .from('ss_foundations_cohorts')
      .insert({
        name: data.name,
        institution_id: data.institution_id,
        academic_year: data.academic_year ?? null,
        lead_mentor_id: data.lead_mentor_id ?? null,
        enrollment_mode: data.enrollment_mode ?? 'both',
        status: data.status ?? 'active',
        starts_on: data.starts_on ?? null,
        ends_on: data.ends_on ?? null,
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to create cohort: ' + error.message);
    return cohort as FoundationsCohort;
  }

  static async updateCohort(
    cohortId: string,
    data: Partial<Pick<FoundationsCohort,
      'name' | 'academic_year' | 'lead_mentor_id' | 'enrollment_mode' | 'status' | 'starts_on' | 'ends_on'>>
  ): Promise<FoundationsCohort> {
    const { data: cohort, error } = await this.supabase
      .from('ss_foundations_cohorts')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', cohortId)
      .select('*')
      .single();

    if (error) throw new Error('Failed to update cohort: ' + error.message);
    return cohort as FoundationsCohort;
  }

  // =========================================================================
  // Group 2 — Enrollments
  // =========================================================================

  /**
   * Add a student to a cohort. `via` distinguishes facilitator-add from self-enrol (#4).
   * Idempotent on (cohort_id, student_id): returns the existing row if already enrolled.
   */
  static async enroll(
    cohortId: string,
    studentId: string,
    via: 'facilitator' | 'self',
    actorId: string
  ): Promise<FoundationsEnrollment> {
    // Idempotency: return existing enrollment if present
    const { data: existing } = await this.supabase
      .from('ss_foundations_enrollments')
      .select('*')
      .eq('cohort_id', cohortId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (existing) return existing as FoundationsEnrollment;

    const { data: enrollment, error } = await this.supabase
      .from('ss_foundations_enrollments')
      .insert({
        cohort_id: cohortId,
        student_id: studentId,
        enrolled_via: via,
        status: 'active',
        enrolled_by: via === 'self' ? null : actorId,
      })
      .select('*')
      .single();

    if (error) throw new Error('Failed to enroll student: ' + error.message);
    return enrollment as FoundationsEnrollment;
  }

  /** Roster for a cohort — enrollments joined with the student profile. */
  static async listEnrollments(
    cohortId: string,
    filters?: { status?: string; page?: number; limit?: number }
  ): Promise<BaseListResponse<FoundationsRosterEntry>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('ss_foundations_enrollments')
      .select('*, student:profiles!ss_foundations_enrollments_student_id_fkey(id, full_name, email)', {
        count: 'exact',
      })
      .eq('cohort_id', cohortId)
      .order('enrolled_at', { ascending: false });

    if (filters?.status) query = query.eq('status', filters.status);

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to list enrollments: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as FoundationsRosterEntry[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  /** The cohorts a student belongs to (their enrolments joined with cohort context). */
  static async getMyEnrollments(
    studentId: string
  ): Promise<Array<FoundationsEnrollment & { cohort: FoundationsCohort | null }>> {
    const { data, error } = await this.supabase
      .from('ss_foundations_enrollments')
      .select('*, cohort:ss_foundations_cohorts(*)')
      .eq('student_id', studentId)
      .order('enrolled_at', { ascending: false });

    if (error) throw new Error('Failed to fetch enrollments: ' + error.message);
    return (data || []) as Array<FoundationsEnrollment & { cohort: FoundationsCohort | null }>;
  }

  static async withdraw(enrollmentId: string): Promise<void> {
    const { error } = await this.supabase
      .from('ss_foundations_enrollments')
      .update({ status: 'withdrawn' })
      .eq('id', enrollmentId);
    if (error) throw new Error('Failed to withdraw enrollment: ' + error.message);
  }

  // =========================================================================
  // Group 3 — Worksheets
  // =========================================================================

  /**
   * List worksheets. Returns the global canon set; if a cohort_id is given, that
   * cohort's overrides (same session_no) REPLACE the canon worksheet (#2).
   */
  static async listWorksheets(cohortId?: string | null): Promise<FoundationsWorksheet[]> {
    const { data: canon, error } = await this.supabase
      .from('ss_foundations_worksheets')
      .select('*')
      .is('cohort_id', null)
      .eq('status', 'published')
      .order('sort_order', { ascending: true });

    if (error) throw new Error('Failed to list worksheets: ' + error.message);
    let worksheets = (canon || []) as FoundationsWorksheet[];

    if (cohortId) {
      const { data: overrides, error: ovErr } = await this.supabase
        .from('ss_foundations_worksheets')
        .select('*')
        .eq('cohort_id', cohortId)
        .eq('status', 'published')
        .order('sort_order', { ascending: true });
      if (ovErr) throw new Error('Failed to list cohort worksheets: ' + ovErr.message);

      const overrideRows = (overrides || []) as FoundationsWorksheet[];
      if (overrideRows.length > 0) {
        // Override replaces canon by session_no; extra overrides are appended.
        const bySession = new Map<number, FoundationsWorksheet>();
        for (const w of worksheets) bySession.set(w.session_no, w);
        for (const o of overrideRows) bySession.set(o.session_no, o);
        worksheets = Array.from(bySession.values()).sort((a, b) => a.sort_order - b.sort_order);
      }
    }

    return worksheets;
  }

  static async getWorksheet(worksheetId: string): Promise<FoundationsWorksheet | null> {
    const { data, error } = await this.supabase
      .from('ss_foundations_worksheets')
      .select('*')
      .eq('id', worksheetId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error('Failed to fetch worksheet: ' + error.message);
    }
    return data as FoundationsWorksheet;
  }

  // =========================================================================
  // Group 4 — Journey + Responses
  // =========================================================================

  /**
   * A student's journey: every worksheet joined with that student's response (or null).
   * Drives the stepper UI.
   */
  static async getJourney(
    studentId: string,
    cohortId?: string | null
  ): Promise<FoundationsWorksheetWithResponse[]> {
    const worksheets = await this.listWorksheets(cohortId);
    const worksheetIds = worksheets.map((w) => w.id);
    if (worksheetIds.length === 0) return [];

    const { data: responses, error } = await this.supabase
      .from('ss_foundations_responses')
      .select('*')
      .eq('student_id', studentId)
      .in('worksheet_id', worksheetIds);

    if (error) throw new Error('Failed to fetch journey responses: ' + error.message);

    const byWorksheet = new Map<string, FoundationsResponse>();
    for (const r of (responses || []) as FoundationsResponse[]) byWorksheet.set(r.worksheet_id, r);

    return worksheets.map((w) => ({ ...w, response: byWorksheet.get(w.id) ?? null }));
  }

  static async getMyResponse(
    worksheetId: string,
    studentId: string
  ): Promise<FoundationsResponse | null> {
    const { data, error } = await this.supabase
      .from('ss_foundations_responses')
      .select('*')
      .eq('worksheet_id', worksheetId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (error) throw new Error('Failed to fetch response: ' + error.message);
    return (data as FoundationsResponse) ?? null;
  }

  /**
   * Save or submit a worksheet response (#3 submit=complete; #5 snapshot; #6 versioned;
   * #9 proxy via submittedBy). Drafts don't version; submits append a version row and,
   * when they CROSS the graduation threshold, fire the Level-0 completion notification.
   *
   * @param studentId  the learner the response belongs to
   * @param submittedBy the actual typer (== studentId normally; a facilitator when proxying)
   */
  static async submitResponse(
    dto: SubmitFoundationsResponseDto,
    studentId: string,
    submittedBy: string
  ): Promise<FoundationsResponse> {
    const status = dto.status ?? 'submitted';
    const now = new Date().toISOString();

    // Snapshot the worksheet's current questions at submit-time (#5)
    const worksheet = await this.getWorksheet(dto.worksheet_id);
    if (!worksheet) throw new Error('Worksheet not found');

    const existing = await this.getMyResponse(dto.worksheet_id, studentId);

    // Progress BEFORE the write — used to detect a graduation crossing (idempotent by construction)
    const before = await this.getProgress(studentId);

    const basePayload: Record<string, unknown> = {
      response_data: dto.response_data,
      fields_snapshot: worksheet.fields,
      status,
      cohort_id: dto.cohort_id ?? existing?.cohort_id ?? null,
      submitted_by: submittedBy,
      updated_at: now,
    };
    if (status === 'submitted') basePayload.submitted_at = now;

    let response: FoundationsResponse;
    if (existing) {
      const { data, error } = await this.supabase
        .from('ss_foundations_responses')
        .update(basePayload)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw new Error('Failed to update response: ' + error.message);
      response = data as FoundationsResponse;
    } else {
      const { data, error } = await this.supabase
        .from('ss_foundations_responses')
        .insert({
          worksheet_id: dto.worksheet_id,
          student_id: studentId,
          current_version: 1,
          ...basePayload,
        })
        .select('*')
        .single();
      if (error) throw new Error('Failed to create response: ' + error.message);
      response = data as FoundationsResponse;
    }

    // On submit: append a version row (#6) and bump current_version to the version count.
    if (status === 'submitted') {
      const { count: priorVersions } = await this.supabase
        .from('ss_foundations_response_versions')
        .select('id', { count: 'exact', head: true })
        .eq('response_id', response.id);

      const newVersion = (priorVersions ?? 0) + 1;

      const { error: verErr } = await this.supabase
        .from('ss_foundations_response_versions')
        .insert({
          response_id: response.id,
          version: newVersion,
          response_data: dto.response_data,
          fields_snapshot: worksheet.fields,
          submitted_by: submittedBy,
          submitted_at: now,
        });
      if (verErr) console.error('[ss_foundations_response_versions] insert error:', verErr.message);

      const { data: bumped } = await this.supabase
        .from('ss_foundations_responses')
        .update({ current_version: newVersion })
        .eq('id', response.id)
        .select('*')
        .single();
      if (bumped) response = bumped as FoundationsResponse;

      // Graduation crossing → notify once (#auto-cert/notify)
      const after = await this.getProgress(studentId);
      if (!before.graduated && after.graduated) {
        await this.notifyGraduation(studentId, after).catch((e) =>
          console.error('[foundations] graduation notify error:', e)
        );
      }
    }

    return response;
  }

  /**
   * Mentor/facilitator review of a submitted response (#3,#7 — quality flag only,
   * never gates completion). Sets status='reviewed' + feedback + rating.
   */
  static async reviewResponse(
    responseId: string,
    dto: ReviewFoundationsResponseDto,
    reviewerId: string
  ): Promise<FoundationsResponse> {
    // Hardening: only a SUBMITTED (or already-reviewed) worksheet can be reviewed.
    // Reviewing a draft would wrongly flip it to 'reviewed' and count it complete.
    const { data: existing, error: exErr } = await this.supabase
      .from('ss_foundations_responses')
      .select('status')
      .eq('id', responseId)
      .single();
    if (exErr) throw new Error('Response not found');
    if (existing.status === 'draft') {
      throw new Error('This worksheet has not been submitted yet, so it cannot be reviewed.');
    }

    const { data, error } = await this.supabase
      .from('ss_foundations_responses')
      .update({
        status: 'reviewed',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
        mentor_feedback: dto.mentor_feedback ?? null,
        mentor_rating: dto.mentor_rating ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', responseId)
      .select('*')
      .single();

    if (error) throw new Error('Failed to review response: ' + error.message);

    // Notify the learner that their worksheet was reviewed (fire-and-forget).
    const response = data as FoundationsResponse;
    this.notifyUsers({
      userIds: [response.student_id],
      title: 'Your Foundations worksheet was reviewed',
      message: 'A mentor has left feedback on one of your Foundations worksheets.',
      eventType: 'foundations_reviewed',
      metadata: { response_id: responseId },
    }).catch((e) => console.error('[foundations] review notify error:', e));

    return response;
  }

  /**
   * Review queue — submitted responses awaiting review. RLS scopes the visible rows
   * to what the caller may see (own cohorts as facilitator/lead-mentor, or review perm).
   */
  static async listReviewQueue(filters?: {
    cohort_id?: string;
    status?: 'submitted' | 'reviewed';
    page?: number;
    limit?: number;
  }): Promise<BaseListResponse<FoundationsReviewItem>> {
    const { page, limit } = this.validate(filters?.page, filters?.limit);

    let query = this.supabase
      .from('ss_foundations_responses')
      .select(
        `*,
         worksheet:ss_foundations_worksheets(id, title, session_no, strand),
         student:profiles!ss_foundations_responses_student_id_fkey(id, full_name, email)`,
        { count: 'exact' }
      )
      .order('submitted_at', { ascending: true });

    query = query.eq('status', filters?.status ?? 'submitted');
    if (filters?.cohort_id) query = query.eq('cohort_id', filters.cohort_id);

    const start = (page - 1) * limit;
    query = query.range(start, start + limit - 1);

    const { data, count, error } = await query;
    if (error) throw new Error('Failed to fetch review queue: ' + error.message);

    const total = count || 0;
    return {
      data: (data || []) as FoundationsReviewItem[],
      metadata: { total, page, limit, totalPages: total > 0 ? Math.ceil(total / limit) : 0 },
    };
  }

  // =========================================================================
  // Group 5 — Progress + Graduation
  // =========================================================================

  /**
   * Per-student GLOBAL completion (#12) over the canon REQUIRED worksheets.
   * completion_pct = submitted_required / total_required (#3 submit=complete).
   * graduated = completion_pct >= fn_get_policy_int(GRADUATION_POLICY_KEY, 80).
   */
  static async getProgress(studentId: string): Promise<FoundationsProgress> {
    // Canon required worksheets (the stable Level-0 denominator)
    const { data: required, error: wErr } = await this.supabase
      .from('ss_foundations_worksheets')
      .select('id')
      .is('cohort_id', null)
      .eq('is_required', true)
      .eq('status', 'published');

    if (wErr) throw new Error('Failed to load required worksheets: ' + wErr.message);

    const requiredIds = new Set((required || []).map((w: { id: string }) => w.id));
    const totalRequired = requiredIds.size;

    let submittedRequired = 0;
    let reviewedRequired = 0;

    if (totalRequired > 0) {
      const { data: responses, error: rErr } = await this.supabase
        .from('ss_foundations_responses')
        .select('worksheet_id, status')
        .eq('student_id', studentId)
        .in('status', ['submitted', 'reviewed']);

      if (rErr) throw new Error('Failed to load responses for progress: ' + rErr.message);

      const seen = new Set<string>();
      for (const r of (responses || []) as Array<{ worksheet_id: string; status: string }>) {
        if (!requiredIds.has(r.worksheet_id) || seen.has(r.worksheet_id)) continue;
        seen.add(r.worksheet_id);
        submittedRequired += 1;
        if (r.status === 'reviewed') reviewedRequired += 1;
      }
    }

    const completionPct =
      totalRequired > 0 ? Math.round((submittedRequired / totalRequired) * 100) : 0;
    const threshold = await this.getGraduationThreshold();

    return {
      student_id: studentId,
      total_required: totalRequired,
      submitted_required: submittedRequired,
      reviewed_required: reviewedRequired,
      completion_pct: completionPct,
      graduated: completionPct >= threshold,
    };
  }

  /** Graduation threshold % from platform_policies (default 80). p_scope_id defaults NULL. */
  static async getGraduationThreshold(): Promise<number> {
    try {
      const { data, error } = await this.supabase.rpc('fn_get_policy_int', {
        p_key: GRADUATION_POLICY_KEY,
        p_default: GRADUATION_DEFAULT_PCT,
      });
      if (error || data == null) return GRADUATION_DEFAULT_PCT;
      return Number(data) || GRADUATION_DEFAULT_PCT;
    } catch {
      return GRADUATION_DEFAULT_PCT;
    }
  }

  // =========================================================================
  // Private — notifications (shared system: notifications + user_notifications)
  // =========================================================================

  private static async notifyGraduation(
    studentId: string,
    progress: FoundationsProgress
  ): Promise<void> {
    await this.notifyUsers({
      userIds: [studentId],
      title: 'You completed Startup Studio Foundations! 🎓',
      message: `You've finished ${progress.submitted_required} of ${progress.total_required} Level-0 worksheets — you're ready for the Appathon. Your Explorer level is unlocked.`,
      eventType: 'foundations_graduated',
      metadata: { completion_pct: progress.completion_pct, level: 0 },
    });
  }

  private static async notifyUsers(params: {
    userIds: string[];
    title: string;
    message: string;
    eventType: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    if (params.userIds.length === 0) return;

    const { data: notification, error: insErr } = await this.supabase
      .from('notifications')
      .insert({
        type: 'startup_studio',
        title: params.title,
        message: params.message,
        metadata: {
          source: 'foundations',
          event_type: params.eventType,
          ...(params.metadata ?? {}),
        },
      })
      .select('id')
      .single();

    if (insErr || !notification) {
      console.error('[foundations/notify] notifications insert failed:', insErr?.message);
      return;
    }

    const links = params.userIds.map((uid) => ({
      notification_id: notification.id,
      user_id: uid,
    }));

    const { error: linkErr } = await this.supabase.from('user_notifications').insert(links);
    if (linkErr) console.error('[foundations/notify] user_notifications insert failed:', linkErr.message);
  }
}
