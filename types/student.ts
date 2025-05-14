import { z } from 'zod';

export interface Student {
  id: string;
  admission_id: string; // Reference to the original admission record
  student_name: string;
  father_name: string;
  father_occupation: string;
  father_mobile: string;
  mother_name: string;
  mother_occupation: string;
  mother_mobile: string;
  date_of_birth: string;
  gender: string;
  religion: string;
  community: string;
  caste: string;
  annual_income: string;
  last_school: string;
  board_of_study: string;
  tenth_marks: {
    max_marks: string;
    obtained_marks: string;
    percentage: string;
  };
  twelfth_marks: {
    group: string;
    max_marks: string;
    obtained_marks: string;
    percentage: string;
    subjects: Record<string, string>;
  };
  medical_cutoff_marks?: string;
  engineering_cutoff_marks?: string;
  neet_roll_number?: string;
  counseling_applied: boolean;
  counseling_number?: string;
  first_graduate: boolean;
  quota?: string;
  category?: string;
  institution_id?: string;
  degree_id?: string;
  department_id?: string;
  program_id?: string;
  semester_id?: string;
  section_id?: string;
  entry_type: string; // FIRST YEAR, LATERAL ENTRY, etc.
  permanent_address_street: string;
  permanent_address_taluk?: string;
  permanent_address_district: string;
  permanent_address_pin_code: string;
  permanent_address_state: string;
  student_mobile: string;
  student_email: string;
  accommodation_type: string;
  hostel_type?: string;
  bus_required?: boolean;
  bus_route?: string;
  bus_pickup_location?: string;
  reference_type?: string;
  reference_name?: string;
  reference_contact?: string;

  // Additional student fields
  roll_number?: string;
  student_photo_url?: string;
  college_email?: string;
  is_profile_complete: boolean;
  status: 'active' | 'inactive' | 'pending' | 'exited' | 'graduated'; // Add student_status enum values

  created_at: string;
  updated_at: string;
  created_by?: string;
  updated_by?: string;

  // Related data from joins
  institution?: {
    id: string;
    name: string;
  };
  degree?: {
    id: string;
    degree_name: string;
  };
  department?: {
    id: string;
    department_name: string;
  };
  program?: {
    id: string;
    program_name: string;
  };
  semester?: {
    id: string;
    semester_name: string;
    semester_code: string;
  };
  section?: {
    id: string;
    section_name: string;
    section_code: string;
  };
}

// Zod schema for validation
export const studentSchema = z.object({
  student_name: z.string().min(2, 'Name is required'),
  father_name: z.string().min(2, "Father's name is required"),
  mother_name: z.string().min(2, "Mother's name is required"),
  roll_number: z.string().optional(),
  college_email: z.string().email('Invalid college email').optional(),
  student_photo_url: z.string().optional(),
  semester_id: z.string().optional(),
  section_id: z.string().optional()
});

export interface CreateStudentDto
  extends Omit<
    Student,
    'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
  > {
  // Additional properties specific to creation if needed
}

export interface UpdateStudentDto
  extends Partial<
    Omit<
      Student,
      | 'id'
      | 'admission_id'
      | 'created_at'
      | 'updated_at'
      | 'created_by'
      | 'updated_by'
    >
  > {
  // Additional properties specific to update if needed
}

export interface StudentFilters {
  search?: string;
  student_name?: string;
  institution?: string;
  department?: string;
  program?: string;
  semester?: string;
  section?: string;
  gender?: string;
  entry_type?: string;
  accommodation_type?: string;
  status?: string;
  created_from?: Date;
  created_to?: Date;
  is_active?: boolean;
  is_profile_complete?: boolean;
  page?: number;
  limit?: number;
}

export interface StudentListResponse {
  data: Student[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
