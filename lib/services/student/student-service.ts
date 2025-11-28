import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  Student,
  StudentFilters,
  StudentListResponse,
  CreateStudentDto,
  UpdateStudentDto,
  BulkUpdateStudentDto,
  BulkUpdateResult,
  BulkEditStudentDto,
  BulkEditPreview,
  BulkEditResult,
  StudentChanges,
  FieldChange
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

  // Lightweight method for initial student list loading
  static async getStudentsLightweight(
    filters: StudentFilters = {}
  ): Promise<StudentListResponse> {
    try {
      // First, get the student data without joins
      let query = this.supabase.from('students').select(
        `
          id,
          first_name,
          last_name,
          roll_number,
          status,
          is_profile_complete,
          created_at,
          program_id,
          semester_id,
          section_id,
          academic_year_id
        `,
        { count: 'exact' }
      );

      // Apply only essential filters
      if (filters.search) {
        query = query.or(
          `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,roll_number.ilike.%${filters.search}%`
        );
      }

      // Apply ID-based filters which are indexed
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
      if (filters.status) {
        query = query.eq('status', filters.status);
      }
      if (filters.is_profile_complete !== undefined) {
        query = query.eq('is_profile_complete', filters.is_profile_complete);
      }

      // Apply pagination
      const page = filters.page || 1;
      const limit = filters.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.order('created_at', { ascending: false }).range(from, to);

      const { data: students, error, count } = await query;

      if (error) throw error;

      // For lightweight query, we'll return minimal data
      // The UI will need to handle missing relation data gracefully
      const transformedStudents = (students || []).map((student: any) => ({
        ...student,
        // Add placeholder objects for relations
        program: student.program_id
          ? { id: student.program_id, program_name: 'Loading...' }
          : null,
        semester: student.semester_id
          ? { id: student.semester_id, semester_name: 'Loading...' }
          : null,
        section: student.section_id
          ? { id: student.section_id, section_name: 'Loading...' }
          : null,
        academic_year: student.academic_year_id
          ? { id: student.academic_year_id, academic_year_name: 'Loading...' }
          : null
      }));

      return {
        data: transformedStudents,
        metadata: {
          total: count || 0,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching students (lightweight):', error);
      throw error;
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

      // Uppercase first_name and last_name
      const processedStudentData = {
        ...studentData,
        first_name: studentData.first_name?.toUpperCase(),
        last_name: studentData.last_name?.toUpperCase()
      };

      const { data: student, error } = await this.supabase
        .from('students')
        .insert({
          ...processedStudentData,
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

      // Uppercase first_name and last_name if they exist in the update data
      const processedUpdateData = { ...updateData };
      if (processedUpdateData.first_name) {
        processedUpdateData.first_name =
          processedUpdateData.first_name.toUpperCase();
      }
      if (processedUpdateData.last_name) {
        processedUpdateData.last_name =
          processedUpdateData.last_name.toUpperCase();
      }

      // Handle email change and profile synchronization
      if (
        processedUpdateData.college_email &&
        processedUpdateData.college_email !== currentStudent.college_email
      ) {
        const newEmail = processedUpdateData.college_email;
        const oldEmail = currentStudent.college_email;

        console.log(`Email change detected: ${oldEmail} -> ${newEmail}`);

        // Check if a profile exists with the new email
        const { data: existingProfileWithNewEmail } = await this.supabase
          .from('profiles')
          .select('id, email, role')
          .eq('email', newEmail)
          .maybeSingle();

        if (existingProfileWithNewEmail) {
          // Check if there's a student record already using this email
          const { data: otherStudent } = await this.supabase
            .from('students')
            .select('id, first_name, last_name')
            .eq('college_email', newEmail)
            .neq('id', id)
            .maybeSingle();

          if (otherStudent) {
            throw new Error(
              `Email ${newEmail} is already assigned to another student: ${otherStudent.first_name} ${otherStudent.last_name}`
            );
          }

          // If profile exists but no other student uses it, we can proceed
          console.log(
            `Profile exists for ${newEmail}, will link to this student`
          );

          // Update the existing profile's institution_id to match student's
          if (currentStudent.institution_id) {
            const { error: profileUpdateError } = await this.supabase
              .from('profiles')
              .update({
                institution_id: currentStudent.institution_id,
                full_name: `${
                  processedUpdateData.first_name || currentStudent.first_name
                } ${
                  processedUpdateData.last_name ||
                  currentStudent.last_name ||
                  ''
                }`.trim(),
                updated_at: new Date().toISOString()
              })
              .eq('email', newEmail);

            if (profileUpdateError) {
              console.error(
                'Failed to update profile institution:',
                profileUpdateError
              );
            }
          }
        }

        // Check if old email has a profile that needs to be updated
        if (oldEmail) {
          const { data: oldProfile } = await this.supabase
            .from('profiles')
            .select('id')
            .eq('email', oldEmail)
            .maybeSingle();

          if (oldProfile && !existingProfileWithNewEmail) {
            // Update the old profile's email to the new one
            console.log(
              `Updating profile email from ${oldEmail} to ${newEmail}`
            );

            const { error: emailUpdateError } = await this.supabase
              .from('profiles')
              .update({
                email: newEmail,
                full_name: `${
                  processedUpdateData.first_name || currentStudent.first_name
                } ${
                  processedUpdateData.last_name ||
                  currentStudent.last_name ||
                  ''
                }`.trim(),
                updated_at: new Date().toISOString()
              })
              .eq('id', oldProfile.id);

            if (emailUpdateError) {
              console.error(
                'Failed to update profile email:',
                emailUpdateError
              );
              toast.error('Student updated but profile email sync failed');
            }
          }
        }
      }

      // Merge current data with updates for profile completeness check
      const mergedData = { ...currentStudent, ...processedUpdateData };

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
          ...processedUpdateData,
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
        .maybeSingle();

      if (fetchError) throw fetchError;

      // If student doesn't exist, return early (already deleted)
      if (!student) {
        console.log(`Student ${id} not found - may already be deleted`);
        return;
      }

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
            .maybeSingle();

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
      // Use a simpler query structure to avoid 500 errors
      let query = this.supabase.from('students').select(
        `
          id,
          admission_id,
          application_id,
          first_name,
          last_name,
          roll_number,
          student_email,
          student_mobile,
          status,
          is_profile_complete,
          created_at,
          institution_id,
          degree_id,
          department_id,
          program_id,
          semester_id,
          section_id,
          academic_year_id,
          institutions!students_institution_id_fkey (
            id,
            name
          ),
          degrees!degree_id (
            id,
            degree_name
          ),
          departments!department_id (
            id,
            department_name
          ),
          programs!program_id (
            id,
            program_name
          ),
          semesters!semester_id (
            id,
            semester_name,
            semester_code
          ),
          sections!section_id (
            id,
            section_name
          ),
          academic_years!academic_year_id (
            id,
            academic_year_name,
            start_date,
            end_date,
            is_active
          )
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

      // Apply sorting
      if (filters.sortBy) {
        query = query.order(filters.sortBy, {
          ascending: filters.sortOrder === 'asc'
        });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      // Apply pagination after sorting
      query = query.range(from, to);

      const { data: students, error, count } = await query;

      if (error) throw error;

      // Transform the data to match the expected format
      const transformedStudents = (students || []).map((student: any) => ({
        ...student,
        institution: student.institutions || null,
        degree: student.degrees || null,
        department: student.departments || null,
        program: student.programs || null,
        semester: student.semesters || null,
        section: student.sections || null,
        academic_year: student.academic_years || null,
        // Remove the plural properties
        institutions: undefined,
        degrees: undefined,
        departments: undefined,
        programs: undefined,
        semesters: undefined,
        sections: undefined,
        academic_years: undefined
      }));

      return {
        data: transformedStudents,
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
        father_occupation: admission.father_occupation || 'Not Specified',
        father_mobile: admission.father_mobile || '',
        mother_name: admission.mother_name,
        mother_occupation: admission.mother_occupation || 'Not Specified',
        mother_mobile: admission.mother_mobile,
        date_of_birth: formattedDateOfBirth, // Use the formatted date
        gender: admission.gender,
        religion: admission.religion,
        community: admission.community,
        caste: admission.caste || '',
        annual_income: admission.annual_income || '',
        last_school: admission.last_school,
        board_of_study: admission.board_of_study,
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
        neet_score: admission.neet_score || '',
        aadhar_number: admission.aadhar_number || '',
        counseling_applied: counselingApplied,
        counseling_number: admission.counseling_number || '',
        first_graduate: firstGraduate,
        quota: admission.quota || '',
        category: admission.category || '',
        institution_id: admission.institution_id || null,
        degree_id: admission.degree_id || null,
        department_id: admission.department_id || null,
        program_id: admission.program_id || null,
        entry_type: admission.entry_type,
        permanent_address_street: admission.permanent_address_street || '',
        permanent_address_taluk: admission.permanent_address_taluk || '',
        permanent_address_district: admission.permanent_address_district || '',
        permanent_address_pin_code: admission.permanent_address_pin_code || '',
        permanent_address_state: admission.permanent_address_state || '',
        student_mobile: admission.student_mobile || '',
        student_email: admission.student_email || '',
        accommodation_type: admission.accommodation_type || '',
        hostel_type: admission.hostel_type || '',
        food_type: admission.food_type || '',
        bus_required: busRequired,
        bus_route: admission.bus_route || '',
        bus_pickup_location: admission.bus_pickup_location || '',
        reference_type: admission.reference_type || '',
        reference_name: admission.reference_name || '',
        reference_contact: admission.reference_contact || '',
        is_profile_complete: false,
        status: 'active', // Use a valid student_status enum value
        semester_id: undefined, // Will be set later during onboarding
        section_id: undefined, // Will be set later during onboarding
        academic_year_id: admission.academic_year_id || undefined // Copy from admission if available
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

  // Helper method to fetch all students with pagination to overcome Supabase 1000-row limit
  private static async fetchAllStudents(
    selectFields: string,
    filters?: any,
    additionalConditions?: (query: any) => any
  ): Promise<any[]> {
    let allStudents: any[] = [];
    let hasMore = true;
    const pageSize = 1000;
    let currentPage = 0;

    while (hasMore) {
      let query = this.supabase
        .from('students')
        .select(selectFields)
        .range(currentPage * pageSize, (currentPage + 1) * pageSize - 1);

      // Apply additional conditions (like date ranges, specific filters)
      if (additionalConditions) {
        query = additionalConditions(query);
      }

      // Apply standard filters
      if (filters?.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }
      if (filters?.departmentId) {
        query = query.eq('department_id', filters.departmentId);
      }
      if (filters?.programId) {
        query = query.eq('program_id', filters.programId);
      }
      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters?.dateRange?.from && filters?.dateRange?.to) {
        query = query
          .gte('created_at', filters.dateRange.from.toISOString())
          .lte('created_at', filters.dateRange.to.toISOString());
      }

      const { data: pageStudents, error } = await query;
      if (error) throw error;

      if (pageStudents && pageStudents.length > 0) {
        allStudents = allStudents.concat(pageStudents);
        currentPage++;

        if (pageStudents.length < pageSize) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    return allStudents;
  }

  // Real-time dashboard statistics from database
  static async getDashboardStats(filters?: any) {
    try {
      // Execute parallel queries for better performance
      const [
        overviewStats,
        registrationTrends,
        institutionStats,
        departmentStats,
        programStats,
        semesterStats,
        sectionStats,
        demographicStats,
        geographicStats,
        onboardingStats
      ] = await Promise.all([
        this.getOverviewStats(filters),
        this.getRegistrationTrends(filters),
        this.getInstitutionStats(filters),
        this.getDepartmentStats(filters),
        this.getProgramStats(filters),
        this.getSemesterStats(filters),
        this.getSectionStats(filters),
        this.getDemographicStats(filters),
        this.getGeographicStats(filters),
        this.getOnboardingStats(filters)
      ]);

      return {
        overview: overviewStats,
        registrationTrends,
        institutionStats,
        departmentStats,
        programStats,
        semesterStats,
        sectionStats,
        demographicStats,
        geographicStats,
        onboardingStats
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  // Get overview statistics
  private static async getOverviewStats(filters?: any) {
    try {
      // First, let's check the count without filters to debug
      const { count: totalCount, error: countError } = await this.supabase
        .from('students')
        .select('*', { count: 'exact', head: true });

      if (!countError) {
        console.log(
          '[DEBUG] Total students in database (no filters):',
          totalCount
        );
      }

      // Fetch all students using the helper method
      const students = await this.fetchAllStudents(
        'status, is_profile_complete',
        filters
      );

      const totalStudents = students?.length || 0;
      console.log(
        '[DEBUG] getOverviewStats - Total students fetched:',
        totalStudents
      );

      const activeStudents =
        students?.filter((s) => s.status === 'active').length || 0;
      const inactiveStudents =
        students?.filter((s) => s.status === 'inactive').length || 0;
      const pendingStudents =
        students?.filter((s) => s.status === 'pending').length || 0;
      const exitedStudents =
        students?.filter((s) => s.status === 'exited').length || 0;
      const graduatedStudents =
        students?.filter((s) => s.status === 'graduated').length || 0;
      const completeProfiles =
        students?.filter((s) => s.is_profile_complete === true).length || 0;
      const incompleteProfiles = totalStudents - completeProfiles;

      return {
        totalStudents,
        activeStudents,
        inactiveStudents,
        pendingStudents,
        exitedStudents,
        graduatedStudents,
        profileCompletionRate:
          totalStudents > 0
            ? Math.round((completeProfiles / totalStudents) * 100)
            : 0,
        completeProfiles,
        incompleteProfiles
      };
    } catch (error) {
      console.error('Error fetching overview stats:', error);
      throw error;
    }
  }

  // Get registration trends (last 30 days)
  private static async getRegistrationTrends(filters?: any) {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Fetch all students using the helper method with date filter
      const students = await this.fetchAllStudents(
        'created_at',
        filters,
        (query) => query.gte('created_at', thirtyDaysAgo.toISOString())
      );

      // Group by date
      const dateGroups: { [key: string]: number } = {};
      students?.forEach((student) => {
        const date = new Date(student.created_at).toISOString().split('T')[0];
        dateGroups[date] = (dateGroups[date] || 0) + 1;
      });

      // Generate trends for last 30 days
      const trends = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        const dateStr = date.toISOString().split('T')[0];
        return {
          date: dateStr,
          count: dateGroups[dateStr] || 0,
          cumulative: 0
        };
      });

      // Calculate cumulative values
      trends.forEach((item, i) => {
        item.cumulative = trends
          .slice(0, i + 1)
          .reduce((sum, curr) => sum + curr.count, 0);
      });

      return trends;
    } catch (error) {
      console.error('Error fetching registration trends:', error);
      return [];
    }
  }

  // Get institution statistics
  private static async getInstitutionStats(filters?: any) {
    try {
      // Fetch all students using the helper method (excluding institution filter for this query)
      const students = await this.fetchAllStudents(
        `institution_id, status, institutions!inner(id, name)`,
        {
          ...filters,
          institutionId: undefined // Exclude institution filter for this specific query
        }
      );

      const totalStudents = students?.length || 0;

      // Group by institution
      const institutionGroups: { [key: string]: any } = {};
      students?.forEach((student) => {
        const inst = Array.isArray(student.institutions)
          ? student.institutions[0]
          : student.institutions;
        if (inst) {
          if (!institutionGroups[inst.id]) {
            institutionGroups[inst.id] = {
              id: inst.id,
              name: inst.name,
              studentCount: 0,
              activeCount: 0,
              inactiveCount: 0
            };
          }
          institutionGroups[inst.id].studentCount++;
          if (student.status === 'active') {
            institutionGroups[inst.id].activeCount++;
          } else {
            institutionGroups[inst.id].inactiveCount++;
          }
        }
      });

      return Object.values(institutionGroups).map((inst: any) => ({
        ...inst,
        percentage:
          totalStudents > 0
            ? Math.round((inst.studentCount / totalStudents) * 100)
            : 0
      }));
    } catch (error) {
      console.error('Error fetching institution stats:', error);
      return [];
    }
  }

  // Get department statistics
  private static async getDepartmentStats(filters?: any) {
    try {
      // Fetch all students using the helper method
      const students = await this.fetchAllStudents(
        `department_id, departments!inner(id, department_name), institutions!inner(name)`,
        filters
      );

      const totalStudents = students?.length || 0;

      // Group by department
      const departmentGroups: { [key: string]: any } = {};
      students?.forEach((student) => {
        const dept = Array.isArray(student.departments)
          ? student.departments[0]
          : student.departments;
        const inst = Array.isArray(student.institutions)
          ? student.institutions[0]
          : student.institutions;
        if (dept) {
          if (!departmentGroups[dept.id]) {
            departmentGroups[dept.id] = {
              id: dept.id,
              name: dept.department_name,
              studentCount: 0,
              institutionName: inst?.name || 'Unknown'
            };
          }
          departmentGroups[dept.id].studentCount++;
        }
      });

      return Object.values(departmentGroups).map((dept: any) => ({
        ...dept,
        percentage:
          totalStudents > 0
            ? Math.round((dept.studentCount / totalStudents) * 100)
            : 0
      }));
    } catch (error) {
      console.error('Error fetching department stats:', error);
      return [];
    }
  }

  // Get program statistics
  private static async getProgramStats(filters?: any) {
    try {
      // Fetch all students using the helper method
      const students = await this.fetchAllStudents(
        `program_id, programs!inner(id, program_name), departments!inner(department_name)`,
        filters
      );

      const totalStudents = students?.length || 0;

      // Group by program
      const programGroups: { [key: string]: any } = {};
      students?.forEach((student) => {
        const prog = Array.isArray(student.programs)
          ? student.programs[0]
          : student.programs;
        const dept = Array.isArray(student.departments)
          ? student.departments[0]
          : student.departments;
        if (prog) {
          if (!programGroups[prog.id]) {
            programGroups[prog.id] = {
              id: prog.id,
              name: prog.program_name,
              studentCount: 0,
              departmentName: dept?.department_name || 'Unknown'
            };
          }
          programGroups[prog.id].studentCount++;
        }
      });

      return Object.values(programGroups).map((prog: any) => ({
        ...prog,
        percentage:
          totalStudents > 0
            ? Math.round((prog.studentCount / totalStudents) * 100)
            : 0
      }));
    } catch (error) {
      console.error('Error fetching program stats:', error);
      return [];
    }
  }

  // Get semester statistics
  private static async getSemesterStats(filters?: any) {
    try {
      // Fetch all students using the helper method
      const students = await this.fetchAllStudents(
        `semester_id, semesters!inner(id, semester_name)`,
        filters
      );

      const totalStudents = students?.length || 0;

      // Group by semester
      const semesterGroups: { [key: string]: any } = {};
      students?.forEach((student) => {
        const sem = Array.isArray(student.semesters)
          ? student.semesters[0]
          : student.semesters;
        if (sem) {
          if (!semesterGroups[sem.id]) {
            semesterGroups[sem.id] = {
              id: sem.id,
              name: sem.semester_name,
              studentCount: 0
            };
          }
          semesterGroups[sem.id].studentCount++;
        }
      });

      return Object.values(semesterGroups).map((sem: any) => ({
        ...sem,
        percentage:
          totalStudents > 0
            ? Math.round((sem.studentCount / totalStudents) * 100)
            : 0
      }));
    } catch (error) {
      console.error('Error fetching semester stats:', error);
      return [];
    }
  }

  // Get section statistics
  private static async getSectionStats(filters?: any) {
    try {
      let query = this.supabase.from('students').select(
        `
          section_id,
          sections!inner(id, section_name),
          semesters!inner(semester_name)
        `
      );

      // Apply filters
      if (filters?.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }
      if (filters?.departmentId) {
        query = query.eq('department_id', filters.departmentId);
      }
      if (filters?.programId) {
        query = query.eq('program_id', filters.programId);
      }
      if (filters?.dateRange?.from && filters?.dateRange?.to) {
        query = query
          .gte('created_at', filters.dateRange.from.toISOString())
          .lte('created_at', filters.dateRange.to.toISOString());
      }

      const { data: students, error } = await query;
      if (error) throw error;

      const totalStudents = students?.length || 0;

      // Group by section
      const sectionGroups: { [key: string]: any } = {};
      students?.forEach((student) => {
        const sec = Array.isArray(student.sections)
          ? student.sections[0]
          : student.sections;
        const sem = Array.isArray(student.semesters)
          ? student.semesters[0]
          : student.semesters;
        if (sec) {
          if (!sectionGroups[sec.id]) {
            sectionGroups[sec.id] = {
              id: sec.id,
              name: sec.section_name,
              studentCount: 0,
              semesterName: sem?.semester_name || 'Unknown'
            };
          }
          sectionGroups[sec.id].studentCount++;
        }
      });

      return Object.values(sectionGroups).map((sec: any) => ({
        ...sec,
        percentage:
          totalStudents > 0
            ? Math.round((sec.studentCount / totalStudents) * 100)
            : 0
      }));
    } catch (error) {
      console.error('Error fetching section stats:', error);
      return [];
    }
  }

  // Get demographic statistics
  private static async getDemographicStats(filters?: any) {
    try {
      let query = this.supabase
        .from('students')
        .select(
          'gender, entry_type, accommodation_type, religion, community, date_of_birth'
        );

      // Apply filters
      if (filters?.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }
      if (filters?.departmentId) {
        query = query.eq('department_id', filters.departmentId);
      }
      if (filters?.programId) {
        query = query.eq('program_id', filters.programId);
      }
      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters?.dateRange?.from && filters?.dateRange?.to) {
        query = query
          .gte('created_at', filters.dateRange.from.toISOString())
          .lte('created_at', filters.dateRange.to.toISOString());
      }

      const { data: students, error } = await query;
      if (error) throw error;

      const totalStudents = students?.length || 0;

      // Helper function to calculate percentage
      const calculatePercentage = (count: number) =>
        totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0;

      // Group by gender
      const genderGroups: { [key: string]: number } = {};
      students?.forEach((student) => {
        const gender = student.gender || 'Unknown';
        genderGroups[gender] = (genderGroups[gender] || 0) + 1;
      });

      // Group by entry type
      const entryTypeGroups: { [key: string]: number } = {};
      students?.forEach((student) => {
        const entryType = student.entry_type || 'Unknown';
        entryTypeGroups[entryType] = (entryTypeGroups[entryType] || 0) + 1;
      });

      // Group by accommodation type
      const accommodationGroups: { [key: string]: number } = {};
      students?.forEach((student) => {
        const accommodation = student.accommodation_type || 'Unknown';
        accommodationGroups[accommodation] =
          (accommodationGroups[accommodation] || 0) + 1;
      });

      // Group by religion
      const religionGroups: { [key: string]: number } = {};
      students?.forEach((student) => {
        const religion = student.religion || 'Unknown';
        religionGroups[religion] = (religionGroups[religion] || 0) + 1;
      });

      // Group by community
      const communityGroups: { [key: string]: number } = {};
      students?.forEach((student) => {
        const community = student.community || 'Unknown';
        communityGroups[community] = (communityGroups[community] || 0) + 1;
      });

      // Group by age
      const ageGroups: { [key: string]: number } = {
        '17-18': 0,
        '19-20': 0,
        '21-22': 0,
        '23+': 0
      };
      students?.forEach((student) => {
        if (student.date_of_birth) {
          const age =
            new Date().getFullYear() -
            new Date(student.date_of_birth).getFullYear();
          if (age >= 17 && age <= 18) ageGroups['17-18']++;
          else if (age >= 19 && age <= 20) ageGroups['19-20']++;
          else if (age >= 21 && age <= 22) ageGroups['21-22']++;
          else if (age >= 23) ageGroups['23+']++;
        }
      });

      return {
        gender: Object.entries(genderGroups).map(([gender, count]) => ({
          gender,
          count,
          percentage: calculatePercentage(count)
        })),
        entryType: Object.entries(entryTypeGroups).map(([type, count]) => ({
          type,
          count,
          percentage: calculatePercentage(count)
        })),
        accommodationType: Object.entries(accommodationGroups).map(
          ([type, count]) => ({
            type,
            count,
            percentage: calculatePercentage(count)
          })
        ),
        religion: Object.entries(religionGroups).map(([religion, count]) => ({
          religion,
          count,
          percentage: calculatePercentage(count)
        })),
        community: Object.entries(communityGroups).map(
          ([community, count]) => ({
            community,
            count,
            percentage: calculatePercentage(count)
          })
        ),
        ageGroups: Object.entries(ageGroups).map(([ageGroup, count]) => ({
          ageGroup,
          count,
          percentage: calculatePercentage(count)
        }))
      };
    } catch (error) {
      console.error('Error fetching demographic stats:', error);
      return {
        gender: [],
        entryType: [],
        accommodationType: [],
        religion: [],
        community: [],
        ageGroups: []
      };
    }
  }

  // Get geographic statistics
  private static async getGeographicStats(filters?: any) {
    try {
      let query = this.supabase
        .from('students')
        .select('permanent_address_state, permanent_address_district');

      // Apply filters
      if (filters?.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }
      if (filters?.departmentId) {
        query = query.eq('department_id', filters.departmentId);
      }
      if (filters?.programId) {
        query = query.eq('program_id', filters.programId);
      }
      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters?.dateRange?.from && filters?.dateRange?.to) {
        query = query
          .gte('created_at', filters.dateRange.from.toISOString())
          .lte('created_at', filters.dateRange.to.toISOString());
      }

      const { data: students, error } = await query;
      if (error) throw error;

      const totalStudents = students?.length || 0;

      // Group by state and district
      const locationGroups: { [key: string]: number } = {};
      students?.forEach((student) => {
        const state = student.permanent_address_state || 'Unknown';
        const district = student.permanent_address_district || 'Unknown';
        const key = `${state}|${district}`;
        locationGroups[key] = (locationGroups[key] || 0) + 1;
      });

      return Object.entries(locationGroups)
        .map(([key, count]) => {
          const [state, district] = key.split('|');
          return {
            state,
            district,
            count,
            percentage:
              totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0
          };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 locations
    } catch (error) {
      console.error('Error fetching geographic stats:', error);
      return [];
    }
  }

  // Get onboarding statistics
  private static async getOnboardingStats(filters?: any) {
    try {
      let query = this.supabase.from('students').select(
        `
          roll_number,
          college_email,
          student_photo_url,
          academic_year_id,
          semester_id,
          section_id,
          is_profile_complete,
          created_at,
          updated_at
        `
      );

      // Apply filters
      if (filters?.institutionId) {
        query = query.eq('institution_id', filters.institutionId);
      }
      if (filters?.departmentId) {
        query = query.eq('department_id', filters.departmentId);
      }
      if (filters?.programId) {
        query = query.eq('program_id', filters.programId);
      }
      if (filters?.status && filters.status.length > 0) {
        query = query.in('status', filters.status);
      }
      if (filters?.dateRange?.from && filters?.dateRange?.to) {
        query = query
          .gte('created_at', filters.dateRange.from.toISOString())
          .lte('created_at', filters.dateRange.to.toISOString());
      }

      const { data: students, error } = await query;
      if (error) throw error;

      const totalStudents = students?.length || 0;

      // Calculate completion funnel
      const registrationStep = totalStudents;
      const basicInfoStep =
        students?.filter((s) => s.roll_number && s.college_email).length || 0;
      const contactDetailsStep =
        students?.filter((s) => s.roll_number && s.college_email).length || 0;
      const academicDetailsStep =
        students?.filter((s) => s.academic_year_id && s.semester_id).length ||
        0;
      const profilePhotoStep =
        students?.filter((s) => s.student_photo_url).length || 0;

      const profileCompletionFunnel = [
        {
          step: 'Registration',
          completed: registrationStep,
          total: totalStudents,
          percentage: 100
        },
        {
          step: 'Basic Info',
          completed: basicInfoStep,
          total: totalStudents,
          percentage:
            totalStudents > 0
              ? Math.round((basicInfoStep / totalStudents) * 100)
              : 0
        },
        {
          step: 'Contact Details',
          completed: contactDetailsStep,
          total: totalStudents,
          percentage:
            totalStudents > 0
              ? Math.round((contactDetailsStep / totalStudents) * 100)
              : 0
        },
        {
          step: 'Academic Details',
          completed: academicDetailsStep,
          total: totalStudents,
          percentage:
            totalStudents > 0
              ? Math.round((academicDetailsStep / totalStudents) * 100)
              : 0
        },
        {
          step: 'Profile Photo',
          completed: profilePhotoStep,
          total: totalStudents,
          percentage:
            totalStudents > 0
              ? Math.round((profilePhotoStep / totalStudents) * 100)
              : 0
        }
      ];

      // Calculate missing fields
      const missingRollNumber =
        students?.filter((s) => !s.roll_number).length || 0;
      const missingCollegeEmail =
        students?.filter((s) => !s.college_email).length || 0;
      const missingProfilePhoto =
        students?.filter((s) => !s.student_photo_url).length || 0;
      const missingAcademicYear =
        students?.filter((s) => !s.academic_year_id).length || 0;
      const missingSection = students?.filter((s) => !s.section_id).length || 0;

      const missingFields = [
        {
          field: 'Profile Photo',
          missingCount: missingProfilePhoto,
          percentage:
            totalStudents > 0
              ? Math.round((missingProfilePhoto / totalStudents) * 100)
              : 0
        },
        {
          field: 'Roll Number',
          missingCount: missingRollNumber,
          percentage:
            totalStudents > 0
              ? Math.round((missingRollNumber / totalStudents) * 100)
              : 0
        },
        {
          field: 'College Email',
          missingCount: missingCollegeEmail,
          percentage:
            totalStudents > 0
              ? Math.round((missingCollegeEmail / totalStudents) * 100)
              : 0
        },
        {
          field: 'Academic Year',
          missingCount: missingAcademicYear,
          percentage:
            totalStudents > 0
              ? Math.round((missingAcademicYear / totalStudents) * 100)
              : 0
        },
        {
          field: 'Section',
          missingCount: missingSection,
          percentage:
            totalStudents > 0
              ? Math.round((missingSection / totalStudents) * 100)
              : 0
        }
      ];

      // Calculate time to complete (simplified)
      const completionTimes: number[] = [];
      students?.forEach((student) => {
        if (
          student.is_profile_complete &&
          student.created_at &&
          student.updated_at
        ) {
          const createdDate = new Date(student.created_at);
          const updatedDate = new Date(student.updated_at);
          const diffInDays = Math.ceil(
            (updatedDate.getTime() - createdDate.getTime()) /
              (1000 * 60 * 60 * 24)
          );
          completionTimes.push(Math.max(0, diffInDays));
        }
      });

      const avgCompletionTime =
        completionTimes.length > 0
          ? completionTimes.reduce((sum, time) => sum + time, 0) /
            completionTimes.length
          : 0;

      const medianCompletionTime =
        completionTimes.length > 0
          ? completionTimes.sort((a, b) => a - b)[
              Math.floor(completionTimes.length / 2)
            ]
          : 0;

      // Distribution of completion times
      const sameDay = completionTimes.filter((t) => t === 0).length;
      const oneToThreeDays = completionTimes.filter(
        (t) => t >= 1 && t <= 3
      ).length;
      const fourToSevenDays = completionTimes.filter(
        (t) => t >= 4 && t <= 7
      ).length;
      const eightPlusDays = completionTimes.filter((t) => t >= 8).length;
      const totalCompletions = completionTimes.length;

      const timeToComplete = {
        average: Math.round(avgCompletionTime * 10) / 10,
        median: medianCompletionTime,
        distribution: [
          {
            range: 'Same Day',
            count: sameDay,
            percentage:
              totalCompletions > 0
                ? Math.round((sameDay / totalCompletions) * 100)
                : 0
          },
          {
            range: '1-3 Days',
            count: oneToThreeDays,
            percentage:
              totalCompletions > 0
                ? Math.round((oneToThreeDays / totalCompletions) * 100)
                : 0
          },
          {
            range: '4-7 Days',
            count: fourToSevenDays,
            percentage:
              totalCompletions > 0
                ? Math.round((fourToSevenDays / totalCompletions) * 100)
                : 0
          },
          {
            range: '8+ Days',
            count: eightPlusDays,
            percentage:
              totalCompletions > 0
                ? Math.round((eightPlusDays / totalCompletions) * 100)
                : 0
          }
        ]
      };

      return {
        profileCompletionFunnel,
        missingFields,
        timeToComplete
      };
    } catch (error) {
      console.error('Error fetching onboarding stats:', error);
      return {
        profileCompletionFunnel: [],
        missingFields: [],
        timeToComplete: {
          average: 0,
          median: 0,
          distribution: []
        }
      };
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

  static async bulkPromoteStudents(
    studentIds: string[],
    semesterId: string,
    sectionId: string,
    departmentId?: string,
    academicYearId?: string,
    onProgress?: (
      progress: number,
      success: string[],
      failed: { id: string; error: string }[]
    ) => void
  ): Promise<{
    success: string[];
    failed: { id: string; error: string }[];
  }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    try {
      // Validate that all student IDs exist
      const { data: existingStudents, error: studentsError } =
        await this.supabase
          .from('students')
          .select('id, first_name, last_name')
          .in('id', studentIds);

      if (studentsError) {
        throw new Error(
          `Failed to validate students: ${studentsError.message}`
        );
      }

      if (!existingStudents || existingStudents.length !== studentIds.length) {
        const foundIds = existingStudents?.map((s) => s.id) || [];
        const missingIds = studentIds.filter((id) => !foundIds.includes(id));
        throw new Error(`Some students not found: ${missingIds.join(', ')}`);
      }

      // First, get the semester details to ensure hierarchy consistency
      const { data: semester, error: semesterError } = await this.supabase
        .from('semesters')
        .select('program_id, department_id, institution_id')
        .eq('id', semesterId)
        .single();

      if (semesterError || !semester) {
        throw new Error(`Invalid semester ID: ${semesterId}`);
      }

      // Validate that the section belongs to the same semester and institution
      const { data: section, error: sectionError } = await this.supabase
        .from('sections')
        .select('id, institution_id, department_id, program_id, semester_id')
        .eq('id', sectionId)
        .single();

      if (sectionError || !section) {
        throw new Error(`Invalid section ID: ${sectionId}`);
      }

      // Validate section-semester consistency
      if (section.semester_id !== semesterId) {
        throw new Error(
          `Section ${sectionId} does not belong to semester ${semesterId}`
        );
      }

      if (section.institution_id !== semester.institution_id) {
        throw new Error(
          `Section ${sectionId} does not belong to the same institution as semester ${semesterId}`
        );
      }

      // Validate department if provided
      let finalDepartmentId = semester.department_id;
      if (departmentId && departmentId !== semester.department_id) {
        const { data: department, error: departmentError } = await this.supabase
          .from('departments')
          .select('id, institution_id')
          .eq('id', departmentId)
          .single();

        if (departmentError || !department) {
          throw new Error(`Invalid department ID: ${departmentId}`);
        }

        if (department.institution_id !== semester.institution_id) {
          throw new Error(
            `Department ${departmentId} does not belong to the same institution as semester ${semesterId}`
          );
        }

        finalDepartmentId = departmentId;
      }

      // Validate academic year if provided
      if (academicYearId) {
        const { data: academicYear, error: academicYearError } =
          await this.supabase
            .from('academic_years')
            .select('id, institution_id')
            .eq('id', academicYearId)
            .single();

        if (academicYearError || !academicYear) {
          throw new Error(`Invalid academic year ID: ${academicYearId}`);
        }

        if (academicYear.institution_id !== semester.institution_id) {
          throw new Error(
            `Academic year ${academicYearId} does not belong to the same institution as semester ${semesterId}`
          );
        }
      }

      // Build update payload with hierarchy-consistent values
      const updatePayload: any = {
        semester_id: semesterId,
        section_id: sectionId,
        program_id: semester.program_id,
        department_id: finalDepartmentId,
        institution_id: semester.institution_id,
        updated_at: new Date().toISOString(),
        updated_by: (await this.supabase.auth.getUser()).data.user?.id
      };

      // Add academic year if provided
      if (academicYearId) {
        updatePayload.academic_year_id = academicYearId;
      }

      // Process in chunks to avoid overwhelming the server
      const chunkSize = 50;
      let processedCount = 0;

      for (let i = 0; i < studentIds.length; i += chunkSize) {
        const chunk = studentIds.slice(i, i + chunkSize);
        try {
          const { error, data } = await this.supabase
            .from('students')
            .update(updatePayload)
            .in('id', chunk)
            .select('id');

          if (error) {
            throw new Error(
              `Failed to promote students in chunk ${i / chunkSize + 1}: ${
                error.message
              }`
            );
          }

          // Log successful updates for debugging
          console.log(
            `Successfully updated ${data?.length || 0} students in chunk ${
              i / chunkSize + 1
            }`
          );
          success.push(...chunk);
          processedCount += chunk.length;
        } catch (error) {
          console.error('Error in bulk promotion chunk:', error);
          chunk.forEach((id) => {
            failed.push({
              id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          });
          processedCount += chunk.length;
        }

        // Call progress callback
        if (onProgress) {
          const progress = (processedCount / studentIds.length) * 100;
          onProgress(progress, [...success], [...failed]);
        }
      }

      return { success, failed };
    } catch (error) {
      console.error('Error in bulk promotion:', error);
      studentIds.forEach((id) => {
        failed.push({
          id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      });
      return { success, failed };
    }
  }

  static async bulkUpdateStudents(
    updates: BulkUpdateStudentDto[],
    supabaseClient?: any,
    onProgress?: (progress: number) => void
  ): Promise<BulkUpdateResult> {
    // Use provided client or fallback to class client
    const supabase = supabaseClient || this.supabase;
    const result: BulkUpdateResult = {
      success: [],
      skipped: [],
      failed: [],
      userCreation: {
        successful: [],
        failed: [],
        skipped: []
      },
      summary: {
        total: updates.length,
        updated: 0,
        skipped: 0,
        failed: 0,
        usersCreated: 0,
        fieldsUpdated: {
          roll_number: 0,
          college_email: 0,
          academic_year_id: 0,
          semester_id: 0,
          section_id: 0,
          student_photo_url: 0
        }
      }
    };

    try {
      // Validate email format if provided
      const emailRegex = /^[^\s@]+@jkkn\.ac\.in$/i;

      // Process in batches of 50
      const chunkSize = 50;
      let processedCount = 0;

      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);

        // Process each student in the chunk
        for (const update of chunk) {
          try {
            // Fetch current student data
            const { data: currentStudent, error: fetchError } =
              await supabase
                .from('students')
                .select(
                  'id, first_name, last_name, roll_number, college_email, academic_year_id, semester_id, section_id, student_photo_url, is_profile_complete'
                )
                .eq('id', update.id)
                .single();

            if (fetchError || !currentStudent) {
              result.failed.push({
                id: update.id,
                studentName: `Student ID: ${update.id}`,
                error: `Student not found in database. Please verify the Student ID is correct.`
              });
              result.summary.failed++;
              continue;
            }

            const studentName = `${currentStudent.first_name} ${
              currentStudent.last_name || ''
            }`.trim();

            // Build update payload - only update fields that are currently empty
            const fieldsToUpdate: any = {};
            let hasUpdates = false;

            // Check each field
            const fields: Array<keyof BulkUpdateStudentDto> = [
              'roll_number',
              'college_email',
              'academic_year_id',
              'semester_id',
              'section_id',
              'student_photo_url'
            ];

            for (const field of fields) {
              if (field === 'id') continue;

              const newValue = update[field];
              const currentValue = currentStudent[field];

              // If new value is provided and not empty
              if (
                newValue !== undefined &&
                newValue !== null &&
                newValue !== ''
              ) {
                // If current value is empty/null, allow update
                if (
                  currentValue === null ||
                  currentValue === undefined ||
                  currentValue === ''
                ) {
                  // Validate email format
                  if (field === 'college_email') {
                    if (!emailRegex.test(newValue as string)) {
                      result.skipped.push({
                        id: update.id,
                        studentName,
                        field,
                        currentValue,
                        attemptedValue: newValue,
                        reason: 'Invalid email format (must end with @jkkn.ac.in)'
                      });
                      result.summary.skipped++;
                      continue;
                    }
                  }

                  fieldsToUpdate[field] = newValue;
                  result.summary.fieldsUpdated[
                    field as keyof typeof result.summary.fieldsUpdated
                  ]++;
                  hasUpdates = true;
                } else {
                  // Field already has a value, skip
                  result.skipped.push({
                    id: update.id,
                    studentName,
                    field,
                    currentValue,
                    attemptedValue: newValue,
                    reason: 'Field already has a value'
                  });
                  result.summary.skipped++;
                }
              }
            }

            // If no fields to update, skip this student
            if (!hasUpdates) {
              continue;
            }

            // Calculate profile completeness with merged data
            const mergedData = { ...currentStudent, ...fieldsToUpdate };
            const isNowComplete = this.calculateProfileCompleteness(mergedData);

            // Update the student record
            const { error: updateError } = await supabase
              .from('students')
              .update({
                ...fieldsToUpdate,
                is_profile_complete: isNowComplete,
                updated_at: new Date().toISOString(),
                updated_by: (await supabase.auth.getUser()).data.user?.id
              })
              .eq('id', update.id);

            if (updateError) {
              result.failed.push({
                id: update.id,
                studentName,
                error: `Update failed: ${updateError.message}`
              });
              result.summary.failed++;
              continue;
            }

            // Mark as successfully updated
            result.success.push(update.id);
            result.summary.updated++;

            // Check if profile just became complete and trigger user creation
            console.log('[bulkUpdateStudents] Checking user creation:', {
              studentId: update.id,
              isNowComplete,
              wasComplete: currentStudent.is_profile_complete,
              hasEmail: !!(fieldsToUpdate.college_email || currentStudent.college_email)
            });

            if (
              isNowComplete &&
              !currentStudent.is_profile_complete &&
              (fieldsToUpdate.college_email || currentStudent.college_email)
            ) {
              const email =
                fieldsToUpdate.college_email || currentStudent.college_email;

              console.log('[bulkUpdateStudents] Calling complete-onboarding for:', {
                studentId: update.id,
                email
              });

              try {
                // Use full URL for server-side fetch
                const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
                const response = await fetch(
                  `${baseUrl}/api/students/complete-onboarding`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ student_id: update.id })
                  }
                );

                console.log('[bulkUpdateStudents] API response:', {
                  ok: response.ok,
                  status: response.status
                });

                if (response.ok) {
                  console.log('[bulkUpdateStudents] User created successfully for:', email);
                  result.userCreation.successful.push({
                    studentId: update.id,
                    studentName,
                    email
                  });
                  result.summary.usersCreated++;
                } else {
                  const errorData = await response.json();
                  console.error('[bulkUpdateStudents] User creation failed:', errorData);
                  result.userCreation.failed.push({
                    studentId: update.id,
                    studentName,
                    email,
                    error:
                      errorData.error || 'Failed to create user account'
                  });
                }
              } catch (apiError) {
                console.error('[bulkUpdateStudents] API call error:', apiError);
                result.userCreation.failed.push({
                  studentId: update.id,
                  studentName,
                  email,
                  error:
                    apiError instanceof Error
                      ? apiError.message
                      : 'Unknown error during user creation'
                });
              }
            } else if (isNowComplete && currentStudent.is_profile_complete) {
              // Profile was already complete
              result.userCreation.skipped.push({
                studentId: update.id,
                studentName,
                reason: 'Profile already complete'
              });
            } else if (!isNowComplete) {
              // Profile still incomplete
              result.userCreation.skipped.push({
                studentId: update.id,
                studentName,
                reason: 'Profile still incomplete after update'
              });
            }
          } catch (error) {
            result.failed.push({
              id: update.id,
              studentName: 'Unknown',
              error:
                error instanceof Error ? error.message : 'Unknown error'
            });
            result.summary.failed++;
          }

          processedCount++;
          if (onProgress) {
            const progress = (processedCount / updates.length) * 100;
            onProgress(progress);
          }
        }
      }

      return result;
    } catch (error) {
      console.error('Error in bulk update:', error);
      throw error;
    }
  }

  /**
   * Generate preview of bulk edit changes without applying to database
   * This compares uploaded data with current database values
   */
  static async generateBulkEditPreview(
    updates: BulkEditStudentDto[],
    supabaseClient?: any,
    onProgress?: (progress: number) => void
  ): Promise<BulkEditPreview> {
    try {
      const supabase = supabaseClient || createClientSupabaseClient();
      const studentChanges: StudentChanges[] = [];
      const changesByField: Record<string, number> = {};

      // Field labels for human-readable display
      const FIELD_LABELS: Record<string, string> = {
        first_name: 'First Name',
        last_name: 'Last Name',
        date_of_birth: 'Date of Birth',
        gender: 'Gender',
        student_mobile: 'Student Mobile',
        student_email: 'Student Email',
        roll_number: 'Roll Number',
        college_email: 'College Email',
        academic_year_id: 'Academic Year',
        semester_id: 'Semester',
        section_id: 'Section',
        status: 'Status',
        student_photo_url: 'Photo URL',
        father_name: 'Father Name',
        father_occupation: 'Father Occupation',
        father_mobile: 'Father Mobile',
        mother_name: 'Mother Name',
        mother_occupation: 'Mother Occupation',
        mother_mobile: 'Mother Mobile',
        religion: 'Religion',
        community: 'Community',
        caste: 'Caste',
        annual_income: 'Annual Income',
        aadhar_number: 'Aadhar Number',
        last_school: 'Last School',
        board_of_study: 'Board of Study',
        tenth_marks: 'Tenth Marks',
        twelfth_marks: 'Twelfth Marks',
        engineering_cutoff_marks: 'Engineering Cutoff',
        medical_cutoff_marks: 'Medical Cutoff',
        neet_roll_number: 'NEET Roll Number',
        neet_score: 'NEET Score',
        counseling_applied: 'Counseling Applied',
        counseling_number: 'Counseling Number',
        first_graduate: 'First Graduate',
        quota: 'Quota',
        category: 'Category',
        permanent_address_street: 'Address Street',
        permanent_address_taluk: 'Address Taluk',
        permanent_address_district: 'Address District',
        permanent_address_pin_code: 'Address PIN Code',
        permanent_address_state: 'Address State',
        accommodation_type: 'Accommodation Type',
        hostel_type: 'Hostel Type',
        food_type: 'Food Type',
        bus_required: 'Bus Required',
        bus_route: 'Bus Route',
        bus_pickup_location: 'Bus Pickup Location',
        reference_type: 'Reference Type',
        reference_name: 'Reference Name',
        reference_contact: 'Reference Contact'
      };

      // Process each student update
      for (let i = 0; i < updates.length; i++) {
        const update = updates[i];

        // Fetch current student data
        const { data: currentStudent, error } = await supabase
          .from('students')
          .select('*')
          .eq('id', update.id)
          .single();

        if (error || !currentStudent) {
          console.warn(`Student not found: ${update.id}`);
          continue;
        }

        // Compare each field
        const changes: FieldChange[] = [];

        Object.keys(update).forEach((fieldName) => {
          if (fieldName === 'id') return; // Skip ID field

          const oldValue = currentStudent[fieldName];
          const newValue = (update as any)[fieldName];

          // Normalize values for comparison
          const normalizeValue = (val: any) => {
            if (val === null || val === undefined || val === '') return null;
            if (typeof val === 'object') return JSON.stringify(val);
            return String(val);
          };

          const normalizedOld = normalizeValue(oldValue);
          const normalizedNew = normalizeValue(newValue);

          // Skip if no change
          if (normalizedOld === normalizedNew) return;

          // Determine change type
          let changeType: 'update' | 'add' | 'remove';
          if (!normalizedOld && normalizedNew) changeType = 'add';
          else if (normalizedOld && !normalizedNew) changeType = 'remove';
          else changeType = 'update';

          changes.push({
            fieldName,
            fieldLabel: FIELD_LABELS[fieldName] || fieldName,
            oldValue,
            newValue,
            changeType
          });

          // Track by field
          changesByField[fieldName] = (changesByField[fieldName] || 0) + 1;
        });

        // Only add student if there are changes
        if (changes.length > 0) {
          studentChanges.push({
            studentId: currentStudent.id,
            studentName: `${currentStudent.first_name} ${currentStudent.last_name || ''}`.trim(),
            rollNumber: currentStudent.roll_number,
            photoUrl: currentStudent.student_photo_url,
            changes
          });
        }

        // Report progress
        if (onProgress) {
          const progress = ((i + 1) / updates.length) * 100;
          onProgress(progress);
        }
      }

      return {
        students: studentChanges,
        summary: {
          totalStudents: studentChanges.length,
          totalChanges: studentChanges.reduce(
            (sum, s) => sum + s.changes.length,
            0
          ),
          changesByField
        }
      };
    } catch (error) {
      console.error('Error generating bulk edit preview:', error);
      throw error;
    }
  }

  /**
   * Apply confirmed bulk edit changes to database
   * This updates student records with the provided data
   */
  static async applyBulkEdit(
    updates: BulkEditStudentDto[],
    supabaseClient?: any,
    onProgress?: (progress: number) => void
  ): Promise<BulkEditResult> {
    try {
      const supabase = supabaseClient || createClientSupabaseClient();
      const success: BulkEditResult['success'] = [];
      const failed: BulkEditResult['failed'] = [];

      const BATCH_SIZE = 50;
      let processedCount = 0;

      // Process in batches
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);

        for (const update of batch) {
          try {
            // Extract ID and fields to update
            const { id, ...fieldsToUpdate } = update;

            // Get list of fields being updated
            const fieldsUpdated = Object.keys(fieldsToUpdate);

            // Update student record
            const { error } = await supabase
              .from('students')
              .update(fieldsToUpdate)
              .eq('id', id);

            if (error) throw error;

            // Get student name for result
            const { data: student } = await supabase
              .from('students')
              .select('first_name, last_name')
              .eq('id', id)
              .single();

            success.push({
              studentId: id,
              studentName: student
                ? `${student.first_name} ${student.last_name || ''}`.trim()
                : 'Unknown',
              fieldsUpdated
            });
          } catch (error) {
            failed.push({
              studentId: update.id,
              studentName: update.first_name || 'Unknown',
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }

          processedCount++;
          if (onProgress) {
            const progress = (processedCount / updates.length) * 100;
            onProgress(progress);
          }
        }
      }

      return {
        success,
        failed,
        summary: {
          total: updates.length,
          updated: success.length,
          failed: failed.length
        }
      };
    } catch (error) {
      console.error('Error applying bulk edit:', error);
      throw error;
    }
  }
}
