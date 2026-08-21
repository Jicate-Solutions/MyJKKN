import { BaseService } from '@/lib/services/base-service';
import type {
  CourseApplication,
  CourseApplicationCounts,
  CourseApplicationFilters,
  CourseApplicationStatus,
  CourseApprovalResult,
  CourseCredentialsResult,
} from '@/types/courses';
import { COURSE_APPLICATION_STATUSES } from '@/types/courses';

/**
 * Course applications — reads, plus the two decisions.
 *
 * Approving is NOT a status update, so there is no `update(status)` here.
 * fn_course_approve_application provisions a profile, a JKKN identity, the
 * portal role, an enrollment and the whole bill schedule in ONE transaction;
 * five client-side writes could half-succeed and leave somebody holding a JKKN
 * ID with no enrollment, or an enrollment with no bills that can never reach a
 * zero balance.
 *
 * The two decisions reach the database by different routes, for one reason:
 *   • REJECT goes straight to the RPC from here. The function is granted to
 *     `authenticated` and reads auth.uid() itself, so the browser client is
 *     exactly the right caller.
 *   • APPROVE goes through /api/courses/applications/[id]/approve, because it
 *     must create an auth user first (profiles.id must equal auth.uid()) and
 *     auth.admin.createUser is a service-role admin call the browser must never
 *     be able to make.
 *
 * Every embed names its FK constraint explicitly. course_applications has three
 * separate FKs into identity tables (profile_id, learner_id,
 * external_participant_id) plus decided_by → profiles, so `profiles(...)` alone
 * is ambiguous and PostgREST refuses it with PGRST201.
 *
 * Left joins throughout: form_id and package_id are both ON DELETE SET NULL and
 * package_id is legitimately null (a course with no packages asks for no
 * choice). `!inner` would drop exactly the rows an admin most needs to see.
 */
const SELECT = `
  *,
  form:course_registration_forms!course_applications_form_id_fkey(id, name),
  package:course_packages!course_applications_package_id_fkey(id, name, total_amount),
  decided_by_profile:profiles!course_applications_decided_by_fkey(id, full_name),
  enrollment:course_enrollments!course_enrollments_application_id_fkey(
    id, enrollment_number, status, total_payable, total_paid, balance
  ),
  profile:profiles!course_applications_profile_id_fkey(
    id,
    jkkn_identities(jkkn_id)
  )
`;

export class CourseApplicationService extends BaseService {
  /**
   * RLS gates the rows (courses.applications.view + role_has_institution_access),
   * so there is no institution filter here.
   *
   * Newest first: an admin opening this tab is looking for what just came in.
   */
  static async listByCourse(
    courseEventId: string,
    filters: CourseApplicationFilters = {},
  ): Promise<CourseApplication[]> {
    let query = this.supabase
      .from('course_applications')
      .select(SELECT)
      .eq('course_event_id', courseEventId);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.applicant_type) query = query.eq('applicant_type', filters.applicant_type);

    const search = filters.search?.trim();
    if (search) {
      // One .or() per token would be needed for multi-word search across
      // columns; a single token is the normal case here (a name, a phone) and
      // the escape guards a comma, which would otherwise split the or() list.
      const safe = search.replace(/[,()]/g, ' ').trim();
      if (safe) {
        query = query.or(
          `applicant_name.ilike.%${safe}%,applicant_phone.ilike.%${safe}%,applicant_email.ilike.%${safe}%`,
        );
      }
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as CourseApplication[];
  }

  /**
   * Paginated list for the advanced DataTable.
   *
   * A separate method from listByCourse rather than a flag on it: the table
   * runs in fetchDataFn mode, which owns page/search/sort imperatively and
   * needs an exact total back, while listByCourse is the plain "give me all of
   * them" read the counts and any future export use. Folding both into one
   * signature would mean every caller passing pagination it does not want.
   */
  static async listPaged(
    courseEventId: string,
    params: CourseApplicationFilters & {
      page?: number;
      limit?: number;
      sortBy?: string;
      sortDirection?: 'asc' | 'desc';
    } = {},
  ): Promise<{
    data: CourseApplication[];
    metadata: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = Math.max(1, params.page ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 10));
    const from = (page - 1) * limit;

