/**
 * Institution Kind Label Maps
 *
 * Maps internal MyJKKN hierarchy terms to user-facing labels based on
 * whether the current institution is a college (higher ed) or school (K-12).
 *
 * The underlying data model is the same — only the UI labels change.
 * See docs/SPEC-jkkn-schools.md for the full rationale.
 *
 * Usage:
 *   const { labels } = useInstitutionKind();
 *   <Label>{labels.program}</Label>  // "Program" or "Class"
 */

export type InstitutionKind = 'college' | 'school';

export interface InstitutionKindLabels {
  /** Degree/Stream — hidden in school UI (virtual K-12 degree) */
  degree: string;
  /** Department/Wing — hidden in school UI (virtual Academic dept) */
  department: string;
  /** Program → Class (e.g., "Class 6") */
  program: string;
  /** Semester → Term (e.g., "Term 1 2026-27") */
  semester: string;
  /** Course → Subject (e.g., "Mathematics") */
  course: string;
  /** Section — unchanged */
  section: string;
  /** Student — unchanged */
  student: string;
  /** Faculty → Teacher */
  faculty: string;
  /** Students plural */
  studentPlural: string;
  /** Programs plural */
  programPlural: string;
  /** Semesters plural */
  semesterPlural: string;
  /** Courses plural */
  coursePlural: string;
}

export const INSTITUTION_KIND_LABELS: Record<InstitutionKind, InstitutionKindLabels> = {
  college: {
    degree: 'Degree',
    department: 'Department',
    program: 'Program',
    semester: 'Semester',
    course: 'Course',
    section: 'Section',
    student: 'Student',
    faculty: 'Faculty',
    studentPlural: 'Students',
    programPlural: 'Programs',
    semesterPlural: 'Semesters',
    coursePlural: 'Courses',
  },
  school: {
    degree: 'Stream',
    department: 'Wing',
    program: 'Class',
    semester: 'Term',
    course: 'Subject',
    section: 'Section',
    student: 'Student',
    faculty: 'Teacher',
    studentPlural: 'Students',
    programPlural: 'Classes',
    semesterPlural: 'Terms',
    coursePlural: 'Subjects',
  },
} as const;

/**
 * Sidebar menu items (hrefs) to hide for a given institution kind.
 *
 * These are features that don't apply to schools (or colleges). The filter
 * in `lib/sidebarMenuLink.ts:filterMenuByInstitutionKind()` applies this
 * list AFTER role/permission filtering by `GetRoleBasedPages`.
 *
 * IMPORTANT — route naming:
 *   The folder is `app/(routes)/organizations/...` (plural, with an 's').
 *   Do NOT use `/organization/...` — that path does not exist in MyJKKN.
 *
 * Filter recurses into submenus, so hiding a submenu href keeps its parent.
 */
export const HIDDEN_SIDEBAR_HREFS: Record<InstitutionKind, readonly string[]> = {
  college: [],
  school: [
    // Top-level pages to hide entirely for school users
    '/organizations/degrees',
    // Submenus to hide (parent menu "Courses" → "Subjects" stays visible)
    '/organizations/courses/mappings',
    // NOTE: /organizations/departments is kept visible — schools still group
    // teachers by department (labelled "Wing" in school UI).
  ],
} as const;
