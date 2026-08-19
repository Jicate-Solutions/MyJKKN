import { BaseService } from '@/lib/services/base-service';
import type {
  CourseApplication,
  CourseApplicationCounts,
  CourseApplicationFilters,
  CourseApplicationStatus,
} from '@/types/courses';
import { COURSE_APPLICATION_STATUSES } from '@/types/courses';

/**
 * Course applications — READ ONLY.
 *
 * There is deliberately no approve/reject method here. Approving an application
 * is not a status update: it has to provision a profile, issue a JKKN ID through
 * fn_issue_jkkn_id('external_participant', …), grant the Course Participant role,
 * insert a course_enrollments row snapshotting the package price, and generate
 * bills from the instalment schedule — all in one transaction. That belongs in a
 * SECURITY DEFINER RPC, not in five client-side writes that can half-succeed and
 * leave a person holding a JKKN ID with no enrollment.
 *
 * Until that RPC exists, this service lets an admin SEE who applied. A
 * half-built decide button that only moved `status` would be worse than none:
 * course_applications_decision_chk would accept it, the applicant would read as
 * approved, and no identity, enrollment or bill would exist anywhere.
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
  decided_by_profile:profiles!course_applications_decided_by_fkey(id, full_name)
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
}
