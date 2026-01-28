// ============================================
// PROFILE COMPLETION UTILITY
// ============================================
// Created: 2025-01-27
// Purpose: Calculate profile completion for student users
// Based on fields editable by students through change request system
// ============================================

import { LearnerProfile } from '@/types/learner-profile';

/**
 * Field metadata for form sections
 */
interface FieldMetadata {
  field: string;
  label: string;
  section: string;
  isNested?: boolean;
  nestedFields?: string[];
  isConditional?: boolean;
  condition?: (learner: LearnerProfile) => boolean;
}

/**
 * Required fields mapped to form sections
 * These are the fields students can edit through the EnquiryForm
 */
const FIELD_METADATA: FieldMetadata[] = [
  // Basic Details Tab
  { field: 'roll_number', label: 'Roll Number', section: 'Basic Details' },
  { field: 'register_number', label: 'Register Number', section: 'Basic Details' },
  { field: 'first_name', label: 'First Name', section: 'Basic Details' },
  { field: 'last_name', label: 'Last Name', section: 'Basic Details' },
  { field: 'date_of_birth', label: 'Date of Birth', section: 'Basic Details' },
  { field: 'gender', label: 'Gender', section: 'Basic Details' },
  { field: 'religion', label: 'Religion', section: 'Basic Details' },
  { field: 'community', label: 'Community', section: 'Basic Details' },
  { field: 'caste', label: 'Caste', section: 'Basic Details' },
  { field: 'father_name', label: "Father's Name", section: 'Basic Details' },
  { field: 'mother_name', label: "Mother's Name", section: 'Basic Details' },
  { field: 'blood_group', label: 'Blood Group', section: 'Basic Details' },

  // Academic Information Tab
  { field: 'last_school', label: 'Last School', section: 'Academic Information' },
  { field: 'board_of_study', label: 'Board of Study', section: 'Academic Information' },
  {
    field: 'tenth_marks',
    label: '10th Marks',
    section: 'Academic Information',
    isNested: true,
    nestedFields: ['max_marks', 'obtained_marks', 'percentage'],
  },
  {
    field: 'twelfth_marks',
    label: '12th Marks',
    section: 'Academic Information',
    isNested: true,
    nestedFields: ['group', 'max_marks', 'obtained_marks', 'percentage'],
  },

  // Contact Details Tab
  { field: 'student_mobile', label: 'Student Mobile', section: 'Contact Details' },
  { field: 'student_email', label: 'Student Email', section: 'Contact Details' },
  { field: 'permanent_address_street', label: 'Address Street', section: 'Contact Details' },
  { field: 'permanent_address_district', label: 'District', section: 'Contact Details' },
  { field: 'permanent_address_pin_code', label: 'PIN Code', section: 'Contact Details' },
  { field: 'permanent_address_state', label: 'State', section: 'Contact Details' },

  // Accommodation Preferences Tab
  { field: 'accommodation_type', label: 'Accommodation Type', section: 'Accommodation Preferences' },
  {
    field: 'hostel_type',
    label: 'Hostel Type',
    section: 'Accommodation Preferences',
    isConditional: true,
    condition: (learner) => learner.accommodation_type === 'Hostel',
  },
  {
    field: 'food_type',
    label: 'Food Type',
    section: 'Accommodation Preferences',
    isConditional: true,
    condition: (learner) => learner.accommodation_type === 'Hostel',
  },
];

/**
 * Check if a field value is complete
 */
function isFieldComplete(value: any): boolean {
  // Handle null/undefined/empty string
  if (value === null || value === undefined || value === '') {
    return false;
  }

  // Handle nested objects (tenth_marks, twelfth_marks)
  if (typeof value === 'object' && !Array.isArray(value)) {
    // Check if object has any meaningful values
    const values = Object.values(value);
    if (values.length === 0) return false;

    // All required sub-fields must be filled
    return values.every((v) => v !== null && v !== undefined && v !== '');
  }

  return true;
}

/**
 * Get required fields based on conditional logic
 */
function getRequiredFields(learner: LearnerProfile): FieldMetadata[] {
  return FIELD_METADATA.filter((field) => {
    // If field is conditional, check condition
    if (field.isConditional && field.condition) {
      return field.condition(learner);
    }
    return true;
  });
}

/**
 * Section completion data
 */
interface SectionCompletion {
  name: string;
  completed: number;
  total: number;
  percentage: number;
}

/**
 * Missing field data
 */
interface MissingField {
  field: string;
  label: string;
  section: string;
}

/**
 * Profile completion result
 */
export interface ProfileCompletionResult {
  overallPercentage: number;
  totalRequired: number;
  completed: number;
  sections: SectionCompletion[];
  missingFields: MissingField[];
}

/**
 * Calculate profile completion for a learner
 */
export function calculateProfileCompletion(learner: LearnerProfile): ProfileCompletionResult {
  const requiredFields = getRequiredFields(learner);
  const sections = new Map<string, { completed: number; total: number }>();
  const missingFields: MissingField[] = [];

  let totalCompleted = 0;

  // Initialize section counters
  const sectionNames = [...new Set(requiredFields.map((f) => f.section))];
  sectionNames.forEach((section) => {
    sections.set(section, { completed: 0, total: 0 });
  });

  // Check each required field
  requiredFields.forEach((fieldMeta) => {
    const section = sections.get(fieldMeta.section)!;
    section.total++;

    const value = (learner as any)[fieldMeta.field];
    const isComplete = isFieldComplete(value);

    if (isComplete) {
      section.completed++;
      totalCompleted++;
    } else {
      missingFields.push({
        field: fieldMeta.field,
        label: fieldMeta.label,
        section: fieldMeta.section,
      });
    }
  });

  // Calculate section percentages
  const sectionCompletions: SectionCompletion[] = Array.from(sections.entries()).map(
    ([name, data]) => ({
      name,
      completed: data.completed,
      total: data.total,
      percentage: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    })
  );

  // Calculate overall percentage
  const overallPercentage =
    requiredFields.length > 0 ? Math.round((totalCompleted / requiredFields.length) * 100) : 0;

  return {
    overallPercentage,
    totalRequired: requiredFields.length,
    completed: totalCompleted,
    sections: sectionCompletions,
    missingFields,
  };
}

/**
 * Get completion status color variant
 */
export function getCompletionVariant(percentage: number): 'destructive' | 'default' | 'success' {
  if (percentage >= 80) return 'success';
  if (percentage >= 51) return 'default';
  return 'destructive';
}

/**
 * Get completion status text
 */
export function getCompletionStatusText(percentage: number): string {
  if (percentage === 100) return 'Complete';
  if (percentage >= 80) return 'Almost Complete';
  if (percentage >= 51) return 'In Progress';
  return 'Incomplete';
}
