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

    // Super admins may not have an institution_id - skip celebrations for them
    // or in the future, allow them to see all institutions' celebrations
    if (!userProfile.institution_id) {
      logger.info('dashboard/celebrations', 'No institution_id for user, skipping celebrations', { userId, role });
      return { birthdays: [], workAnniversaries: [] };
    }

    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    const birthdays: Celebration[] = [];

    // Get staff birthdays
    const { data: staffBirthdays, error: staffError } = await supabase
      .from('staff')
      .select('id, first_name, last_name, date_of_birth, profile_picture, department_id, category_id')
      .eq('institution_id', userProfile.institution_id)
      .not('date_of_birth', 'is', null);

    if (staffError) {
      logger.error('dashboard/celebrations', 'Failed to fetch staff birthdays', staffError);
    } else if (staffBirthdays) {
      staffBirthdays.forEach((staff) => {
        const dob = new Date(staff.date_of_birth!);
        if (dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay) {
          const age = today.getFullYear() - dob.getFullYear();
          const fullName = [staff.first_name, staff.last_name].filter(Boolean).join(' ');
          birthdays.push({
            id: staff.id,
            name: fullName || 'Unknown',
            type: 'birthday',
            date: staff.date_of_birth!,
            age,
            role: 'Staff',
            avatar_url: staff.profile_picture || undefined,
            days_until: 0
          });
        }
      });
    }

    // Get student birthdays (only if faculty/admin)
    if (role !== 'student') {
      const { data: studentBirthdays, error: studentError } = await supabase
        .from('learners_profiles')
        .select('id, first_name, last_name, date_of_birth, student_photo_url, section_id')
        .eq('institution_id', userProfile.institution_id)
        .eq('lifecycle_status', 'active')
        .not('date_of_birth', 'is', null);

      if (studentError) {
        logger.error('dashboard/celebrations', 'Failed to fetch student birthdays', studentError);
      } else if (studentBirthdays) {
        studentBirthdays.forEach((student) => {
          const dob = new Date(student.date_of_birth!);
          if (dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay) {
            const age = today.getFullYear() - dob.getFullYear();
            const fullName = [student.first_name, student.last_name].filter(Boolean).join(' ');
            birthdays.push({
              id: student.id,
              name: fullName || 'Unknown',
              type: 'birthday',
              date: student.date_of_birth!,
              age,
              role: 'Student',
              avatar_url: student.student_photo_url || undefined,
              days_until: 0
            });
          }
        });
      }
    }

    // Get work anniversaries (staff only)
    const workAnniversaries: Celebration[] = [];

    const { data: staffAnniversaries, error: anniversaryError } = await supabase
      .from('staff')
      .select('id, first_name, last_name, date_of_joining, profile_picture, category_id')
      .eq('institution_id', userProfile.institution_id)
      .not('date_of_joining', 'is', null);

    if (anniversaryError) {
      logger.error('dashboard/celebrations', 'Failed to fetch staff work anniversaries', anniversaryError);
    } else if (staffAnniversaries) {
      staffAnniversaries.forEach((staff) => {
        const joinDate = new Date(staff.date_of_joining!);
        if (joinDate.getMonth() + 1 === todayMonth && joinDate.getDate() === todayDay) {
          const years = today.getFullYear() - joinDate.getFullYear();
          if (years > 0) {
            const fullName = [staff.first_name, staff.last_name].filter(Boolean).join(' ');
            workAnniversaries.push({
              id: staff.id,
              name: fullName || 'Unknown',
              type: 'work_anniversary',
              date: staff.date_of_joining!,
              years,
              role: 'Staff',
              avatar_url: staff.profile_picture || undefined,
              days_until: 0
            });
          }
        }
      });
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
      .select('role, institution_id')
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
      const { data: student, error: studentError } = await supabase
        .from('learners_profiles')
        .select('id, first_name, last_name, date_of_birth')
        .eq('user_id', userId)
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
      const { data: staff, error: staffError } = await supabase
        .from('staff')
        .select('id, first_name, last_name, date_of_birth, date_of_joining, category_id')
        .eq('user_id', userId)
        .single();

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
