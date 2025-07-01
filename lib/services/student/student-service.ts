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
          section:sections!section_id(id, section_name)
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

  static async createStudent(
    studentData: CreateStudentDto
  ): Promise<Student | null> {
    try {
      const now = new Date().toISOString();

      // Calculate if profile is complete
      const is_profile_complete =
        this.calculateProfileCompleteness(studentData);

      const { data: student, error } = await this.supabase
        .from('students')
        .insert({
          ...studentData,
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
          section:sections!section_id(id, section_name)
        `
        )
        .single();

      if (error) throw error;

      // Auto-create user if college_email exists (similar to staff service approach)
      if (student.college_email) {
        try {
          console.log(
            `Creating user account for student ${student.id} with email ${student.college_email}`
          );
          const tempPassword = generateTemporaryPassword();
          const userPayload: CreateUserRequest = {
            email: student.college_email,
            full_name: student.student_name,
            password: tempPassword,
            role: 'student', // Default role
            phone_number: student.student_mobile || null
          };

          console.log('User payload:', JSON.stringify(userPayload, null, 2));

          // Use absolute URL to ensure it works in all environments
          const apiUrl =
            typeof window !== 'undefined'
              ? '/api/users'
              : `${
                  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
                }/api/users`;

          console.log('API URL for user creation:', apiUrl);

          const userResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(userPayload),
            cache: 'no-store',
            credentials: 'include'
          });

          console.log('User creation response status:', userResponse.status);
          const userData = await userResponse.json();
          console.log(
            'User creation response:',
            JSON.stringify(userData, null, 2)
          );

          if (!userResponse.ok) {
            // Check for 409 Conflict (User already exists)
            if (userResponse.status === 409) {
              console.warn(
                `User with email ${userPayload.email} already exists. Skipping automatic creation.`
              );
            } else {
              // Handle other errors
              console.error(
                'Failed to automatically create user:',
                userData.error ||
                  userData.details ||
                  userData.message ||
                  'Unknown API error',
                'Status:',
                userResponse.status
              );
              console.warn(
                `Student created, but failed to create user account: ${
                  userData.error || userData.details || userData.message
                }`
              );
            }
          } else {
            console.log(
              `Successfully created user for student ${student.id} with email ${student.college_email}`
            );
            console.log(
              `Successfully created user account for student with email ${student.college_email}`
            );
          }
        } catch (apiError) {
          console.error('Error calling user creation API:', apiError);
          console.warn(
            'Student created, but encountered an error creating user account.'
          );
        }
      } else {
        console.log('No college_email provided, skipping user creation');
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
    updateData: UpdateStudentDto
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
          semester_id: !!mergedData.semester_id,
          section_id: !!mergedData.section_id
        }
      });

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
          section:sections!section_id(id, section_name)
        `
        )
        .single();

      if (error) throw error;

      // --- BEGIN: Auto User Creation Logic ---
      // Check if profile just became complete and college_email exists
      if (
        !currentStudent.is_profile_complete && // Was false before
        is_profile_complete && // Is true now
        student.college_email // Email exists
      ) {
        console.log(
          `Profile for student ${student.id} marked complete. Attempting user creation.`
        );
        const tempPassword = generateTemporaryPassword();
        const userPayload: CreateUserRequest = {
          email: student.college_email,
          full_name: student.student_name,
          password: tempPassword,
          role: 'student', // Default role
          phone_number: student.student_mobile || null
        };

        try {
          const userResponse = await fetch('/api/users', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(userPayload)
          });

          const userData = await userResponse.json();

          if (!userResponse.ok) {
            // Check for 409 Conflict (User already exists)
            if (userResponse.status === 409) {
              console.warn(
                `User with email ${userPayload.email} already exists. Skipping automatic creation.`
              );
              // Optionally show a less alarming toast or skip it
              // toast.info(`User account for ${userPayload.email} already exists.`);
            } else {
              // Handle other errors
              console.error(
                'Failed to automatically create user:',
                userData.error ||
                  userData.details ||
                  userData.message ||
                  'Unknown API error',
                'Status:',
                userResponse.status
              );
              toast(
                `Student profile updated, but failed to create user account: ${
                  userData.error || userData.details || userData.message
                }`
              );
            }
          } else {
            console.log(
              `Successfully created user for student ${student.id} with email ${student.college_email}`
            );
            // Optionally, you could add another toast, but it might be too much.
            // toast.info(`User account created for ${student.student_name}.`);
            // IMPORTANT: You need a mechanism to communicate the temporary password
            // or force a password reset on first login for the new student user.
            // This implementation does not handle password communication.
          }
        } catch (apiError) {
          console.error('Error calling user creation API:', apiError);
          toast(
            'Student profile updated, but encountered an error trying to create user account.'
          );
        }
      }
      // --- END: Auto User Creation Logic ---

      toast.success('Student record updated successfully');
      return student;
    } catch (error) {
      console.error('Error updating student:', error);
      toast.error('Failed to update student');
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
          section:sections!section_id(id, section_name)
        `,
        { count: 'exact' }
      );

      // Apply filters
      if (filters.search) {
        query = query.or(
          `student_name.ilike.%${filters.search}%,student_email.ilike.%${filters.search}%,student_mobile.ilike.%${filters.search}%,roll_number.ilike.%${filters.search}%`
        );
      }

      if (filters.student_name) {
        query = query.ilike('student_name', `%${filters.student_name}%`);
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

  static async getStudent(id: string): Promise<Student> {
    try {
      const { data: student, error } = await this.supabase
        .from('students')
        .select(
          `
          *,
          institution:institutions(id, name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters!semester_id(id, semester_name, semester_code),
          section:sections!section_id(id, section_name)
        `
        )
        .eq('id', id)
        .single();

      if (error) throw error;

      return student;
    } catch (error) {
      console.error('Error fetching student:', error);
      toast.error('Failed to fetch student details');
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
        admission_id: admission.id,
        student_name: admission.student_name,
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

  static async createStudentWithUserResult(
    studentData: CreateStudentDto
  ): Promise<{
    student: Student | null;
    userCreated: boolean;
    userError?: string;
  }> {
    try {
      const now = new Date().toISOString();

      // Calculate if profile is complete
      const is_profile_complete =
        this.calculateProfileCompleteness(studentData);

      const { data: student, error } = await this.supabase
        .from('students')
        .insert({
          ...studentData,
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
          section:sections!section_id(id, section_name)
        `
        )
        .single();

      if (error) throw error;

      // Initialize user creation result
      let userCreated = false;
      let userError: string | undefined = undefined;

      // Auto-create user if college_email exists
      if (student.college_email) {
        try {
          console.log(
            `Creating user account for student ${student.id} with email ${student.college_email}`
          );
          const tempPassword = generateTemporaryPassword();
          const userPayload: CreateUserRequest = {
            email: student.college_email,
            full_name: student.student_name,
            password: tempPassword,
            role: 'student', // Default role
            phone_number: student.student_mobile || null
          };

          console.log('User payload:', JSON.stringify(userPayload, null, 2));

          // Use absolute URL to ensure it works in all environments
          const apiUrl =
            typeof window !== 'undefined'
              ? '/api/users'
              : `${
                  process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
                }/api/users`;

          const userResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(userPayload),
            cache: 'no-store',
            credentials: 'include'
          });

          const userData = await userResponse.json();

          if (!userResponse.ok) {
            // Check for 409 Conflict (User already exists)
            if (userResponse.status === 409) {
              console.warn(
                `User with email ${userPayload.email} already exists. Skipping automatic creation.`
              );
              userCreated = true; // Consider existing user as a success for reporting
              userError = 'User already exists';
            } else {
              // Handle other errors
              const errorMessage =
                userData.error ||
                userData.details ||
                userData.message ||
                'Unknown API error';
              console.error(
                'Failed to automatically create user:',
                errorMessage
              );
              userError = errorMessage;
            }
          } else {
            console.log(
              `Successfully created user for student ${student.id} with email ${student.college_email}`
            );
            userCreated = true;
          }
        } catch (apiError) {
          console.error('Error calling user creation API:', apiError);
          userError =
            apiError instanceof Error
              ? apiError.message
              : 'Unknown error creating user';
        }
      } else {
        console.log('No college_email provided, skipping user creation');
      }

      return {
        student,
        userCreated,
        userError
      };
    } catch (error) {
      console.error('Error creating student:', error);
      toast.error('Failed to create student');
      throw error;
    }
  }

  // Dashboard Methods
  static async getDashboardStats(filters?: any): Promise<any> {
    try {
      const { data: students, error } = await this.supabase.from('students')
        .select(`
          *,
          institution:institutions!institution_id(id, name),
          degree:degrees!degree_id(id, degree_name),
          department:departments!department_id(id, department_name),
          program:programs!program_id(id, program_name),
          semester:semesters!semester_id(id, semester_name, semester_code),
          section:sections!section_id(id, section_name)
        `);

      if (error) throw error;

      // Calculate overview statistics
      const totalStudents = students.length;
      const activeStudents = students.filter(
        (s) => s.status === 'active'
      ).length;
      const inactiveStudents = students.filter(
        (s) => s.status === 'inactive'
      ).length;
      const pendingStudents = students.filter(
        (s) => s.status === 'pending'
      ).length;
      const exitedStudents = students.filter(
        (s) => s.status === 'exited'
      ).length;
      const graduatedStudents = students.filter(
        (s) => s.status === 'graduated'
      ).length;
      const completeProfiles = students.filter(
        (s) => s.is_profile_complete
      ).length;
      const incompleteProfiles = totalStudents - completeProfiles;
      const profileCompletionRate =
        totalStudents > 0 ? (completeProfiles / totalStudents) * 100 : 0;

      // Calculate registration trends (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const registrationTrends = [];
      for (let i = 0; i < 30; i++) {
        const date = new Date(thirtyDaysAgo);
        date.setDate(date.getDate() + i);
        const dateString = date.toISOString().split('T')[0];

        const dayRegistrations = students.filter(
          (s) => s.created_at && s.created_at.startsWith(dateString)
        ).length;

        const cumulativeCount = students.filter(
          (s) => s.created_at && new Date(s.created_at) <= date
        ).length;

        registrationTrends.push({
          date: dateString,
          count: dayRegistrations,
          cumulative: cumulativeCount
        });
      }

      // Calculate institution statistics
      const institutionMap = new Map();
      students.forEach((student) => {
        if (student.institution) {
          const key = student.institution.id;
          if (!institutionMap.has(key)) {
            institutionMap.set(key, {
              id: student.institution.id,
              name: student.institution.name,
              studentCount: 0
            });
          }
          institutionMap.get(key).studentCount++;
        }
      });

      const institutionStats = Array.from(institutionMap.values()).map(
        (inst) => ({
          ...inst,
          percentage:
            totalStudents > 0 ? (inst.studentCount / totalStudents) * 100 : 0
        })
      );

      // Calculate department statistics
      const departmentMap = new Map();
      students.forEach((student) => {
        if (student.department) {
          const key = student.department.id;
          if (!departmentMap.has(key)) {
            departmentMap.set(key, {
              id: student.department.id,
              name: student.department.department_name,
              studentCount: 0,
              institutionName: student.institution?.name || 'Unknown'
            });
          }
          departmentMap.get(key).studentCount++;
        }
      });

      const departmentStats = Array.from(departmentMap.values()).map(
        (dept) => ({
          ...dept,
          percentage:
            totalStudents > 0 ? (dept.studentCount / totalStudents) * 100 : 0
        })
      );

      // Calculate program statistics
      const programMap = new Map();
      students.forEach((student) => {
        if (student.program) {
          const key = student.program.id;
          if (!programMap.has(key)) {
            programMap.set(key, {
              id: student.program.id,
              name: student.program.program_name,
              studentCount: 0,
              departmentName: student.department?.department_name || 'Unknown'
            });
          }
          programMap.get(key).studentCount++;
        }
      });

      const programStats = Array.from(programMap.values()).map((prog) => ({
        ...prog,
        percentage:
          totalStudents > 0 ? (prog.studentCount / totalStudents) * 100 : 0
      }));

      // Calculate semester statistics
      const semesterMap = new Map();
      students.forEach((student) => {
        if (student.semester) {
          const key = student.semester.id;
          if (!semesterMap.has(key)) {
            semesterMap.set(key, {
              id: student.semester.id,
              name: student.semester.semester_name,
              studentCount: 0
            });
          }
          semesterMap.get(key).studentCount++;
        }
      });

      const semesterStats = Array.from(semesterMap.values()).map((sem) => ({
        ...sem,
        percentage:
          totalStudents > 0 ? (sem.studentCount / totalStudents) * 100 : 0
      }));

      // Calculate section statistics
      const sectionMap = new Map();
      students.forEach((student) => {
        if (student.section) {
          const key = student.section.id;
          if (!sectionMap.has(key)) {
            sectionMap.set(key, {
              id: student.section.id,
              name: student.section.section_name,
              studentCount: 0,
              semesterName: student.semester?.semester_name || 'Unknown'
            });
          }
          sectionMap.get(key).studentCount++;
        }
      });

      const sectionStats = Array.from(sectionMap.values()).map((sec) => ({
        ...sec,
        percentage:
          totalStudents > 0 ? (sec.studentCount / totalStudents) * 100 : 0
      }));

      // Calculate demographic statistics
      const genderStats = this.calculateDistribution(students, 'gender');
      const entryTypeStats = this.calculateDistribution(students, 'entry_type');
      const accommodationTypeStats = this.calculateDistribution(
        students,
        'accommodation_type'
      );
      const religionStats = this.calculateDistribution(students, 'religion');
      const communityStats = this.calculateDistribution(students, 'community');

      // Calculate age groups
      const ageGroups = this.calculateAgeGroups(students);

      // Calculate geographic statistics
      const geographicStats = this.calculateGeographicStats(students);

      // Calculate onboarding statistics
      const onboardingStats = this.calculateOnboardingStats(students);

      return {
        overview: {
          totalStudents,
          activeStudents,
          inactiveStudents,
          pendingStudents,
          exitedStudents,
          graduatedStudents,
          profileCompletionRate,
          completeProfiles,
          incompleteProfiles
        },
        registrationTrends,
        institutionStats,
        departmentStats,
        programStats,
        semesterStats,
        sectionStats,
        demographicStats: {
          gender: genderStats,
          entryType: entryTypeStats,
          accommodationType: accommodationTypeStats,
          religion: religionStats,
          community: communityStats,
          ageGroups
        },
        geographicStats,
        onboardingStats
      };
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }

  private static calculateDistribution(students: any[], field: string) {
    const distribution = new Map();
    const total = students.length;

    students.forEach((student) => {
      const value = student[field] || 'Not Specified';
      distribution.set(value, (distribution.get(value) || 0) + 1);
    });

    return Array.from(distribution.entries()).map(([key, count]) => ({
      [field === 'entry_type' ? 'type' : field]: key,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }));
  }

  private static calculateAgeGroups(students: any[]) {
    const ageGroups = new Map([
      ['16-18', 0],
      ['19-21', 0],
      ['22-24', 0],
      ['25+', 0],
      ['Unknown', 0]
    ]);

    students.forEach((student) => {
      if (student.date_of_birth) {
        const age =
          new Date().getFullYear() -
          new Date(student.date_of_birth).getFullYear();
        if (age >= 16 && age <= 18) {
          ageGroups.set('16-18', ageGroups.get('16-18')! + 1);
        } else if (age >= 19 && age <= 21) {
          ageGroups.set('19-21', ageGroups.get('19-21')! + 1);
        } else if (age >= 22 && age <= 24) {
          ageGroups.set('22-24', ageGroups.get('22-24')! + 1);
        } else if (age >= 25) {
          ageGroups.set('25+', ageGroups.get('25+')! + 1);
        } else {
          ageGroups.set('Unknown', ageGroups.get('Unknown')! + 1);
        }
      } else {
        ageGroups.set('Unknown', ageGroups.get('Unknown')! + 1);
      }
    });

    const total = students.length;
    return Array.from(ageGroups.entries()).map(([ageGroup, count]) => ({
      ageGroup,
      count,
      percentage: total > 0 ? (count / total) * 100 : 0
    }));
  }

  private static calculateGeographicStats(students: any[]) {
    const geoMap = new Map();
    const total = students.length;

    students.forEach((student) => {
      const state = student.permanent_address_state || 'Unknown';
      const district = student.permanent_address_district || 'Unknown';
      const key = `${state}-${district}`;

      if (!geoMap.has(key)) {
        geoMap.set(key, {
          state,
          district,
          count: 0
        });
      }
      geoMap.get(key).count++;
    });

    return Array.from(geoMap.values()).map((geo) => ({
      ...geo,
      percentage: total > 0 ? (geo.count / total) * 100 : 0
    }));
  }

  private static calculateOnboardingStats(students: any[]) {
    const total = students.length;

    // Profile completion funnel
    const hasName = students.filter((s) => s.student_name).length;
    const hasContact = students.filter(
      (s) => s.student_mobile || s.student_email
    ).length;
    const hasRollNumber = students.filter((s) => s.roll_number).length;
    const hasCollegeEmail = students.filter((s) => s.college_email).length;
    const hasSemester = students.filter((s) => s.semester_id).length;
    const hasSection = students.filter((s) => s.section_id).length;
    const hasPhoto = students.filter((s) => s.student_photo_url).length;
    const isComplete = students.filter((s) => s.is_profile_complete).length;

    const profileCompletionFunnel = [
      {
        step: 'Basic Info',
        completed: hasName,
        total,
        percentage: (hasName / total) * 100
      },
      {
        step: 'Contact Info',
        completed: hasContact,
        total,
        percentage: (hasContact / total) * 100
      },
      {
        step: 'Roll Number',
        completed: hasRollNumber,
        total,
        percentage: (hasRollNumber / total) * 100
      },
      {
        step: 'College Email',
        completed: hasCollegeEmail,
        total,
        percentage: (hasCollegeEmail / total) * 100
      },
      {
        step: 'Semester',
        completed: hasSemester,
        total,
        percentage: (hasSemester / total) * 100
      },
      {
        step: 'Section',
        completed: hasSection,
        total,
        percentage: (hasSection / total) * 100
      },
      {
        step: 'Photo',
        completed: hasPhoto,
        total,
        percentage: (hasPhoto / total) * 100
      },
      {
        step: 'Complete',
        completed: isComplete,
        total,
        percentage: (isComplete / total) * 100
      }
    ];

    // Missing fields analysis
    const missingFields = [
      { field: 'Roll Number', missingCount: total - hasRollNumber },
      { field: 'College Email', missingCount: total - hasCollegeEmail },
      { field: 'Semester', missingCount: total - hasSemester },
      { field: 'Section', missingCount: total - hasSection },
      { field: 'Photo', missingCount: total - hasPhoto }
    ].map((field) => ({
      ...field,
      percentage: total > 0 ? (field.missingCount / total) * 100 : 0
    }));

    return {
      profileCompletionFunnel,
      missingFields,
      timeToComplete: {
        average: 0, // Would need to track timestamps for this
        median: 0,
        distribution: []
      }
    };
  }
}
