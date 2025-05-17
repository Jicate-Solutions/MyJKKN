import { createClientSupabaseClient } from '@/lib/supabase/client';
import {
  Student,
  StudentFilters,
  StudentListResponse,
  CreateStudentDto,
  UpdateStudentDto
} from '@/types/student';
import { CreateUserRequest } from '@/types/users';
import { toast } from 'sonner';

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

      toast.success('Student record created successfully');
      return student;
    } catch (error) {
      console.error('Error creating student:', error);
      toast.error('Failed to create student');
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
              toast.warning(
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
          toast.warning(
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
      const { error } = await this.supabase
        .from('students')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Student record deleted successfully');
    } catch (error) {
      console.error('Error deleting student record:', error);
      toast.error('Failed to delete student record');
      throw error;
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
      toast.error('Failed to fetch student records');
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
    const requiredFields = [
      'roll_number',
      'college_email',
      'student_photo_url',
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
}
