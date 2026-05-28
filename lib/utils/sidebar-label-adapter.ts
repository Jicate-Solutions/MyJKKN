import { InstitutionType } from '@/hooks/use-institution-type';

/**
 * Official label mapping per Phase 1 SPEC-jkkn-schools.md section 5.1
 * Maps singular/plural forms used throughout the UI
 */
const LABEL_MAP: Record<InstitutionType, Record<string, string>> = {
  'school': {
    // Sidebar & page titles
    'Degrees': 'Streams',
    'Degree': 'Stream',
    'Departments': 'Wings',
    'Department': 'Wing',
    'Programs': 'Classes',
    'Program': 'Class',
    'Semesters': 'Terms',
    'Semester': 'Term',
    'Courses': 'Subjects',
    'Course': 'Subject',
    'Sections': 'Sections',
    'Section': 'Section',
    // Help text & descriptions
    'Manage academic degrees': 'Manage academic streams',
    'Manage academic departments': 'Manage academic wings',
    'Manage academic programs': 'Manage academic classes',
    'Manage academic semesters': 'Manage academic terms',
    'Manage academic courses': 'Manage academic subjects',
    // Table headers & filters
    'All Degrees': 'All Streams',
    'All Departments': 'All Wings',
    'All Programs': 'All Classes',
    'All Semesters': 'All Terms',
    'All Courses': 'All Subjects',
    // Column labels & headers
    'program': 'class',
    'degree': 'stream',
    'department': 'wing',
    'semester': 'term',
    'course': 'subject',
    'Program ID': 'Class ID',
    'Program Name': 'Class Name',
    'Degree ID': 'Stream ID',
    'Degree Name': 'Stream Name',
    'Department ID': 'Wing ID',
    'Department Name': 'Wing Name',
    // Search placeholders
    'Search programs...': 'Search classes...',
    'Search degrees...': 'Search streams...',
    'Search departments...': 'Search wings...',
    'Search semesters...': 'Search terms...',
    'Search courses...': 'Search subjects...',
    // Count text
    'degrees': 'streams',
    'programs': 'classes',
    'departments': 'wings',
    'semesters': 'terms',
    'courses': 'subjects'
  },
  'institution': {
    'Degrees': 'Degrees',
    'Degree': 'Degree',
    'Departments': 'Departments',
    'Department': 'Department',
    'Programs': 'Programs',
    'Program': 'Program',
    'Semesters': 'Semesters',
    'Semester': 'Semester',
    'Courses': 'Courses',
    'Course': 'Course',
    'Sections': 'Sections',
    'Section': 'Section',
    'Manage academic degrees': 'Manage academic degrees',
    'Manage academic departments': 'Manage academic departments',
    'Manage academic programs': 'Manage academic programs',
    'Manage academic semesters': 'Manage academic semesters',
    'Manage academic courses': 'Manage academic courses',
    'All Degrees': 'All Degrees',
    'All Departments': 'All Departments',
    'All Programs': 'All Programs',
    'All Semesters': 'All Semesters',
    'All Courses': 'All Courses',
    'program': 'program',
    'degree': 'degree',
    'department': 'department',
    'semester': 'semester',
    'course': 'course'
  },
  'admin_office': {
    'Degrees': 'Degrees',
    'Degree': 'Degree',
    'Departments': 'Departments',
    'Department': 'Department',
    'Programs': 'Programs',
    'Program': 'Program',
    'Semesters': 'Semesters',
    'Semester': 'Semester',
    'Courses': 'Courses',
    'Course': 'Course',
    'Sections': 'Sections',
    'Section': 'Section',
    'Manage academic degrees': 'Manage academic degrees',
    'Manage academic departments': 'Manage academic departments',
    'Manage academic programs': 'Manage academic programs',
    'Manage academic semesters': 'Manage academic semesters',
    'Manage academic courses': 'Manage academic courses',
    'All Degrees': 'All Degrees',
    'All Departments': 'All Departments',
    'All Programs': 'All Programs',
    'All Semesters': 'All Semesters',
    'All Courses': 'All Courses',
    'program': 'program',
    'degree': 'degree',
    'department': 'department',
    'semester': 'semester',
    'course': 'course'
  },
  'company': {
    'Degrees': 'Degrees',
    'Degree': 'Degree',
    'Departments': 'Departments',
    'Department': 'Department',
    'Programs': 'Programs',
    'Program': 'Program',
    'Semesters': 'Semesters',
    'Semester': 'Semester',
    'Courses': 'Courses',
    'Course': 'Course',
    'Sections': 'Sections',
    'Section': 'Section',
    'Manage academic degrees': 'Manage academic degrees',
    'Manage academic departments': 'Manage academic departments',
    'Manage academic programs': 'Manage academic programs',
    'Manage academic semesters': 'Manage academic semesters',
    'Manage academic courses': 'Manage academic courses',
    'All Degrees': 'All Degrees',
    'All Departments': 'All Departments',
    'All Programs': 'All Programs',
    'All Semesters': 'All Semesters',
    'All Courses': 'All Courses',
    'program': 'program',
    'degree': 'degree',
    'department': 'department',
    'semester': 'semester',
    'course': 'course'
  }
};

/**
 * Adapt a single label based on institution type
 * Supports both singular (Program) and plural (Programs) forms
 */
export function adaptLabel(label: string, institutionType: InstitutionType): string {
  return LABEL_MAP[institutionType]?.[label] ?? label;
}

/**
 * Adapt entire menu group labels recursively (for sidebar)
 */
export function adaptMenuLabels(
  pages: any[],
  institutionType: InstitutionType
): any[] {
  return pages.map((group) => ({
    ...group,
    menus: group.menus.map((menu: any) => ({
      ...menu,
      label: adaptLabel(menu.label, institutionType),
      submenus: menu.submenus.map((sub: any) => ({
        ...sub,
        label: adaptLabel(sub.label, institutionType)
      }))
    }))
  }));
}
