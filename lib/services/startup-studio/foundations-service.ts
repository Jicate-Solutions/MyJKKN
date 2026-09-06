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
// fn_get_policy_int('startup_studio.foundations_graduation_pct', 100) (NOT hardcoded).

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

    // Cohort-core: mint the spine mirror (kind='foundations') so self-enrol
    // students have a container to hang their membership on. BEST-EFFORT — a
    // facilitator without cohort.create just skips it; ss_foundations_cohorts stays
    // authoritative and the mirror is lazily re-attempted at enroll-time.
    await this.ensureFoundationsCohortMirror((cohort as FoundationsCohort).id);

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
   *
   * D9 (Cohort Core): the member MUST resolve to a real student profile — no
   * free-text / stray uuid. `studentId` is resolved against `profiles` first and a
   * clean 400 is thrown when nothing matches (mirrors SF100 requestRosterChange),
   * so the FK never surfaces as a masked 500 and the `member_type='student'`
   * membership always references a real profiles(id).
   *
   * Cohort-core twin (Phase 3): after the extension insert, this mirrors the
   * enrollment as a `cohort_memberships` (member_type='student', member_ref=studentId)
   * row on the `cohorts` (kind='foundations') spine mirror and back-links the
   * enrollment — BEST-EFFORT + idempotent, exactly like SF100Service.enrollTeam.
   * The extension roster (listEnrollments) stays authoritative, so a lagging or
   * RLS-denied membership mirror can never DROP a real enrollee.
   */
  static async enroll(
    cohortId: string,
    studentId: string,
    via: 'facilitator' | 'self',
    actorId: string
  ): Promise<FoundationsEnrollment> {
    // D9 — resolve the member to a real profile BEFORE any write. Reject free-text.
    const { data: profileRow } = await this.supabase
      .from('profiles')
      .select('id')
      .eq('id', studentId)
      .maybeSingle();
    if (!profileRow?.id) {
      const err = new Error(
        'No student profile found for the selected member. Pick an existing MyJKKN user from the directory instead of entering a free-text value.'
      );
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    // Enrollment-mode gate (#4): a student may self-enrol ONLY into a cohort whose
    // enrollment_mode allows it ('self' or 'both'). A facilitator-only cohort must be
    // curated by staff — a student who knows the id cannot join it uninvited. The
    // facilitator-add path (via='facilitator', gated by foundations.manage) bypasses this.
    if (via === 'self') {
      const { data: cohortRow } = await this.supabase
        .from('ss_foundations_cohorts')
        .select('enrollment_mode')
        .eq('id', cohortId)
        .maybeSingle();
      const mode = (cohortRow as { enrollment_mode?: string } | null)?.enrollment_mode;
      if (mode && mode !== 'self' && mode !== 'both') {
        const err = new Error('This cohort does not allow self-enrolment. Ask a facilitator to add you.');
        (err as Error & { status?: number }).status = 403;
        throw err;
      }
    }

    // Idempotency: return existing enrollment if present
    const { data: existing } = await this.supabase
      .from('ss_foundations_enrollments')
      .select('*')
      .eq('cohort_id', cohortId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (existing) {
      // Self-heal: an enrollment that pre-dates the spine mirror (or whose earlier
      // mirror was RLS-denied) gets its membership re-attempted idempotently.
      if (!(existing as { cohort_membership_id?: string }).cohort_membership_id) {
        await this.mirrorEnrollmentToSpine(existing as FoundationsEnrollment, via, actorId);
      }
      return existing as FoundationsEnrollment;
    }

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

    if (error) {
      // Surface an RLS denial (e.g. a self-enrol the policy rejects) as a clean 403
      // instead of a masked 500. Postgres RLS violation = SQLSTATE 42501. (#4)
      const e = new Error('Failed to enroll student: ' + error.message) as Error & { status?: number; code?: string };
      e.code = (error as { code?: string }).code;
      if ((error as { code?: string }).code === '42501') e.status = 403;
      throw e;
    }

    // Cohort-core write-side twin (best-effort — never fails the enrollment).
    await this.mirrorEnrollmentToSpine(enrollment as FoundationsEnrollment, via, actorId);

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
    // Read the spine link BEFORE the update so we can also wrap up the membership.
    const { data: enrollment } = await this.supabase
      .from('ss_foundations_enrollments')
      .select('id, cohort_membership_id')
      .eq('id', enrollmentId)
      .maybeSingle();

    const { error } = await this.supabase
      .from('ss_foundations_enrollments')
      .update({ status: 'withdrawn' })
      .eq('id', enrollmentId);
    if (error) throw new Error('Failed to withdraw enrollment: ' + error.message);

    // Cohort-core mirror (best-effort): withdrawn → membership 'removed'. The
    // extension status is authoritative; if the actor lacks cohort.edit the mirror
    // simply lags until reconciled.
    const membershipId = (enrollment as { cohort_membership_id?: string } | null)?.cohort_membership_id;
    if (membershipId) {
      try {
        const { data: memBefore } = await this.supabase
          .from('cohort_memberships')
          .select('cohort_id, status')
          .eq('id', membershipId)
          .maybeSingle();
        if (memBefore && memBefore.status !== 'removed') {
          const { error: mErr } = await this.supabase
            .from('cohort_memberships')
            .update({ status: 'removed' })
            .eq('id', membershipId);
          if (mErr) {
            console.error('[foundations/withdraw] membership mirror failed:', mErr.message);
          } else {
            await this.supabase.from('cohort_status_events').insert({
              cohort_id: memBefore.cohort_id,
              membership_id: membershipId,
              event_type: 'removed',
              from_status: memBefore.status,
              to_status: 'removed',
              metadata: { source: 'foundations', reason: 'withdraw' },
            });
          }
        }
      } catch (e) {
        console.error('[foundations/withdraw] spine mirror error:', e);
      }
    }
  }

  /**
   * D5 — MENTOR SIGN-OFF completes a student. Completion is per-student GLOBAL
   * (#12) over the canon required set; this only RATIFIES a met threshold, it does
   * not compute it. Asserts `getProgress(student).graduated`, marks the extension
   * enrollment `completed` (authoritative), then best-effort graduates the linked
   * cohort_membership + records a status event. Mentor-gated by the route
   * (startup_studio.foundations.review) — NOT self-serve.
   */
  static async signOffGraduation(
    enrollmentId: string,
    mentorId: string
  ): Promise<{ enrollment: FoundationsEnrollment; membership_graduated: boolean }> {
    const { data: enrollment } = await this.supabase
      .from('ss_foundations_enrollments')
      .select('*')
      .eq('id', enrollmentId)
      .maybeSingle();
    if (!enrollment) {
      const err = new Error('Enrollment not found.');
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    // Gate: the student must have met the global graduation threshold (#12).
    const progress = await this.getProgress(enrollment.student_id);
    if (!progress.graduated) {
      const threshold = await this.getGraduationThreshold();
      const err = new Error(
        `Cannot sign off: the student has completed ${progress.completion_pct}% of the required worksheets, below the ${threshold}% graduation threshold.`
      );
      (err as Error & { status?: number }).status = 400;
      throw err;
    }

    // Authoritative: mark the extension enrollment completed.
    const { data: updated, error: upErr } = await this.supabase
      .from('ss_foundations_enrollments')
      .update({ status: 'completed' })
      .eq('id', enrollmentId)
      .select('*')
      .single();
    if (upErr) throw new Error('Failed to complete enrollment: ' + upErr.message);

    // Best-effort spine mirror: graduate the linked membership + audit event.
    let membershipGraduated = false;
    const membershipId = (enrollment as { cohort_membership_id?: string }).cohort_membership_id;
    if (membershipId) {
      try {
        const { data: memBefore } = await this.supabase
          .from('cohort_memberships')
          .select('cohort_id, status')
          .eq('id', membershipId)
          .maybeSingle();
        if (memBefore && memBefore.status !== 'graduated') {
          const { error: mErr } = await this.supabase
            .from('cohort_memberships')
            .update({ status: 'graduated' })
            .eq('id', membershipId);
          if (mErr) {
            console.error('[foundations/signOff] membership graduate failed:', mErr.message);
          } else {
            membershipGraduated = true;
            await this.supabase.from('cohort_status_events').insert({
              cohort_id: memBefore.cohort_id,
              membership_id: membershipId,
              event_type: 'graduated',
              from_status: memBefore.status,
              to_status: 'graduated',
              actor_id: mentorId,
              metadata: { source: 'foundations', completion_pct: progress.completion_pct },
            });
          }
        }
      } catch (e) {
        console.error('[foundations/signOff] spine mirror error:', e);
      }
    }

    // Notify the student (fire-and-forget).
    this.notifyUsers({
      userIds: [enrollment.student_id],
      title: 'Your Foundations completion was signed off! 🎓',
      message:
        'A mentor has signed off your Startup Studio Foundations completion. Your Explorer level is confirmed.',
      eventType: 'foundations_signed_off',
      metadata: { enrollment_id: enrollmentId, completion_pct: progress.completion_pct },
    }).catch((e) => console.error('[foundations/signOff] notify error:', e));

    return { enrollment: updated as FoundationsEnrollment, membership_graduated: membershipGraduated };
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
   * graduated = completion_pct >= fn_get_policy_int(GRADUATION_POLICY_KEY, 100).
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

  /** Graduation threshold % from platform_policies (default 100). p_scope_id defaults NULL. */
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
  // Private — cohort-core spine bridge (Phase 3)
  //
  // ss_foundations_cohorts stays the AUTHORITATIVE domain container (its id is the
  // FK target of ss_foundations_worksheets.cohort_id / ss_foundations_responses.
  // cohort_id + the listWorksheets override key — gotcha #2). The public.cohorts
  // (kind='foundations') row is an ADDITIVE spine MIRROR for roster + lifecycle,
  // mapped 1:1 via cohorts.config->>'ss_foundations_cohort_id'. Every write here is
  // BEST-EFFORT: the extension is authoritative, so a lagging/RLS-denied mirror is
  // never allowed to fail the enrollment. Mirrors the SF100Service.enrollTeam twin.
  // =========================================================================

  private static readonly SSF_TO_COHORT_STATUS: Record<string, string> = {
    draft: 'draft',
    active: 'active',
    completed: 'completed',
    archived: 'archived',
  };

  /**
   * Resolve — and lazily mint — the public.cohorts (kind='foundations') mirror for
   * a ss_foundations_cohort. Returns the spine cohort id, or null when it neither
   * exists nor could be created (e.g. the caller lacks cohort.create). Idempotent:
   * look-up-then-insert keyed on config->>'ss_foundations_cohort_id'.
   */
  private static async ensureFoundationsCohortMirror(
    ssCohortId: string
  ): Promise<string | null> {
    const findExisting = async () => {
      const { data, error } = await this.supabase
        .from('cohorts')
        .select('id')
        .eq('kind', 'foundations')
        .eq('config->>ss_foundations_cohort_id', ssCohortId)
        .limit(1)
        .maybeSingle();
      return { id: (data as { id?: string } | null)?.id ?? null, error };
    };
    try {
      const first = await findExisting();
      if (first.id) return first.id;
      // Do NOT fall through to INSERT on a lookup ERROR (transient, or a pre-existing
      // duplicate surfacing as a multi-row error): that would mint YET ANOTHER mirror
      // and compound the fragmentation (#6). Bail — a later enrol retries idempotently.
      if (first.error) {
        console.error('[foundations/spine] mirror lookup failed:', first.error.message);
        return null;
      }

      // Read the authoritative source row for the mirror's fields.
      const { data: ss } = await this.supabase
        .from('ss_foundations_cohorts')
        .select('*')
        .eq('id', ssCohortId)
        .maybeSingle();
      if (!ss) return null;

      const opensAt = ss.starts_on ? `${ss.starts_on}T00:00:00+05:30` : null; // IST start-of-day
      const closesAt = ss.ends_on ? `${ss.ends_on}T23:59:59+05:30` : null; // IST end-of-day (inclusive)

      const { data: mirror, error } = await this.supabase
        .from('cohorts')
        .insert({
          kind: 'foundations',
          name: ss.name,
          institution_id: ss.institution_id, // NOT NULL — closes the tenant hole
          owner_id: ss.created_by ?? null, // profiles(id); NOT lead_mentor_id (that's ss_mentors)
          academic_year: ss.academic_year ?? null,
          opens_at: opensAt,
          closes_at: closesAt,
          status: this.SSF_TO_COHORT_STATUS[ss.status as string] ?? 'active',
          created_by: ss.created_by ?? null,
          config: {
            ss_foundations_cohort_id: ss.id,
            enrollment_mode: ss.enrollment_mode, // no first-class cohort column
            lead_mentor_id: ss.lead_mentor_id, // ss_mentors(id) — config only
          },
        })
        .select('id')
        .single();
      if (error) {
        // A concurrent first-enrol may have minted the mirror between our lookup and
        // insert. The partial unique index uq_cohorts_foundations_ss_id turns that race
        // into a clean 23505 — recover by returning the winner instead of leaking a dup.
        if ((error as { code?: string }).code === '23505') {
          const again = await findExisting();
          if (again.id) return again.id;
        }
        console.error('[foundations/spine] cohort mirror mint failed:', error.message);
        return null;
      }
      return (mirror?.id as string) ?? null;
    } catch (e) {
      console.error('[foundations/spine] ensureFoundationsCohortMirror error:', e);
      return null;
    }
  }

  /**
   * Mirror an enrollment onto the spine (best-effort): upsert a member_type='student'
   * membership (member_ref = student_id — D9), back-link the enrollment, and append
   * an 'enrolled' status event. Idempotent via UNIQUE(cohort_id, member_type,
   * member_ref). Self-enrol succeeds under the cohort_memberships_foundations_self_insert
   * RLS carve-out; facilitator-add needs cohort.create (else it logs + skips).
   */
  private static async mirrorEnrollmentToSpine(
    enrollment: FoundationsEnrollment,
    via: 'facilitator' | 'self',
    actorId: string
  ): Promise<void> {
    try {
      const spineCohortId = await this.ensureFoundationsCohortMirror(enrollment.cohort_id);
      if (!spineCohortId) return;

      // Fold the authoritative extension status into the spine membership status so a
      // re-mirror of a withdrawn/completed enrollment does NOT resurrect it as 'enrolled'
      // (#3). ss_foundations_enrollments is authoritative; the mirror follows it.
      const membershipStatus =
        enrollment.status === 'withdrawn' ? 'removed'
        : enrollment.status === 'completed' ? 'graduated'
        : 'enrolled';

      const { data: membership, error: memErr } = await this.supabase
        .from('cohort_memberships')
        .upsert(
          {
            cohort_id: spineCohortId,
            member_type: 'student',
            member_ref: enrollment.student_id, // D9: the enrollment's profiles(id)
            status: membershipStatus,
            role: via,
            joined_at: enrollment.enrolled_at ?? new Date().toISOString(),
            joined_by: via === 'self' ? enrollment.student_id : actorId,
            config: {
              ssf_enrollment_id: enrollment.id,
              enrolled_via: via,
              ssf_status: enrollment.status, // original extension status (fold-loss guard)
            },
          },
          { onConflict: 'cohort_id,member_type,member_ref' }
        )
        .select('id')
        .single();

      if (memErr) {
        console.error('[foundations/enroll] cohort membership mirror failed:', memErr.message);
        return;
      }
      if (!membership?.id) return;

      const { error: linkErr } = await this.supabase
        .from('ss_foundations_enrollments')
        .update({ cohort_membership_id: membership.id })
        .eq('id', enrollment.id);
      if (linkErr) {
        console.error('[foundations/enroll] cohort_membership_id back-link failed:', linkErr.message);
      }

      // Best-effort audit (needs cohort.edit — students won't hold it, so tolerate).
      const { error: evErr } = await this.supabase.from('cohort_status_events').insert({
        cohort_id: spineCohortId,
        membership_id: membership.id,
        event_type: 'enrolled',
        to_status: 'enrolled',
        actor_id: actorId,
        metadata: { source: 'foundations', ssf_enrollment_id: enrollment.id, enrolled_via: via },
      });
      if (evErr) {
        // Non-fatal: the membership + back-link already landed.
        console.error('[foundations/enroll] status event insert failed:', evErr.message);
      }
    } catch (e) {
      console.error('[foundations/enroll] cohort twin error:', e);
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
        title: params.title,
        body: params.message,
        category: 'startup_studio',
        kind: 'work_item',
        created_by: params.userIds[0],
        targeting: { type: 'user', user_ids: params.userIds },
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
