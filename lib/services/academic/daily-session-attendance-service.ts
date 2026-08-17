/**
 * Day-wise (FN & AN) session attendance service.
 * ------------------------------------------------------------------
 * A clean, date+session based attendance subsystem for school
 * (session_wise) classes — deliberately decoupled from the course/period
 * machinery (timetable slots, subject staff, student_attendance).
 *
 * Storage: public.daily_session_attendance, one row per (section, date, session).
 * Roster:  all active students of the section (learners_profiles).
 * Authz:   the class incharge (timetable.class_incharge_id or section-level
 *          class_incharges) — or an explicit admin/HOD override.
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { FacultyAttendanceService } from './faculty-attendance-service';
import type {
  DaySession,
  DaySessionStudentStatus,
  DaySessionRosterStudent,
  DaySessionClass,
  DailySessionAttendanceRecord
} from '@/types/attendance';

export class DailySessionAttendanceService {
  private static supabase = createClientSupabaseClient();

  // -- internal: untyped client for the new table -------------------------
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static get sb(): any {
    return this.supabase as any;
  }

  /**
   * The session_wise classes a staff is incharge of, with display labels.
   * Sources: timetable-level class_incharge_id + section-level class_incharges.
   */
  static async getInchargeClasses(staffId: string): Promise<DaySessionClass[]> {
    if (!staffId) return [];
    const select = `
      id, institution_id, section_id, timetable_name,
      sections:section_id(section_name)
    `;
    try {
      const [directRes, sectionRowsRes] = await Promise.all([
        this.sb
          .from('timetables')
          .select(select)
          .eq('class_incharge_id', staffId)
          .eq('attendance_mode', 'session_wise')
          .eq('is_active', true),
        this.sb
          .from('class_incharges')
          .select('section_id')
          .eq('staff_id', staffId)
          .eq('is_active', true)
      ]);

      const byTimetable = new Map<string, DaySessionClass>();
      for (const t of (directRes.data || []) as any[]) {
        byTimetable.set(t.id, mapClass(t));
      }

      const sectionIds = ((sectionRowsRes.data || []) as any[])
        .map((r) => r.section_id)
        .filter(Boolean);
      if (sectionIds.length > 0) {
        const { data } = await this.sb
          .from('timetables')
          .select(select)
          .in('section_id', sectionIds)
          .eq('attendance_mode', 'session_wise')
          .eq('is_active', true);
        for (const t of (data || []) as any[]) {
          byTimetable.set(t.id, mapClass(t));
        }
      }

      return Array.from(byTimetable.values());
    } catch (error) {
      logger.error('academic/attendance', 'Error resolving day-wise incharge classes', {
        staffId,
        error
      });
      return [];
    }
  }

  /**
   * All active session_wise classes (optionally scoped to an institution).
   * Used by admins / HOD / super-admins, who are not incharges but must be able
   * to mark any day-wise class. Omit institutionId for super-admins (all).
   */
  static async getAllSessionClasses(
    institutionId?: string
  ): Promise<DaySessionClass[]> {
    const select = `
      id, institution_id, section_id, timetable_name,
      sections:section_id(section_name),
      institutions:institution_id(name)
    `;
    try {
      let q = this.sb
        .from('timetables')
        .select(select)
        .eq('attendance_mode', 'session_wise')
        .eq('is_active', true)
        .not('section_id', 'is', null);
      if (institutionId) q = q.eq('institution_id', institutionId);
      const { data, error } = await q;
      if (error) throw error;
      const byTimetable = new Map<string, DaySessionClass>();
      for (const t of (data || []) as any[]) byTimetable.set(t.id, mapClass(t));
      return Array.from(byTimetable.values());
    } catch (error) {
      logger.error('academic/attendance', 'Error resolving all session classes', {
        institutionId,
        error
      });
      return [];
    }
  }

  /** All active students of a section, ordered by roll number. */
  static async getSectionRoster(
    sectionId: string
  ): Promise<DaySessionRosterStudent[]> {
    if (!sectionId) return [];
    try {
      const { data, error } = await this.sb
        .from('learners_profiles')
        .select('id, first_name, last_name, roll_number, student_photo_url')
        .eq('section_id', sectionId)
        .eq('lifecycle_status', 'active')
        .order('roll_number', { ascending: true });
      if (error) throw error;
      return (data || []) as DaySessionRosterStudent[];
    } catch (error) {
      logger.error('academic/attendance', 'Error fetching section roster', {
        sectionId,
        error
      });
      return [];
    }
  }

  /**
   * Both sessions (FN, AN) for a class on a date, read from the shared
   * student_attendance row whose attendance_data is keyed by 'FN'/'AN'.
   * Returns one pseudo-record per session that actually has data.
   */
  static async getDailyAttendance(
    timetableId: string,
    sectionId: string,
    date: string
  ): Promise<DailySessionAttendanceRecord[]> {
    if (!timetableId || !sectionId || !date) return [];
    try {
      const { data, error } = await this.sb
        .from('student_attendance')
        .select('attendance_data')
        .eq('timetable_id', timetableId)
        .eq('section_id', sectionId)
        .eq('attendance_date', date)
        .maybeSingle();
      if (error) throw error;

      const attendanceData = (data?.attendance_data || {}) as Record<
        string,
        any
      >;
      const out: DailySessionAttendanceRecord[] = [];
      (['FN', 'AN'] as const).forEach((sess) => {
        const slot = attendanceData[sess];
        if (slot && Array.isArray(slot.students)) {
          out.push({
            id: `${timetableId}_${date}_${sess}`,
            institution_id: '',
            section_id: sectionId,
            timetable_id: timetableId,
            attendance_date: date,
            session: sess,
            attendance_data: { students: slot.students },
            created_at: '',
            updated_at: ''
          });
        }
      });
      return out;
    } catch (error) {
      logger.error('academic/attendance', 'Error fetching daily session attendance', {
        timetableId,
        sectionId,
        date,
        error
      });
      return [];
    }
  }

  /**
   * Whether the current user may mark this section's day-wise attendance:
   * the timetable's class_incharge_id, a section-level class_incharges row,
   * or an explicit admin/HOD override passed by the caller.
   */
  private static async authorize(params: {
    sectionId: string;
    timetableId?: string | null;
    allowOverride?: boolean;
  }): Promise<boolean> {
    if (params.allowOverride) return true;

    const { data: userData } = await this.supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) return false;

    // getStaffIdByEmail now THROWS on a real failure rather than returning null
    // (BUG-005820). This is an AUTHORISATION gate, so a failure must deny —
    // never fall through to "allowed" — but it is logged distinctly so a run of
    // denials caused by timeouts is not mistaken for people genuinely lacking
    // incharge rights.
    let staffId: string | null;
    try {
      staffId = await FacultyAttendanceService.getStaffIdByEmail(email);
    } catch (error) {
      logger.error(
        'academic/daily-session-attendance',
        'Staff lookup failed while authorising day-wise marking — denying',
        error
      );
      return false;
    }
    if (!staffId) return false;

    // timetable-level incharge
    if (params.timetableId) {
      const { data: tt } = await this.sb
        .from('timetables')
        .select('class_incharge_id')
        .eq('id', params.timetableId)
        .single();
      if (tt?.class_incharge_id && tt.class_incharge_id === staffId) return true;
    }

    // section-level incharge
    const { data: ci } = await this.sb
      .from('class_incharges')
      .select('id')
      .eq('section_id', params.sectionId)
      .eq('staff_id', staffId)
      .eq('is_active', true)
      .limit(1);
    return (ci?.length ?? 0) > 0;
  }

  /**
   * Upsert one session's attendance for a section on a date.
   * Throws if the caller is not authorized.
   */
  static async saveSession(input: {
    institutionId: string;
    sectionId: string;
    timetableId?: string | null;
    date: string;
    session: DaySession;
    statuses: DaySessionStudentStatus[];
    allowOverride?: boolean;
  }): Promise<DailySessionAttendanceRecord> {
    const authorized = await this.authorize({
      sectionId: input.sectionId,
      timetableId: input.timetableId,
      allowOverride: input.allowOverride
    });
    if (!authorized) {
      throw new Error(
        'You are not authorized to mark day-wise attendance for this class. Only the class incharge can mark it.'
      );
    }

    // One student_attendance row per (institution, timetable, section, date);
    // the two sessions live side-by-side in attendance_data keyed 'FN'/'AN'.
    // Read-merge-write so saving one session never clobbers the other.
    const { data: existing } = await this.sb
      .from('student_attendance')
      .select('attendance_data')
      .eq('timetable_id', input.timetableId)
      .eq('section_id', input.sectionId)
      .eq('attendance_date', input.date)
      .maybeSingle();

    const attendanceData: Record<string, any> =
      existing?.attendance_data && typeof existing.attendance_data === 'object'
        ? { ...existing.attendance_data }
        : {};
    attendanceData[input.session] = { students: input.statuses };

    // Hierarchy columns power the consolidation/report joins — copy from the
    // timetable so day-wise rows group correctly alongside period-wise ones.
    const { data: tt } = await this.sb
      .from('timetables')
      .select('degree_id, department_id, program_id, semester_id, academic_year_id')
      .eq('id', input.timetableId)
      .single();

    const row = {
      institution_id: input.institutionId,
      timetable_id: input.timetableId,
      section_id: input.sectionId,
      attendance_date: input.date,
      attendance_data: attendanceData,
      degree_id: tt?.degree_id ?? null,
      department_id: tt?.department_id ?? null,
      program_id: tt?.program_id ?? null,
      semester_id: tt?.semester_id ?? null,
      academic_year_id: tt?.academic_year_id ?? null,
      updated_at: new Date().toISOString()
    };

    const { data, error } = await this.sb
      .from('student_attendance')
      .upsert(row, {
        onConflict: 'institution_id,timetable_id,section_id,attendance_date'
      })
      .select('id')
      .single();

    if (error) {
      logger.error('academic/attendance', 'Error saving day-wise session attendance', {
        input: { ...input, statuses: input.statuses.length },
        error
      });
      throw error;
    }

    return {
      id: data?.id,
      institution_id: input.institutionId,
      section_id: input.sectionId,
      timetable_id: input.timetableId ?? null,
      attendance_date: input.date,
      session: input.session,
      attendance_data: { students: input.statuses },
      created_at: '',
      updated_at: ''
    } as DailySessionAttendanceRecord;
  }
}

function mapClass(t: any): DaySessionClass {
  const sectionName = Array.isArray(t.sections)
    ? t.sections[0]?.section_name
    : t.sections?.section_name;
  const institutionName = Array.isArray(t.institutions)
    ? t.institutions[0]?.name
    : t.institutions?.name;
  const base = t.timetable_name || sectionName || 'Class';
  return {
    timetable_id: t.id,
    institution_id: t.institution_id,
    institution_name: institutionName || undefined,
    section_id: t.section_id,
    section_name: sectionName || '',
    // Prefix with institution when known (super-admin spans many schools).
    class_label: institutionName ? `${institutionName} — ${base}` : base
  };
}
