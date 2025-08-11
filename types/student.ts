import { z } from 'zod';

export interface Student {
  id: string;
  admission_id: string; // Foreign key to admissions table
  application_id?: string; // Human-readable application ID
  first_name: string;
  last_name?: string;
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
  academic_year_id?: string;
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
  academic_year?: {
    id: string;
    academic_year_name: string;
    start_date: string;
    end_date: string;
    is_active: boolean;
  };
}

// Zod schema for validation
export const studentSchema = z.object({
  first_name: z.string().min(2, 'First name is required'),
  last_name: z.string().optional(),
  father_name: z.string().min(2, "Father's name is required"),
  mother_name: z.string().min(2, "Mother's name is required"),
  roll_number: z.string().optional(),
  college_email: z.string().email('Invalid college email').optional(),
  student_photo_url: z.string().optional(),
  academic_year_id: z.string().optional(),
  semester_id: z.string().optional(),
  section_id: z.string().optional(),

  // Fields from admission record
  father_occupation: z.string().optional(),
  father_mobile: z.string().optional(),
  mother_occupation: z.string().optional(),
  mother_mobile: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.string().optional(),
  religion: z.string().optional(),
  community: z.string().optional(),
  caste: z.string().optional(),
  annual_income: z.string().optional(),
  last_school: z.string().optional(),
  board_of_study: z.string().optional(),
  tenth_marks: z.any().optional(),
  twelfth_marks: z.any().optional(),
  medical_cutoff_marks: z.string().optional(),
  engineering_cutoff_marks: z.string().optional(),
  neet_roll_number: z.string().optional(),
  counseling_applied: z.boolean().optional(),
  counseling_number: z.string().optional(),
  first_graduate: z.boolean().optional(),
  quota: z.string().optional(),
  category: z.string().optional(),
  institution_id: z.string().nullable().optional(),
  degree_id: z.string().nullable().optional(),
  department_id: z.string().nullable().optional(),
  program_id: z.string().nullable().optional(),
  entry_type: z.string().optional(),
  permanent_address_street: z.string().optional(),
  permanent_address_taluk: z.string().optional(),
  permanent_address_district: z.string().optional(),
  permanent_address_pin_code: z.string().optional(),
  permanent_address_state: z.string().optional(),
  student_mobile: z.string().optional(),
  student_email: z.string().optional(),
  accommodation_type: z.string().optional(),
  hostel_type: z.string().optional(),
  bus_required: z.boolean().optional(),
  bus_route: z.string().optional(),
  bus_pickup_location: z.string().optional(),
  reference_type: z.string().optional(),
  reference_name: z.string().optional(),
  reference_contact: z.string().optional()
});

export type CreateStudentDto = z.infer<typeof studentSchema> & {
  admission_id: string | null;
  application_id?: string; // Add application_id here
  status: 'active' | 'inactive' | 'pending' | 'exited' | 'graduated';
  is_profile_complete: boolean;
};

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
  first_name?: string;
  last_name?: string;
  institution?: string;
  degree?: string;
  department?: string;
  program?: string;
  semester?: string;
  section?: string;
  academic_year?: string;
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
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
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

// Dashboard Types
export interface StudentDashboardStats {
  overview: {
    totalStudents: number;
    activeStudents: number;
    inactiveStudents: number;
    pendingStudents: number;
    exitedStudents: number;
    graduatedStudents: number;
    profileCompletionRate: number;
    completeProfiles: number;
    incompleteProfiles: number;
  };
  registrationTrends: Array<{
    date: string;
    count: number;
    cumulative: number;
  }>;
  institutionStats: Array<{
    id: string;
    name: string;
    studentCount: number;
    percentage: number;
  }>;
  departmentStats: Array<{
    id: string;
    name: string;
    studentCount: number;
    percentage: number;
    institutionName: string;
  }>;
  programStats: Array<{
    id: string;
    name: string;
    studentCount: number;
    percentage: number;
    departmentName: string;
  }>;
  semesterStats: Array<{
    id: string;
    name: string;
    studentCount: number;
    percentage: number;
  }>;
  sectionStats: Array<{
    id: string;
    name: string;
    studentCount: number;
    percentage: number;
    semesterName: string;
  }>;
  demographicStats: {
    gender: Array<{
      gender: string;
      count: number;
      percentage: number;
    }>;
    entryType: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
    accommodationType: Array<{
      type: string;
      count: number;
      percentage: number;
    }>;
    religion: Array<{
      religion: string;
      count: number;
      percentage: number;
    }>;
    community: Array<{
      community: string;
      count: number;
      percentage: number;
    }>;
    ageGroups: Array<{
      ageGroup: string;
      count: number;
      percentage: number;
    }>;
  };
  geographicStats: Array<{
    state: string;
    district: string;
    count: number;
    percentage: number;
  }>;
  onboardingStats: {
    profileCompletionFunnel: Array<{
      step: string;
      completed: number;
      total: number;
      percentage: number;
    }>;
    missingFields: Array<{
      field: string;
      missingCount: number;
      percentage: number;
    }>;
    timeToComplete: {
      average: number;
      median: number;
      distribution: Array<{
        range: string;
        count: number;
        percentage: number;
      }>;
    };
  };
  statusTransitions: Array<{
    date: string;
    fromStatus: string;
    toStatus: string;
    count: number;
  }>;
}

export interface DashboardFilters {
  dateRange?: {
    from: Date;
    to: Date;
  };
  institutionId?: string;
  departmentId?: string;
  programId?: string;
  status?: string[];
}
