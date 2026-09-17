import { useQuery } from '@tanstack/react-query';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { TimetableFilters } from '@/types/academics';

// ─── Filters ──────────────────────────────────────────────────────────────────

/**
 * The Timetable dropdown must offer every timetable the Pending list itself can
 * produce rows for, and that list (getTodayPendingAttendance) reads EVERY active
 * timetable, whatever its `is_template` flag.
 *
 * It used to add `is_template: false`, on the assumption that a template is not
 * a real schedule. On production it is: "Save as Template" on the create/edit
 * form flags the live timetable itself, it does not copy it. Measured
 * 2026-09-11: 20 active timetables carry the flag, all 20 have attendance
 * marked on them, and 17 were marked within the last week. At JKKN Arts and Science
 * (Aided) that hid I B.Sc Chemistry, I B.Sc Mathematics and I B.Sc Zoology, so a
 * faculty member could pick any class but the first years (BUG-006094).
 */
export function buildPendingTimetableFilters(params: {
  institutionId?: string;
  academicYearId?: string;
  departmentId?: string;
  semesterId?: string;
}): TimetableFilters {
  return {
    institution_id: params.institutionId,
    academic_year_id: params.academicYearId,
    department_id: params.departmentId,
    semester: params.semesterId,
    is_active: true,
    limit: 100,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTimetablesForPending(params: {
  institutionId?: string;
  academicYearId?: string;
  departmentId?: string;
  semesterId?: string;
  isFaculty?: boolean;
  /** Phase 2: will filter to timetables where staff appears as primary_staff_id or in staff_ids[]. Currently scoped by RLS. */
  staffId?: string;
  enabled?: boolean;
}) {
  const {
    institutionId,
    academicYearId,
    departmentId,
    semesterId,
    isFaculty,
    staffId: _staffId,
    enabled,
  } = params;

  const queryFilters = buildPendingTimetableFilters({
    institutionId,
    academicYearId,
    departmentId,
    semesterId,
  });

  // Faculty are scoped by Supabase RLS on the timetables table via JWT claims —
  // no explicit institution_id filter is required for faculty users.
  const isEnabled = (enabled !== false) && (!!institutionId || !!isFaculty);

  const query = useQuery({
    queryKey: ['timetables-for-pending', queryFilters],
    queryFn: () => TimetableService.getTimetables(queryFilters),
    enabled: isEnabled,
    ...QUERY_CONFIG.TIMETABLE_DATA,
  });

  const timetables =
    query.data?.data?.map((t) => ({
      id: t.id,
      name: t.timetable_name,
      academicYearId: t.academic_year_id ?? '',
    })) ?? [];

  return {
    timetables,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
