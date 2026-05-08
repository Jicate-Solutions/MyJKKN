// types/bos-courses.ts
//
// Mirrors the COE `courses` and `course_mapping` tables.
// Only the columns we surface in the UI are typed — extra COE columns are passed through.

export type CoursePart =
  | 'Part I' | 'Part II' | 'Part III' | 'Part IV' | 'Part V';

export type CourseCategory =
  | 'Theory' | 'Practical' | 'Project' | 'Non Academic'
  | 'Theory + Practical' | 'Theory + Project'
  | 'Field Work' | 'Community Service' | 'Group Project';

export type CourseType =
  | 'Ability Enhancement' | 'Additional Credit course' | 'Advance learner course'
  | 'Audit Course' | 'Bridge course' | 'Core Practical' | 'Core'
  | 'Discipline Specific elective Practical' | 'Discipline Specific elective'
  | 'Elective Practical' | 'Elective' | 'English'
  | 'Extra Disciplinary Elective Practical' | 'Extra Disciplinary'
  | 'Foundation Course' | 'Generic Elective Practical' | 'Generic Elective'
  | 'Internship' | 'Language' | 'Naanmuthalvan' | 'Non Academic'
  | 'Non Major Elective Practical' | 'Non Major Elective'
  | 'Practical' | 'Project'
  | 'Skill Enhancement Practical' | 'Skill Enhancement';

export type EvaluationType = 'CIA' | 'ESE' | 'CIA + ESE';
export type ResultType = 'Mark' | 'Status' | 'comment' | 'credit';
export type CourseGroup =
  | 'General' | 'Elective - I' | 'Elective - II' | 'Elective - III'
  | 'Elective - IV' | 'Elective - V' | 'Elective - VI';

export interface BosCourseMaster {
  id: string;
  institutions_id: string | null;
  institution_code: string;
  regulation_id: string | null;
  regulation_code: string;
  course_code: string;
  course_name: string;
  display_code: string;
  course_category: CourseCategory;
  course_type: CourseType | null;
  course_part_master: CoursePart | null;
  credit: number;
  theory_credit: number | null;
  practical_credit: number | null;
  exam_duration: number;
  evaluation_type: EvaluationType;
  result_type: ResultType;
  theory_hours: number;
  practical_hours: number;
  class_hours: number;
  internal_max_mark: number;
  external_max_mark: number;
  total_max_mark: number;
  internal_pass_mark: number;
  external_pass_mark: number;
  total_pass_mark: number;
  status: boolean;
  course_status: 'Active' | 'Locked' | string;   // Lock state. 'Locked' hides edit/delete in UI + 423 on server.
  created_at: string;
  updated_at: string;
}

/** Reusable helper — single source of truth for "can this row be mutated?". */
export function isLocked(row: { course_status?: string | null } | undefined | null): boolean {
  return row?.course_status === 'Locked';
}

/** The 13-field manual form (per design Section 2). */
export interface BosCourseFormData {
  course_code: string;
  course_name: string;
  course_category: CourseCategory;
  course_part_master: CoursePart;
  course_type: CourseType;
  exam_duration: number;
  credit: number;
  theory_hours: number;
  practical_hours: number;
  internal_max_mark: number;
  external_max_mark: number;
  total_max_mark: number;
}

export interface BosCourseMapping {
  id: string;
  institutions_id: string;
  program_id: string | null;
  course_id: string;
  batch_id: string | null;
  institution_code: string;
  program_code: string;
  course_code: string;
  batch_code: string | null;
  course_group: CourseGroup | null;
  semester_code: string | null;
  course_order: number | null;
  regulation_code: string | null;
  is_active: boolean;
  mapping_status: 'Active' | 'Locked' | string;   // Lock state for the mapping row itself.
  created_at: string;
}

/** Twin of isLocked() for mapping rows. */
export function isMappingLocked(row: { mapping_status?: string | null } | undefined | null): boolean {
  return row?.mapping_status === 'Locked';
}

/** Response shape when ?details=true on /course-mapping list. */
export interface BosCourseMappingDetailed extends BosCourseMapping {
  course: Pick<
    BosCourseMaster,
    | 'course_code' | 'course_name' | 'course_category' | 'course_type'
    | 'course_part_master' | 'credit' | 'exam_duration'
    | 'theory_hours' | 'practical_hours'
    | 'internal_max_mark' | 'external_max_mark' | 'total_max_mark'
  >;
}

export interface BosCourseListResponse {
  data: BosCourseMaster[];
  metadata: { total: number; limit: number; offset: number };
}

export interface BosBulkImportResponse {
  inserted: number;
  updated: number;
  total: number;
  errors: { row: number; course_code?: string; message: string }[];
}
