// types/school-master.ts
// School Master — board+district-wise schools lookup powering the Last School
// dropdown on learner profiles / enquiries / public student form.

// Type alias (not interface) on purpose: the shared DataTable constrains rows
// to Record<string, …> (ExportableData), which interfaces don't satisfy.
export type SchoolMaster = {
  id: string;
  school_name: string;
  board: string; // canonical lowercase, matches BOARD_OF_STUDY_OPTIONS values (e.g. 'state_board')
  district: string;
  state: string;
  pincode: string | null;
  udise_code: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export interface SchoolMasterDistrict {
  district: string;
  school_count: number;
}

export interface SchoolMasterFilters {
  board?: string;
  district?: string;
  search?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CreateSchoolMasterInput {
  school_name: string;
  board?: string;
  district: string;
  state?: string;
  pincode?: string | null;
  udise_code?: string | null;
  is_active?: boolean;
}

export type UpdateSchoolMasterInput = Partial<CreateSchoolMasterInput>;

export interface SchoolMasterImportRow {
  district: string;
  school_name: string;
  pincode?: string | null;
  udise_code?: string | null;
}

export interface SchoolMasterImportResult {
  inserted: number;
  skippedDuplicates: number;
  errors: { row: number; message: string }[];
}
