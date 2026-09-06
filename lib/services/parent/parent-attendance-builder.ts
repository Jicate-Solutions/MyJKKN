/**
 * Parent Portal — per-learner attendance summary (server).
 *
 * PRIMARY path: the SAME logic the student-facing "My Attendance" page uses
 * (StudentAttendanceService) — semester-scoped + timetable-aware. Fits colleges.
 *
 * FALLBACK path: when there's no semester or that path finds nothing (common for
 * SCHOOLS, which record attendance without semester timetables), aggregate
 * directly from student_attendance by section. Either way it's period/marking
 * based, so a parent sees what the learner sees.
 *
 * Node runtime only (service-role client).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { StudentAttendanceService } from '@/lib/services/learners/student-attendance-service';
import type { AttendanceSummary } from '@/types/parent-portal';

const THRESHOLD = 75;

const EMPTY = (semesterId?: string | null): AttendanceSummary => ({
  semesterId: semesterId ?? undefined,
  totalClasses: 0,
  present: 0,
  absent: 0,
  percentage: 0,
  threshold: THRESHOLD,
  isAboveThreshold: false,
  recentMissed: [],
});

interface MarkRecord {
  date: string;
  status: string;
}

function summarize(records: MarkRecord[], semesterId?: string | null): AttendanceSummary {
  const total = records.length;
  const present = records.filter((r) => r.status === 'Present' || r.status === 'OnDuty').length;
  const absent = total - present;
  const percentage = total > 0 ? Math.round((present / total) * 100) : 0;

  const seen = new Set<string>();
  const recentMissed: AttendanceSummary['recentMissed'] = [];
  for (const r of records) {
    if (r.status === 'Present') continue;
    if (seen.has(r.date)) continue;
    seen.add(r.date);
    recentMissed.push({ date: r.date, status: r.status === 'OnDuty' ? 'on_duty' : 'absent' });
    if (recentMissed.length >= 8) break;
  }

  return {
    semesterId: semesterId ?? undefined,
    totalClasses: total,
    present,
    absent,
    percentage,
    threshold: THRESHOLD,
    isAboveThreshold: percentage >= THRESHOLD,
    recentMissed,
  };
}

/** Direct section scan of student_attendance (no timetable requirement). */
async function directSectionRecords(
  db: SupabaseClient,
  learnerId: string,
  sectionId: string,
  institutionId: string | null,
  academicYearId: string | null
): Promise<MarkRecord[]> {
  let q = db
    .from('student_attendance')
    .select('attendance_date, attendance_data')
    .eq('section_id', sectionId)
    .order('attendance_date', { ascending: false });
  if (institutionId) q = q.eq('institution_id', institutionId);
  if (academicYearId) q = q.eq('academic_year_id', academicYearId);

  const { data, error } = await q;
  if (error || !data) return [];

  const out: MarkRecord[] = [];
  for (const rec of data as Array<{ attendance_date: string; attendance_data: unknown }>) {
    const periods = (rec.attendance_data ?? {}) as Record<
      string,
      { students?: Array<{ student_id?: string; status?: string }> }
    >;
    for (const period of Object.values(periods)) {
      const mine = period?.students?.find((s) => s.student_id === learnerId);
      if (mine?.status) out.push({ date: rec.attendance_date, status: mine.status });
    }
  }
  return out;
}

export async function buildAttendanceSummary(
  db: SupabaseClient,
  args: {
    learnerId: string;
    semesterId: string | null;
    sectionId: string | null;
    institutionId: string | null;
    academicYearId: string | null;
  }
): Promise<AttendanceSummary> {
  const { learnerId, semesterId, sectionId, institutionId, academicYearId } = args;

  // 1. Primary: semester + timetable path (colleges).
  if (semesterId) {
    const records = await StudentAttendanceService.getStudentAttendanceBySemester(
      learnerId,
      semesterId,
      db
    );
    if (records.length) {
      return summarize(
        records.map((r) => ({ date: r.date, status: r.status })),
        semesterId
      );
    }
  }

  // 2. Fallback: direct section scan (schools / no-timetable setups).
  if (sectionId) {
    const records = await directSectionRecords(db, learnerId, sectionId, institutionId, academicYearId);
    if (records.length) return summarize(records, semesterId);
  }

  return EMPTY(semesterId);
}