    // Sorting is restricted to REAL columns. fetchDataFn forwards sort_by
    // straight from the table, and PostgREST 400s on a column that does not
    // exist — the same trap columns.tsx documents for the courses list, where
    // `institution` and `dates` are synthetic and therefore not sortable.
    const SORTABLE = new Set([
      'created_at', 'applicant_name', 'applicant_phone', 'applicant_email', 'status',
      'applicant_type', 'decided_at',
    ]);
    const sortBy = SORTABLE.has(String(params.sortBy)) ? String(params.sortBy) : 'created_at';
    const ascending = params.sortDirection === 'asc';

    let query = this.supabase
      .from('course_applications')
      // count:'exact' so the pager shows a true total rather than guessing from
      // a page length.
      .select(SELECT, { count: 'exact' })
      .eq('course_event_id', courseEventId);

    if (params.status) query = query.eq('status', params.status);
    if (params.applicant_type) query = query.eq('applicant_type', params.applicant_type);

    const search = params.search?.trim();
    if (search) {
      const safe = search.replace(/[,()]/g, ' ').trim();
      if (safe) {
        query = query.or(
          `applicant_name.ilike.%${safe}%,applicant_phone.ilike.%${safe}%,applicant_email.ilike.%${safe}%`,
        );
      }
    }

    const { data, error, count } = await query
      .order(sortBy, { ascending })
      .range(from, from + limit - 1);

    if (error) throw error;

    const total = count ?? 0;
    return {
      data: (data ?? []) as unknown as CourseApplication[],
      metadata: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  static async getById(id: string): Promise<CourseApplication> {
    const { data, error } = await this.supabase
      .from('course_applications')
      .select(SELECT)
      .eq('id', id)
      .single();

    if (error) throw error;
    return data as unknown as CourseApplication;
  }

  /**
   * Counts per status, for the summary row.
   *
   * Counted from the UNFILTERED set on purpose. Facet counts derived from rows
   * that already had the filters applied report the filter back to itself — the
   * Pending tab would read "Pending 3" while Pending was selected and "Pending
   * 0" while Approved was, which has bitten this codebase before.
   */
  static async countsByCourse(courseEventId: string): Promise<CourseApplicationCounts> {
    const { data, error } = await this.supabase
      .from('course_applications')
      .select('status')
      .eq('course_event_id', courseEventId);

    if (error) throw error;

    const counts = Object.fromEntries(
      COURSE_APPLICATION_STATUSES.map((s) => [s, 0]),
    ) as Record<CourseApplicationStatus, number>;

    for (const row of (data ?? []) as { status: string }[]) {
      const s = row.status as CourseApplicationStatus;
      if (s in counts) counts[s] += 1;
    }

    return { ...counts, total: (data ?? []).length };
  }

  // ── decisions ──────────────────────────────────────────────────────────────

  /**
   * Approve. Goes through the API route rather than the RPC directly — see the
   * class note. Returns the JKKN ID and, only when a login was newly created,
   * the temporary password. That password is never stored and cannot be fetched
   * again, so the caller must show it before the response is discarded.
   */
  static async approve(
    applicationId: string,
    input: { email: string; packageId?: string | null; decisionNote?: string | null },
  ): Promise<CourseApprovalResult> {
    const res = await fetch(`/api/courses/applications/${applicationId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        packageId: input.packageId ?? undefined,
        decisionNote: input.decisionNote ?? undefined,
      }),
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      // The RPC's own RAISE messages are written for an admin and name the
      // actual problem ("Package X has no instalment schedule..."), so they are
      // surfaced as-is rather than replaced with something generic.
      throw new Error(json?.error ?? 'Could not approve this application.');
    }
    return json as CourseApprovalResult;
  }

  /**
   * Issue a NEW temporary password for an enrolled participant and email it.
   *
   * Keyed on the ENROLLMENT, not the profile: the enrollment carries
   * institution_id and is RLS-gated, so it is what proves the caller may act on
   * this person. Goes through the route because setting a password is an
   * auth-admin call the browser must never make.
   */
  static async resendCredentials(
    enrollmentId: string,
    email?: string | null,
  ): Promise<CourseCredentialsResult> {
    const res = await fetch(`/api/courses/enrollments/${enrollmentId}/resend-credentials`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email ?? undefined }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      throw new Error(json?.error ?? 'Could not issue new sign-in details.');
    }
    return json as CourseCredentialsResult;
  }

  /** Reject. Straight to the RPC: no identity is provisioned, so there is
   *  nothing the browser client cannot do. */
  static async reject(applicationId: string, decisionNote?: string | null): Promise<void> {
    const { error } = await this.supabase.rpc('fn_course_reject_application', {
      p_application_id: applicationId,
      p_decision_note: decisionNote || null,
    } as any);
    if (error) throw error;
  }
}
