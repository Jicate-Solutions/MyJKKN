export interface Admission {
  id: string;
  application_id?: string; // Auto-generated unique ID like JKKN-2024-0001
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
  aadhar_number?: string;
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
  neet_score?: string;
  counseling_applied: boolean;
  counseling_number?: string;
  first_graduate: boolean;
  quota?: string;
  category?: string;
  institution_id?: string; // reference to institution ID
  degree_id?: string; // reference to degree
  department_id?: string; // reference to department
  program_id?: string; // reference to program
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
  food_type?: string;
  bus_required?: boolean;
  bus_route?: string;
  bus_pickup_location?: string;
  reference_type?: string;
  reference_name?: string;
  reference_contact?: string;
  status: string; // pending, approved, rejected, waitlisted, enrolled
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
  course?: {
    id: string;
    course_name: string;
  };
  student?: {
    id: string;
  } | null;
}

export interface CreateAdmissionDto
  extends Omit<
    Admission,
    'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
  > {
  // Additional properties specific to creation if needed
}

export interface UpdateAdmissionDto
  extends Partial<
    Omit<
      Admission,
      'id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'
    >
  > {
  // Additional properties specific to update if needed
}

export interface AdmissionFilters {
  search?: string;
  name?: string;
  status?: string;
  institution?: string; // field_of_study
  course?: string; // year_and_branch
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface AdmissionListResponse {
  data: Admission[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}
