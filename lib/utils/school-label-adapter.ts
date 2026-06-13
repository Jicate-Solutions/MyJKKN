import { InstitutionType } from '@/hooks/use-institution-type';

/**
 * Official label mapping per Phase 1 SPEC-jkkn-schools.md section 5.1
 * Maps singular/plural forms used throughout the UI.
 *
 * Only `school` is maintained here. Every other entity_type
 * ('institution', 'admin_office', 'company') has no block, so adaptLabel()
 * falls through to `?? label` and keeps the default English term. To rename a
 * word for schools, add the exact string (matching case + plural) below.
 */
const LABEL_MAP: Partial<Record<InstitutionType, Record<string, string>>> = {
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
    'Course Mappings': 'Subject Mappings',
    'Sections': 'Sections',
    'Section': 'Section',
    // Timetable PDF metadata labels (schools use different role wording)
    'Class Co-ordinator': 'Class In-Charge',
    'Class Chairman': 'Academic Co-ordinator',
    // Help text & descriptions
    'Manage academic degrees': 'Manage academic streams',
    'Manage academic departments': 'Manage academic wings',
    'Manage departments and their details' : 'Manage Wings and their details',
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
    'Degree Details': 'Stream Details',
    'Edit Degree': 'Edit Stream',
    'New Degree': 'New Stream',
    'Add a new degree': 'Add a new stream',
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
