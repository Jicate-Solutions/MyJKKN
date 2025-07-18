import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  Student,
  StudentFilters,
  StudentListResponse,
  CreateStudentDto,
  UpdateStudentDto
} from '@/types/student';
import { CreateUserRequest } from '@/types/users';
import toast from 'react-hot-toast';

// Helper function to generate a random password
function generateTemporaryPassword(length = 12): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
  let password = '';
  for (let i = 0, n = charset.length; i < length; ++i) {
    password += charset.charAt(Math.floor(Math.random() * n));
  }
  // Ensure password meets basic complexity (example: at least one number and one uppercase)
  if (!/\d/.test(password)) {
    password += Math.floor(Math.random() * 10);
  }
  if (!/[A-Z]/.test(password)) {
    password += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return password.slice(0, length);
}

export class StudentService {
  private static supabase = createClientSupabaseClient();

  // Server-side method to get student details
  static async getStudentServer(id: string): Promise<Student | null> {
    try {
      const supabase = await createClientSupabaseClient();

      // First check if student exists
      const { count, error: countError } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('id', id);

      if (countError) {
        console.error('Error checking student existence:', countError);
        throw countError;
      }

      // If no student found, return null immediately to trigger notFound()
      if (count === 0) {
        console.warn(`Student with ID ${id} not found in database`);
        return null;
      }

      // Proceed with full data fetch if student exists
      const { data: student, error } = await supabase
        .from('students')
        .select(
          `
          *,
          institution:institutions(id, name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters!semester_id(id, semester_name, semester_code),
          section:sections!section_id(id, section_name),
          academic_year:academic_years!academic_year_id(id, academic_year_name, start_date, end_date, is_active)
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        console.error('Error in Supabase query for student details:', error);
        throw error;
      }

      return student;
    } catch (error) {
      console.error('Error fetching student:', error);
      throw error; // Propagate error to page component
    }
  }

  // Task 4: Helper method to manage user account state based on student status
  private static async manageUserAccountState(
    studentEmail: string,
    newStatus: string,
    oldStatus?: string
  ): Promise<void> {
    try {
      // Only proceed if status is changing to/from 'exited'
      const isBecomingExited = newStatus === 'exited' && oldStatus !== 'exited';
      const isLeavingExited = newStatus !== 'exited' && oldStatus === 'exited';

      if (!isBecomingExited && !isLeavingExited) {
        return; // No change needed
      }

      const action = isBecomingExited ? 'disable' : 'enable';

      console.log(
        `${
          action === 'disable' ? 'Disabling' : 'Enabling'
        } user account for student: ${studentEmail}`
      );
      console.log('Status change:', { oldStatus, newStatus });

      // Use the API endpoint to manage user auth state
      const response = await fetch('/api/users/manage-auth', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action,
          email: studentEmail
        })
      });

      console.log('API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error response:', errorData);
        throw new Error(errorData.error || `Failed to ${action} user account`);
      }

      const result = await response.json();
      console.log(
        `Successfully ${action}d user account for: ${studentEmail}`,
        result
      );
    } catch (error) {
      console.error('Error managing user account state:', error);
      // Don't throw - we want student update to succeed even if user management fails
      // The error is logged for debugging purposes

      // However, let's add a more informative warning
      if (error instanceof Error) {
        console.warn(
          `User account management failed for ${studentEmail}: ${error.message}`
        );
      }
    }
  }

  static async createStudent(
    studentData: CreateStudentDto
  ): Promise<Student | null> {
    try {
      const now = new Date().toISOString();

      // Calculate if profile is complete
      const is_profile_complete = this.calculateProfileCompleteness(
        studentData as Partial<Student>
      );

      const { data: student, error } = await this.supabase
        .from('students')
        .insert({
          ...studentData,
          application_id: studentData.application_id, // Ensure application_id is passed
          is_profile_complete,
          created_at: now,
          updated_at: now,
          created_by: (await this.supabase.auth.getUser()).data.user?.id
        })
        .select(
          `
          *,
          institution:institutions(id, name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters!semester_id(id, semester_name, semester_code),
          section:sections!section_id(id, section_name),
          academic_year:academic_years!academic_year_id(id, academic_year_name, start_date, end_date, is_active)
        `
        )
        .single();

      if (error) throw error;

      // If the student was created with a complete profile, create the user account.
      if (student.is_profile_complete && student.college_email) {
        console.log(
          `Newly created student ${student.id} has a complete profile. Calling complete-onboarding API.`
        );
        try {
          const response = await fetch('/api/students/complete-onboarding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: student.id })
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error(
              'Failed to complete onboarding for new student:',
              errorData
            );
            toast.error(
              `Student record created, but user creation failed: ${
                errorData.error || 'Unknown API error'
              }`
            );
          } else {
            console.log(
              'Successfully triggered complete-onboarding for new student.'
            );
            // The API toast is now the source of truth, so we don't need another one here.
          }
        } catch (apiError) {
          console.error(
            'Error calling complete-onboarding API for new student:',
            apiError
          );
          toast.error(
            'Student record created, but the user creation process failed.'
          );
        }
      }

      // Note: Success/error messages are handled by calling components
      return student;
    } catch (error) {
      console.error('Error creating student:', error);
      throw error;
    }
  }

  static async updateStudent(
    id: string,
    updateData: UpdateStudentDto,
    options?: { suppressToast?: boolean }
  ): Promise<Student | null> {
    try {
      // Get current student data to correctly calculate profile completeness
      const { data: currentStudent, error: fetchError } = await this.supabase
        .from('students')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Merge current data with updates for profile completeness check
      const mergedData = { ...currentStudent, ...updateData };

      // Calculate if profile is complete
      const is_profile_complete = this.calculateProfileCompleteness(mergedData);

      console.log('Profile completeness check:', {
        studentId: id,
        is_profile_complete,
        requiredFields: {
          roll_number: !!mergedData.roll_number,
          college_email: !!mergedData.college_email,
          student_photo_url: !!mergedData.student_photo_url,
          academic_year_id: !!mergedData.academic_year_id,
          semester_id: !!mergedData.semester_id,
          section_id: !!mergedData.section_id
        }
      });

      // Task 4: Handle user account state changes when status changes
      if (
        updateData.status &&
        currentStudent.college_email &&
        updateData.status !== currentStudent.status
      ) {
        await this.manageUserAccountState(
          currentStudent.college_email,
          updateData.status,
          currentStudent.status
        );
      }

      // Use the calculated value even if updateData already includes is_profile_complete
      // This ensures proper calculation regardless of client-side settings
      const { data: student, error } = await this.supabase
        .from('students')
        .update({
          ...updateData,
          is_profile_complete,
          updated_at: new Date().toISOString(),
          updated_by: (await this.supabase.auth.getUser()).data.user?.id
        })
        .eq('id', id)
        .select(
          `
          *,
          institution:institutions(id, name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters!semester_id(id, semester_name, semester_code),
          section:sections!section_id(id, section_name),
          academic_year:academic_years!academic_year_id(id, academic_year_name, start_date, end_date, is_active)
        `
        )
        .single();

      if (error) throw error;

      // --- NEW, CORRECTED FLOW ---
      // This is triggered only when the profile transitions from incomplete to complete.
      if (
        is_profile_complete &&
        !currentStudent.is_profile_complete && // Was false before
        student.college_email // And email exists
      ) {
        console.log(
          `Profile for student ${student.id} is now complete. Calling complete-onboarding API.`
        );
        try {
          // Call the new, dedicated endpoint, passing the student_id
          const response = await fetch('/api/students/complete-onboarding', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ student_id: student.id })
          });

          if (!response.ok) {
            const errorData = await response.json();
            console.error('Failed to complete onboarding via API:', errorData);
            toast.error(
              `Student record updated, but user creation failed: ${
                errorData.error || 'Unknown API error'
              }`
            );
          } else {
            console.log('Successfully triggered complete-onboarding process.');
            toast.success('User account created successfully!');
          }
        } catch (apiError) {
          console.error(
            'An error occurred during the complete-onboarding API call:',
            apiError
          );
          toast.error(
            'Student record updated, but the user creation process failed.'
          );
        }
      }

      // Only show toast if not suppressed
      if (!options?.suppressToast) {
        toast.success('Student record updated successfully');
      }
      return student;
    } catch (error) {
      console.error('Error updating student:', error);
      // Only show error toast if not suppressed
      if (!options?.suppressToast) {
        toast.error('Failed to update student');
      }
      throw error;
    }
  }

  static async deleteStudent(id: string): Promise<void> {
    try {
      // First, get the student to find out if they have a college_email and photo
      const { data: student, error: fetchError } = await this.supabase
        .from('students')
        .select('college_email, student_photo_url')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Delete student photo from storage if it exists
      if (student?.student_photo_url) {
        try {
          const { StorageService } = await import(
            '@/lib/storage/storage-service'
          );
          await StorageService.deleteStudentPhoto(id);
          console.log(`Successfully deleted student photo for student ${id}`);
        } catch (photoError) {
          console.warn('Error deleting student photo:', photoError);
          // Continue with student deletion even if photo deletion fails
        }
      }

      // If there is a college_email, try to delete the associated profile
      if (student?.college_email) {
        try {
          // Find the profile associated with the college_email
          const { data: profile, error: profileError } = await this.supabase
            .from('profiles')
            .select('id')
            .eq('email', student.college_email)
            .single();

          if (!profileError && profile) {
            // Delete the profile using the API endpoint (which handles auth table deletion too)
            const response = await fetch(`/api/users/${profile.id}`, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json'
              }
            });

            if (!response.ok) {
              console.warn(
                `Failed to delete user profile for student ${id}:`,
                await response.text()
              );
            } else {
              console.log(
                `Successfully deleted user for student with email ${student.college_email}`
              );
            }
          }
        } catch (profileError) {
          console.warn(
            'Error finding or deleting student user profile:',
            profileError
          );
          // Continue with student deletion even if profile deletion fails
        }
      }

      // Delete the student record
      const { error } = await this.supabase
        .from('students')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Note: Toast messages are handled by the calling component
      console.log(`Successfully deleted student record: ${id}`);
    } catch (error) {
      console.error('Error deleting student record:', error);
      throw error; // Re-throw to let calling component handle the error toast
    }
  }

  static async getStudents(
    filters: StudentFilters = {}
  ): Promise<StudentListResponse> {
    try {
      let query = this.supabase.from('students').select(
        `
          *,
          institution:institutions!institution_id(id, name),
          degree:degrees!degree_id(id, degree_name),
          department:departments!department_id(id, department_name),
          program:programs!program_id(id, program_name),
          semester:semesters!semester_id(id, semester_name, semester_code),
          section:sections!section_id(id, section_name),
          academic_year:academic_years!academic_year_id(id, academic_year_name, start_date, end_date, is_active)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,roll_number.ilike.%${filters.search}%,student_email.ilike.%${filters.search}%`
        );
      }
      if (filters.first_name) {
        query = query.ilike('first_name', `%${filters.first_name}%`);
      }
      if (filters.last_name) {
        query = query.ilike('last_name', `%${filters.last_name}%`);
      }

      if (filters.institution) {
        query = query.eq('institution_id', filters.institution);
      }

      if (filters.program) {
        query = query.eq('program_id', filters.program);
      }

      if (filters.department) {
        query = query.eq('department_id', filters.department);
      }

      if (filters.semester) {
        query = query.eq('semester_id', filters.semester);
      }

      if (filters.section) {
        query = query.eq('section_id', filters.section);
      }

      if (filters.degree) {
        query = query.eq('degree_id', filters.degree);
      }

      if (filters.academic_year) {
        query = query.eq('academic_year_id', filters.academic_year);
      }

      if (filters.gender) {
        query = query.eq('gender', filters.gender);
      }

      if (filters.entry_type) {
        query = query.eq('entry_type', filters.entry_type);
      }

      if (filters.accommodation_type) {
        query = query.eq('accommodation_type', filters.accommodation_type);
      }

      if (filters.status) {
        query = query.eq('status', filters.status);
      }

      if (filters.created_from) {
        query = query.gte('created_at', filters.created_from.toISOString());
      }

      if (filters.created_to) {
        // Add one day to include the entire to-date
        const nextDay = new Date(filters.created_to);
        nextDay.setDate(nextDay.getDate() + 1);
        query = query.lt('created_at', nextDay.toISOString());
      }

      if (filters.is_profile_complete !== undefined) {
        query = query.eq('is_profile_complete', filters.is_profile_complete);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data: students, error, count } = await query;

      if (error) throw error;

      return {
        data: students || [],
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0
        }
      };
    } catch (error) {
      console.error('Error fetching students:', error);
      throw error;
    }
  }

  // Get a single student by ID with all related data
  static async getStudent(id: string): Promise<Student> {
    try {
      const { data, error } = await this.supabase
        .from('students')
        .select(
          `
          *,
          institution:institutions (*),
          degree:degrees (*),
          department:departments (*),
          program:programs (*),
          semester:semesters (*),
          section:sections (*),
          academic_year:academic_years (*)
        `
        )
        .eq('id', id)
        .single();

      if (error) {
        throw new Error(`Error fetching student: ${error.message}`);
      }

      if (!data) {
        throw new Error('Student not found');
      }

      return data as Student;
    } catch (error) {
      console.error('Error in getStudent:', error);
      throw error;
    }
  }

  static async getStudentByAdmissionId(
    admissionId: string
  ): Promise<Student | null> {
    try {
      const { data: student, error } = await this.supabase
        .from('students')
        .select('*')
        .eq('admission_id', admissionId)
        .maybeSingle();

      if (error) throw error;

      return student;
    } catch (error) {
      console.error('Error fetching student by admission ID:', error);
      return null;
    }
  }

  static async createStudentFromAdmission(
    admissionId: string
  ): Promise<Student | null> {
    try {
      // First check if a student record already exists for this admission
      const existingStudent = await this.getStudentByAdmissionId(admissionId);
      if (existingStudent) {
        console.log('Student record already exists for this admission');
        return existingStudent;
      }

      // Fetch the admission record
      const { data: admission, error: admissionError } = await this.supabase
        .from('admissions')
        .select('*')
        .eq('id', admissionId)
        .single();

      if (admissionError) throw admissionError;
      if (!admission) throw new Error('Admission record not found');

      // Create new student record from admission data
      // We need to exclude the status field from admission as it uses a different enum type
      // than the student status enum
      const { status: admissionStatus, ...admissionData } = admission;

      // Handle date formatting for date_of_birth field
      // Use a default date string if not provided to satisfy the type constraint
      let formattedDateOfBirth: string = '';
      if (admission.date_of_birth) {
        try {
          // Format the date as YYYY-MM-DD for PostgreSQL DATE type
          const dateObj = new Date(admission.date_of_birth);
          formattedDateOfBirth = dateObj.toISOString().split('T')[0];
        } catch (dateError) {
          console.error('Error formatting date of birth:', dateError);
          // Keep it empty string if there's an error parsing the date
        }
      }

      // Ensure boolean fields are properly typed
      const counselingApplied = admission.counseling_applied === true;
      const firstGraduate = admission.first_graduate === true;
      const busRequired = admission.bus_required === true;

      // Ensure JSONB fields are properly formatted
      const tenthMarks =
        typeof admission.tenth_marks === 'string'
          ? JSON.parse(admission.tenth_marks)
          : admission.tenth_marks;

      const twelfthMarks =
        typeof admission.twelfth_marks === 'string'
          ? JSON.parse(admission.twelfth_marks)
          : admission.twelfth_marks;

      const studentData: CreateStudentDto = {
        admission_id: admission.id, // The UUID foreign key
        application_id: admission.application_id, // The human-readable ID
        first_name: admission.first_name,
        last_name: admission.last_name,
        father_name: admission.father_name,
        father_occupation: admission.father_occupation || '',
        father_mobile: admission.father_mobile || '',
        mother_name: admission.mother_name,
        mother_occupation: admission.mother_occupation || '',
        mother_mobile: admission.mother_mobile || '',
        date_of_birth: formattedDateOfBirth, // Use the formatted date
        gender: admission.gender || '',
        religion: admission.religion || '',
        community: admission.community || '',
        caste: admission.caste || '',
        annual_income: admission.annual_income || '',
        last_school: admission.last_school || '',
        board_of_study: admission.board_of_study || '',
        tenth_marks: tenthMarks || {
          max_marks: '',
          obtained_marks: '',
          percentage: ''
        },
        twelfth_marks: twelfthMarks || {
          group: '',
          max_marks: '',
          obtained_marks: '',
          percentage: '',
          subjects: {}
        },
        medical_cutoff_marks: admission.medical_cutoff_marks || '',
        engineering_cutoff_marks: admission.engineering_cutoff_marks || '',
        neet_roll_number: admission.neet_roll_number || '',
        counseling_applied: counselingApplied,
        counseling_number: admission.counseling_number || '',
        first_graduate: firstGraduate,
        quota: admission.quota || '',
        category: admission.category || '',
        institution_id: admission.institution_id || null,
        degree_id: admission.degree_id || null,
        department_id: admission.department_id || null,
        program_id: admission.program_id || null,
        entry_type: admission.entry_type || '',
        permanent_address_street: admission.permanent_address_street || '',
        permanent_address_taluk: admission.permanent_address_taluk || '',
        permanent_address_district: admission.permanent_address_district || '',
        permanent_address_pin_code: admission.permanent_address_pin_code || '',
        permanent_address_state: admission.permanent_address_state || '',
        student_mobile: admission.student_mobile || '',
        student_email: admission.student_email || '',
        accommodation_type: admission.accommodation_type || '',
        hostel_type: admission.hostel_type || '',
        bus_required: busRequired,
        bus_route: admission.bus_route || '',
        bus_pickup_location: admission.bus_pickup_location || '',
        reference_type: admission.reference_type || '',
        reference_name: admission.reference_name || '',
        reference_contact: admission.reference_contact || '',
        is_profile_complete: false,
        status: 'active', // Use a valid student_status enum value
        semester_id: admission.semester_id || null,
        section_id: admission.section_id || null
      };

      // Create the student record
      const newStudent = await this.createStudent(studentData);
      toast.success('Student record created from approved admission');
      return newStudent;
    } catch (error) {
      console.error('Error creating student from admission:', error);
      toast.error('Failed to create student record from admission');
      return null;
    }
  }

  static async getStudentStats(): Promise<{
    total: number;
    complete: number;
    incomplete: number;
  }> {
    try {
      // Get total count
      const { count: total, error: totalError } = await this.supabase
        .from('students')
        .select('*', { count: 'exact', head: true });

      if (totalError) throw totalError;

      // Get count of complete profiles
      const { count: complete, error: completeError } = await this.supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('is_profile_complete', true);

      if (completeError) throw completeError;

      // Get count of incomplete profiles
      const { count: incomplete, error: incompleteError } = await this.supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('is_profile_complete', false);

      if (incompleteError) throw incompleteError;

      return {
        total: total || 0,
        complete: complete || 0,
        incomplete: incomplete || 0
      };
    } catch (error) {
      console.error('Error fetching student stats:', error);
      throw error;
    }
  }

  private static calculateProfileCompleteness(
    student: Partial<Student>
  ): boolean {
    // List of required fields for a complete profile
    // Note: student_photo_url is optional and not required for profile completion
    const requiredFields = [
      'roll_number',
      'college_email',
      'academic_year_id',
      'semester_id',
      'section_id'
    ];

    // Check if all required fields are present and not empty
    return requiredFields.every(
      (field) =>
        student[field as keyof Student] !== null &&
        student[field as keyof Student] !== undefined &&
        student[field as keyof Student] !== ''
    );
  }

  static async bulkDeleteStudents(ids: string[]): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    // Process deletions sequentially
    for (const id of ids) {
      try {
        await this.deleteStudent(id);
        success.push(id);
      } catch (error) {
        console.error(`Error deleting student ${id}:`, error);
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return { success, failed };
  }
}
