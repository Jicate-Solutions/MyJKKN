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
  | 'Skill Enhancement Practical' | 'Skill Enhancement'
  // AICTE / Anna University engineering categories — keep in sync with
  // COURSE_TYPE_VALUES in lib/services/bos/courses-schemas.ts.
  | 'Engineering Science Courses' | 'Professional Core Courses' | 'Programme Elective'
  | 'Open Elective Courses' | 'Employability Enhancement Courses';

/** Roman numerals I..XX (1..20). Pairs with CourseType in COE to form
 *  course_type_code (e.g., "Core" + "I" => "Core-I"). */
export type CourseLevel =
  | 'I' | 'II' | 'III' | 'IV' | 'V'
  | 'VI' | 'VII' | 'VIII' | 'IX' | 'X'
  | 'XI' | 'XII' | 'XIII' | 'XIV' | 'XV'
  | 'XVI' | 'XVII' | 'XVIII' | 'XIX' | 'XX';

export type EvaluationType = 'CIA' | 'ESE' | 'CIA + ESE';
export type ResultType = 'Mark' | 'Status' | 'comment' | 'credit';
// COE `course_mapping.course_group` — constrained by
// course_mapping_course_group_check to COURSE_GROUP_VALUES
// ('General', 'Elective - I', …). Do not send bare numbers here;
// the numeric banding key is `group_order`.
export type CourseGroup =
  | 'General'
  | 'Elective - I' | 'Elective - II' | 'Elective - III'
  | 'Elective - IV' | 'Elective - V' | 'Elective - VI';

export interface BosCourseMaster {
  id: string;
  institutions_id: string | null;
  institution_code: string;
  regulation_id: string | null;
  regulation_code: string;
  board_id: string | null;          // Owning Board of Studies (UUID)
  board_code?: string | null;       // Convenience: COE may include in joined responses
  course_code: string;
  course_name: string;
  course_title?: string;     // COE alias for course_name — appears in single-record GET responses
  credits?: number;          // COE alias for credit — same data, different key name
  display_code: string;
  course_category: CourseCategory;
  course_type: CourseType | null;
  course_level: CourseLevel | null;   // Roman numeral I..XX
  course_type_code?: string | null;   // COE-computed: `${course_type}-${course_level}` (e.g., "Core-I")
  course_part_master: CoursePart | null;
  credit: number;
  theory_credit: number | null;
  practical_credit: number | null;
  exam_duration: number;
  evaluation_type: EvaluationType;
  result_type: ResultType;
  theory_hours: number;
  tutorial_hours: number | null;   // optional L-T-P tutorial component; defaults to 0
  practical_hours: number;
  class_hours: number;
  // *_max_mark is the QUESTION-PAPER ceiling (the ESE may be written for 100).
  // *_converted_mark is the WEIGHTAGE that component carries in total_max_mark
  // (that 100-mark paper may be scaled down to 50). They're equal for most
  // courses and diverge on Theory + Practical ones. The BoS Max Marks form
  // edits the CONVERTED pair; the max pair stays COE-owned. COE's mapper always
  // emits the converted keys, defaulting a NULL column to 0 — so treat 0 as
  // "not set" and fall back to *_max_mark rather than trusting it as a value.
  internal_max_mark: number;
  external_max_mark: number;
  internal_converted_mark?: number | null;
  external_converted_mark?: number | null;
  total_max_mark: number;
  internal_pass_mark: number;
  external_pass_mark: number;
  total_pass_mark: number;
  is_active: boolean;       // COE field — true = course is active
  status?: boolean;         // kept for back-compat; prefer is_active
  course_status?: 'Active' | 'Locked' | string;   // COE alias: singular
  courses_status?: 'Active' | 'Locked' | string;  // COE DB column: plural — API returns this
  created_at: string;
  updated_at: string;
}

/** Reusable helper — single source of truth for "can this row be mutated?".
 *  COE returns the field as courses_status (plural); guard both spellings.
 */
export function isLocked(row: { course_status?: string | null; courses_status?: string | null } | undefined | null): boolean {
  const v = row?.courses_status ?? row?.course_status;
  return v?.toLowerCase() === 'locked';
}

/** The 14-field manual form (Section 2 + optional course_level). */
export interface BosCourseFormData {
  course_code: string;
  course_name: string;
  board_id: string;
  course_category: CourseCategory;
  course_part_master: CoursePart;
  course_type: CourseType;
  course_level?: CourseLevel;          // optional — see Zod schema for rationale
  exam_duration: number;
  credit: number;
  theory_hours: number;
  tutorial_hours?: number;   // optional — defaults to 0 when omitted
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
  // COE `course_mapping.group_order` — usually equals the course order number;
  // elective options share one group_order so they band + count once in totals.
  // Optional: older COE deployments / optimistic rows may omit it.
  group_order?: number | null;
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
    | 'course_type_code'
    | 'course_part_master' | 'credit' | 'exam_duration'
    | 'theory_hours' | 'tutorial_hours' | 'practical_hours'
    | 'internal_max_mark' | 'external_max_mark' | 'total_max_mark'
    // Optional on the master, so it stays optional here — the semester table
    // reads it to grey out and un-delete locked rows.
    | 'course_status'
  >;
}

export interface BosCourseListResponse {
  data: BosCourseMaster[];
  metadata: { total: number; limit: number; offset: number };
}

/** COE master row from GET /api/v1/course-info — single source of truth for course_type. */
export interface CoeCourseInfo {
  id: string;
  course_type: string;
  display_code: string;
  description: string | null;
  sort_order: number;
  status: boolean;
  created_at: string;
  updated_at: string;
}

export interface CoeCourseInfoListResponse {
  data: CoeCourseInfo[];
  total: number;
}

export interface BosBulkImportResponse {
  inserted: number;
  updated: number;
  total: number;
  errors: { row: number; course_code?: string; message: string }[];
}
