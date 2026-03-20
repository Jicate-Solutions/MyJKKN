import { useQuery } from '@tanstack/react-query';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';
import type { TimetableFilters } from '@/types/academics';

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

  const queryFilters: TimetableFilters = {
    institution_id: institutionId,
    academic_year_id: academicYearId,
    department_id: departmentId,
    semester: semesterId,
    is_active: true,
    is_template: false,
    limit: 100,
  };

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
