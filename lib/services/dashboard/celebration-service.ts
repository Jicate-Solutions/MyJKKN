import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';

export interface Celebration {
  id: string;
  name: string;
  type: 'birthday' | 'work_anniversary';
  date: string;
  age?: number;
  years?: number;
  role: string;
  avatar_url?: string;
  days_until: number;
  institution_name?: string;
  department_name?: string;
  designation?: string;
  section_name?: string;
  program_name?: string;
}

export interface TodayCelebrations {
  birthdays: Celebration[];
  workAnniversaries: Celebration[];
}

export class CelebrationService {
  /**
   * Get today's celebrations (birthdays + work anniversaries)
   * Scoped by institution for multi-tenancy
   */
  static async getTodayCelebrations(
    userId: string,
    role: string
  ): Promise<TodayCelebrations> {
    const supabase = createClientSupabaseClient();

    // Get user's institution for scoping
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('institution_id, department_id')
      .eq('id', userId)
      .single();

    if (profileError) {
      logger.error('dashboard/celebrations', 'Failed to fetch user profile', profileError);
      return { birthdays: [], workAnniversaries: [] };
    }

    if (!userProfile) {
      logger.warn('dashboard/celebrations', 'No user profile found', { userId });
      return { birthdays: [], workAnniversaries: [] };
    }

    // Super admins may not have an institution_id - allow them to see all institutions' celebrations
    if (!userProfile.institution_id) {
      if (role !== 'super_admin' && role !== 'admin') {
        logger.info('dashboard/celebrations', 'No institution_id for user, skipping celebrations', { userId, role });
        return { birthdays: [], workAnniversaries: [] };
      }
      // If super_admin/admin, proceed without institution filter (show all)
    }

    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    const birthdays: Celebration[] = [];
    const workAnniversaries: Celebration[] = [];

    // ── Staff: single query for both birthdays and work anniversaries ──────────
    // Selecting raw ID columns avoids PostgREST FK expansion (which requires
    // declared FOREIGN KEY constraints). Names are resolved via batch lookups below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let staffQuery = (supabase as any)
      .from('staff')
      .select('id, first_name, last_name, date_of_birth, date_of_joining, profile_picture, designation, institution_id, department_id');

    if (userProfile.institution_id) {
      staffQuery = staffQuery.eq('institution_id', userProfile.institution_id);
    }

    const { data: staffData, error: staffError } = await staffQuery;

    if (staffError) {
      logger.error('dashboard/celebrations', 'Failed to fetch staff birthdays', staffError);
    } else if (staffData && staffData.length > 0) {
      // Batch-fetch institution and department names in parallel
      const staffInstIds = [...new Set((staffData as any[]).map((s: any) => s.institution_id).filter(Boolean))] as string[];
      const deptIds = [...new Set((staffData as any[]).map((s: any) => s.department_id).filter(Boolean))] as string[];

      const [{ data: instRows }, { data: deptRows }] = await Promise.all([
        staffInstIds.length > 0
          ? supabase.from('institutions').select('id, name').in('id', staffInstIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        deptIds.length > 0
          ? supabase.from('departments').select('id, department_name').in('id', deptIds)
          : Promise.resolve({ data: [] as { id: string; department_name: string }[] }),
      ]);

      const staffInstMap: Record<string, string> = Object.fromEntries((instRows || []).map((i: any) => [i.id, i.name]));
      const deptMap: Record<string, string> = Object.fromEntries((deptRows || []).map((d: any) => [d.id, d.department_name]));

      // Single loop handles both birthday and anniversary checks
      (staffData as any[]).forEach((staff: any) => {
        const fullName = [staff.first_name, staff.last_name].filter(Boolean).join(' ') || 'Unknown';
        const institutionName = staffInstMap[staff.institution_id] || undefined;
        const departmentName = deptMap[staff.department_id] || undefined;

        if (staff.date_of_birth) {
          const dob = new Date(staff.date_of_birth);
          if (dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay) {
            birthdays.push({
              id: staff.id,
              name: fullName,
              type: 'birthday',
              date: staff.date_of_birth,
              age: today.getFullYear() - dob.getFullYear(),
              role: 'Team Member',
              avatar_url: staff.profile_picture || undefined,
              days_until: 0,
              institution_name: institutionName,
              department_name: departmentName,
              designation: staff.designation || undefined,
            });
          }
        }

        if (staff.date_of_joining) {
          const joinDate = new Date(staff.date_of_joining);
          if (joinDate.getMonth() + 1 === todayMonth && joinDate.getDate() === todayDay) {
            const years = today.getFullYear() - joinDate.getFullYear();
            if (years > 0) {
              workAnniversaries.push({
                id: staff.id,
                name: fullName,
                type: 'work_anniversary',
                date: staff.date_of_joining,
                years,
                role: 'Team Member',
                avatar_url: staff.profile_picture || undefined,
                days_until: 0,
                institution_name: institutionName,
                department_name: departmentName,
                designation: staff.designation || undefined,
              });
            }
          }
        }
      });
    }

    // ── Student birthdays (faculty/admin only) ─────────────────────────────────
    if (role !== 'student') {
      // Step 1: fetch learners with raw ID columns only
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let studentQuery = (supabase as any)
        .from('learners_profiles')
        .select('id, first_name, last_name, date_of_birth, student_photo_url, institution_id, section_id')
        .eq('lifecycle_status', 'active')
        .not('date_of_birth', 'is', null);

      if (userProfile.institution_id) {
        studentQuery = studentQuery.eq('institution_id', userProfile.institution_id);
      }

      const { data: studentData, error: studentError } = await studentQuery;

      if (studentError) {
        logger.error('dashboard/celebrations', 'Failed to fetch student birthdays', studentError);
      } else if (studentData && studentData.length > 0) {
        // Step 2: batch-fetch institutions + sections in parallel
        const studInstIds = [...new Set((studentData as any[]).map((s: any) => s.institution_id).filter(Boolean))] as string[];
        const sectIds = [...new Set((studentData as any[]).map((s: any) => s.section_id).filter(Boolean))] as string[];

        const [{ data: instRows2 }, { data: sectRows }] = await Promise.all([
          studInstIds.length > 0
            ? supabase.from('institutions').select('id, name').in('id', studInstIds)
            : Promise.resolve({ data: [] as { id: string; name: string }[] }),
          sectIds.length > 0
            ? supabase.from('sections').select('id, section_name, program_id').in('id', sectIds)
            : Promise.resolve({ data: [] as { id: string; section_name: string; program_id: string }[] }),
        ]);

        // Step 3: batch-fetch programs (depends on program_ids from sections)
        const progIds = [...new Set((sectRows || []).map((s: any) => s.program_id).filter(Boolean))] as string[];
        const { data: progRows } = progIds.length > 0
          ? await supabase.from('programs').select('id, program_name').in('id', progIds)
          : { data: [] as { id: string; program_name: string }[] };

        const studInstMap: Record<string, string> = Object.fromEntries((instRows2 || []).map((i: any) => [i.id, i.name]));
        const progMap: Record<string, string> = Object.fromEntries((progRows || []).map((p: any) => [p.id, p.program_name]));
        const sectMap: Record<string, { section_name: string; program_name?: string }> = Object.fromEntries(
          (sectRows || []).map((s: any) => [s.id, { section_name: s.section_name, program_name: progMap[s.program_id] }])
        );

        (studentData as any[]).forEach((student: any) => {
          const dob = new Date(student.date_of_birth);
          if (dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay) {
            const fullName = [student.first_name, student.last_name].filter(Boolean).join(' ') || 'Unknown';
            birthdays.push({
              id: student.id,
              name: fullName,
              type: 'birthday',
              date: student.date_of_birth,
              age: today.getFullYear() - dob.getFullYear(),
              role: 'Learner',
              avatar_url: student.student_photo_url || undefined,
              days_until: 0,
              institution_name: studInstMap[student.institution_id] || undefined,
              section_name: sectMap[student.section_id]?.section_name || undefined,
              program_name: sectMap[student.section_id]?.program_name || undefined,
            });
          }
        });
      }
    }

    return { birthdays, workAnniversaries };
  }

  /**
   * Get upcoming celebrations in next N days
   */
  static async getUpcomingCelebrations(
    institutionId: string,
    days: number = 7
  ): Promise<Celebration[]> {
    const supabase = createClientSupabaseClient();
    const celebrations: Celebration[] = [];
    const today = new Date();

    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('id, first_name, last_name, date_of_birth, date_of_joining, profile_picture, category_id')
      .eq('institution_id', institutionId);

    if (staffError) {
      logger.error('dashboard/celebrations', 'Failed to fetch staff for upcoming celebrations', staffError);
      return [];
    }

    if (staff) {
      staff.forEach((person) => {
        const fullName = [person.first_name, person.last_name].filter(Boolean).join(' ');

        // Check birthday
        if (person.date_of_birth) {
          const dob = new Date(person.date_of_birth);
          const thisYearBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
          const daysUntil = Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          if (daysUntil > 0 && daysUntil <= days) {
            celebrations.push({
              id: person.id,
              name: fullName || 'Unknown',
              type: 'birthday',
              date: person.date_of_birth,
              age: today.getFullYear() - dob.getFullYear(),
              role: 'Staff',
              avatar_url: person.profile_picture || undefined,
              days_until: daysUntil
            });
          }
        }

        // Check work anniversary
        if (person.date_of_joining) {
          const joinDate = new Date(person.date_of_joining);
          const thisYearAnniversary = new Date(today.getFullYear(), joinDate.getMonth(), joinDate.getDate());
          const daysUntil = Math.ceil((thisYearAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const years = today.getFullYear() - joinDate.getFullYear();

          if (daysUntil > 0 && daysUntil <= days && years > 0) {
            celebrations.push({
              id: person.id,
              name: fullName || 'Unknown',
              type: 'work_anniversary',
              date: person.date_of_joining,
              years,
              role: 'Staff',
              avatar_url: person.profile_picture || undefined,
              days_until: daysUntil
            });
          }
        }
      });
    }

    return celebrations.sort((a, b) => a.days_until - b.days_until);
  }

  /**
   * Get user's next celebration
   */
  static async getMyNextCelebration(userId: string): Promise<Celebration | null> {
    const supabase = createClientSupabaseClient();

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, institution_id, learner_id')
      .eq('id', userId)
      .single();

    if (profileError) {
      logger.error('dashboard/celebrations', 'Failed to fetch profile for next celebration', profileError);
      return null;
    }

    if (!profile) {
      logger.warn('dashboard/celebrations', 'No profile found for user', { userId });
      return null;
    }

    const today = new Date();
    const celebrations: Celebration[] = [];

    if (profile.role === 'student') {
      if (!profile.learner_id) {
        logger.warn('dashboard/celebrations', 'Student profile not linked to learner record', { userId });
        return null;
      }

      const { data: student, error: studentError } = await supabase
        .from('learners_profiles')
        .select('id, first_name, last_name, date_of_birth')
        .eq('id', profile.learner_id)
        .single();

      if (studentError) {
        logger.error('dashboard/celebrations', 'Failed to fetch student profile for celebration', studentError);
      } else if (student?.date_of_birth) {
        const dob = new Date(student.date_of_birth);
        const thisYearBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
        let daysUntil = Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntil < 0) {
          const nextYearBirthday = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
          daysUntil = Math.ceil((nextYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        const fullName = [student.first_name, student.last_name].filter(Boolean).join(' ');
        celebrations.push({
          id: student.id,
          name: fullName || 'Unknown',
          type: 'birthday',
          date: student.date_of_birth,
          age: today.getFullYear() - dob.getFullYear(),
          role: 'Student',
          days_until: daysUntil
        });
      }
    } else {
      // Using explicit typing to avoid "Type instantiation is excessively deep" error
      type StaffCelebrationData = {
        id: string;
        first_name: string | null;
        last_name: string | null;
        date_of_birth: string | null;
        date_of_joining: string | null;
        category_id: string | null;
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const staffQuery = supabase.from('staff') as any;
      const staffResult = await staffQuery
        .select('id, first_name, last_name, date_of_birth, date_of_joining, category_id')
        .eq('user_id', userId)
        .single();

      const staff = staffResult.data as StaffCelebrationData | null;
      const staffError = staffResult.error as Error | null;

      if (staffError) {
        logger.error('dashboard/celebrations', 'Failed to fetch staff profile for celebration', staffError);
      } else if (staff) {
        const fullName = [staff.first_name, staff.last_name].filter(Boolean).join(' ');

        if (staff.date_of_birth) {
          const dob = new Date(staff.date_of_birth);
          const thisYearBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());
          let daysUntil = Math.ceil((thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          if (daysUntil < 0) {
            const nextYearBirthday = new Date(today.getFullYear() + 1, dob.getMonth(), dob.getDate());
            daysUntil = Math.ceil((nextYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          }

          celebrations.push({
            id: staff.id,
            name: fullName || 'Unknown',
            type: 'birthday',
            date: staff.date_of_birth,
            age: today.getFullYear() - dob.getFullYear(),
            role: 'Staff',
            days_until: daysUntil
          });
        }

        if (staff.date_of_joining) {
          const joinDate = new Date(staff.date_of_joining);
          const thisYearAnniversary = new Date(today.getFullYear(), joinDate.getMonth(), joinDate.getDate());
          let daysUntil = Math.ceil((thisYearAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const years = today.getFullYear() - joinDate.getFullYear();

          if (daysUntil < 0) {
            const nextYearAnniversary = new Date(today.getFullYear() + 1, joinDate.getMonth(), joinDate.getDate());
            daysUntil = Math.ceil((nextYearAnniversary.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          }

          if (years > 0) {
            celebrations.push({
              id: staff.id,
              name: fullName || 'Unknown',
              type: 'work_anniversary',
              date: staff.date_of_joining,
              years,
              role: 'Staff',
              days_until: daysUntil
            });
          }
        }
      }
    }

    if (celebrations.length === 0) return null;
    return celebrations.sort((a, b) => a.days_until - b.days_until)[0];
  }
}
