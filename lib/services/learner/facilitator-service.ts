import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface FacilitatorDetails {
  id: string;
  staff_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  institution_email: string;
  profile_picture: string | null;
  designation: string;
  department_name?: string;
  course_name?: string;
  staff_type: string;
}

// Type definitions for the database responses
interface DepartmentRecord {
  department_name: string;
}

interface StaffRecord {
  id: string;
  staff_id: string;
  first_name: string;
  last_name: string;
  email: string;
  institution_email: string;
  profile_picture: string | null;
  designation: string;
  departments: DepartmentRecord | null;
}

interface CourseRecord {
  course_name: string;
}

interface StaffPlanCourseRecord {
  staff_id: string;
  staff_type: string;
  course_id: string;
  courses: CourseRecord | null;
  staff: StaffRecord | null;
}

export class FacilitatorService {
  /**
   * Get facilitators for the current student's semester
   */
  static async getCurrentSemesterFacilitators(
    profileId: string
  ): Promise<{ data: FacilitatorDetails[]; error: string | null }> {
    try {
      const supabase = createClientSupabaseClient();

      // First, get the profile email to match with student record
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email, role')
        .eq('id', profileId)
        .single();

      if (profileError || !profile) {
        return { data: [], error: 'Profile not found' };
      }

      if (profile.role !== 'student') {
        return { data: [], error: 'This feature is only available for students' };
      }

      // Find the student record using email matching
      const { data: studentRecord, error: studentRecordError } = await supabase
        .from('students')
        .select(`
          id,
          semester_id,
          program_id,
          department_id,
          institution_id,
          student_email,
          college_email
        `)
        .or(`student_email.eq.${profile.email},college_email.eq.${profile.email}`)
        .eq('status', 'active')
        .single();

      if (studentRecordError || !studentRecord) {
        return { data: [], error: 'No active student record found for this email' };
      }

      const studentData = studentRecord;

      // Get all active staff from the student's department
      const { data: facilitators, error: facilitatorError } = await supabase
        .from('staff')
        .select(`
          id,
          staff_id,
          first_name,
          last_name,
          email,
          institution_email,
          profile_picture,
          designation,
          departments:department_id (
            department_name
          )
        `)
        .eq('institution_id', studentData.institution_id)
        .eq('department_id', studentData.department_id)
        .eq('is_active', true);

      if (facilitatorError) {
        return { data: [], error: 'Failed to fetch facilitators' };
      }

      if (!facilitators || facilitators.length === 0) {
        return { data: [], error: 'No facilitators found in your department' };
      }

      // Transform the data with proper type handling
      const transformedData: FacilitatorDetails[] = facilitators
        .filter((item: any) => item && item.id)
        .map((item: any) => ({
          id: item.id,
          staff_id: item.staff_id,
          first_name: item.first_name,
          last_name: item.last_name,
          full_name: `${item.first_name} ${item.last_name}`,
          email: item.email,
          institution_email: item.institution_email,
          profile_picture: item.profile_picture,
          designation: item.designation,
          department_name: item.departments?.department_name,
          course_name: '', // Not needed for department staff listing
          staff_type: item.designation || 'Faculty' // Use designation as staff type
        }))
        // Remove duplicates based on staff_id
        .filter((facilitator, index, self) =>
          index === self.findIndex(f => f.staff_id === facilitator.staff_id)
        );

      return { data: transformedData, error: null };
    } catch (error) {
      console.error('Error fetching facilitators:', error);
      return { data: [], error: 'An unexpected error occurred' };
    }
  }

  /**
   * Get facilitator profile picture URL
   */
  static getProfilePictureUrl(profilePicture: string | null): string {
    if (!profilePicture) {
      return '/images/default-avatar.png'; // fallback image
    }

    // If it's already a full URL, return it
    if (profilePicture.startsWith('http')) {
      return profilePicture;
    }

    // If it's a Supabase storage path
    const supabase = createClientSupabaseClient();
    const { data } = supabase.storage
      .from('staff-profiles')
      .getPublicUrl(profilePicture);

    return data.publicUrl;
  }
}