// ============================================
// LEARNER VALIDATION SERVICE
// ============================================
// Created: 2025-01-22
// Updated: 2025-01-22 - Fixed to use admin client for server-side validation
// Updated: 2025-12-27 - Added dropdown value validation
// Purpose: Validation logic for bulk learner operations
// ============================================

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';
import {
  validateDropdownValue,
  GENDER_VALUES,
  RELIGION_VALUES,
  COMMUNITY_VALUES,
  BLOOD_GROUP_VALUES,
  ENTRY_TYPE_VALUES,
  ACCOMMODATION_VALUES,
  FOOD_TYPE_VALUES
} from '@/lib/constants/learner-dropdown-values';

// Create admin client for server-side validation
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Validate bulk upload profile data
 * Requirements for bulk upload:
 * - First name required
 * - College email required (@jkkn.ac.in)
 * - Mobile required (10 digits)
 * - All foreign keys required (institution, department, program, semester, section)
 */
export class LearnerValidationService {
  /**
   * Validate single learner profile data for bulk upload
   */
  static validateBulkUploadProfile(data: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // REQUIRED: First Name
    if (!data.first_name?.trim()) {
      errors.push({
        field: 'first_name',
        message: 'First Name is required'
      });
    }

    // REQUIRED: College Email
    if (!data.college_email?.trim()) {
      errors.push({
        field: 'college_email',
        message: 'College Email is required for bulk upload profiles'
      });
    } else {
      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.college_email)) {
        errors.push({
          field: 'college_email',
          message: 'Invalid email format'
        });
      }
      // Check @jkkn.ac.in domain
      else if (!data.college_email.toLowerCase().endsWith('@jkkn.ac.in')) {
        errors.push({
          field: 'college_email',
          message: 'College Email must end with @jkkn.ac.in'
        });
      }
    }

    // REQUIRED: Mobile (field name is student_mobile in bulk upload)
    const mobileField = data.mobile || data.student_mobile;
    if (!mobileField?.trim()) {
      errors.push({
        field: 'mobile',
        message: 'Mobile number is required'
      });
    } else {
      const mobileDigits = mobileField.replace(/\D/g, '');
      if (!/^\d{10}$/.test(mobileDigits)) {
        errors.push({
          field: 'mobile',
          message: 'Mobile number must be 10 digits'
        });
      }
    }

    // REQUIRED: Institution ID
    if (!data.institution_id) {
      errors.push({
        field: 'institution_id',
        message: 'Institution not found in database. Please check the institution name.'
      });
    }

    // REQUIRED: Department ID
    if (!data.department_id) {
      errors.push({
        field: 'department_id',
        message: 'Department not found in database. Please check the department name.'
      });
    }

    // REQUIRED: Program ID
    if (!data.program_id) {
      errors.push({
        field: 'program_id',
        message: 'Program not found in database. Please check the program name.'
      });
    }

    // REQUIRED: Semester ID
    if (!data.semester_id) {
      errors.push({
        field: 'semester_id',
        message: 'Semester not found in database. Please check the semester name.'
      });
    }

    // REQUIRED: Section ID
    if (!data.section_id) {
      errors.push({
        field: 'section_id',
        message: 'Section not found in database. Please check the section name.'
      });
    }

    // DROPDOWN VALIDATIONS - ensure values are valid
    const dropdownChecks = [
      { value: data.gender, values: GENDER_VALUES, name: 'Gender', required: false },
      { value: data.religion, values: RELIGION_VALUES, name: 'Religion', required: false },
      { value: data.community, values: COMMUNITY_VALUES, name: 'Community', required: false },
      { value: data.blood_group, values: BLOOD_GROUP_VALUES, name: 'Blood Group', required: false },
      { value: data.entry_type, values: ENTRY_TYPE_VALUES, name: 'Entry Type', required: false },
      { value: data.accommodation_type, values: ACCOMMODATION_VALUES, name: 'Accommodation Type', required: false },
      { value: data.food_type, values: FOOD_TYPE_VALUES, name: 'Food Type', required: false },
    ];

    dropdownChecks.forEach(({ value, values, name, required }) => {
      const result = validateDropdownValue(value, values, name, required);
      if (!result.valid && result.error) {
        errors.push({
          field: name.toLowerCase().replace(/ /g, '_'),
          message: result.error
        });
      }
    });

    // Optional validations with warnings
    if (!data.last_name?.trim()) {
      warnings.push('Last Name not provided');
    }

    if (!data.date_of_birth) {
      warnings.push('Date of Birth not provided');
    }

    if (!data.student_email?.trim()) {
      warnings.push('Personal Email not provided');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate bulk edit exited data
   * Requirements for bulk edit:
   * - ID must be provided (for matching)
   * - At least one field to update
   * - Valid email format if provided
   * - Valid mobile format if provided
   */
  static validateBulkEditExited(data: any, existingData?: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    // REQUIRED: ID for matching
    if (!data.id) {
      errors.push({
        field: 'id',
        message: 'ID is required for bulk edit'
      });
    }

    // Check if any updateable fields are provided
    const hasUpdates = Object.keys(data).some(key =>
      key !== 'id' &&
      data[key] !== undefined &&
      data[key] !== null &&
      data[key] !== ''
    );

    if (!hasUpdates) {
      warnings.push('No fields to update');
    }

    // Validate college email if provided
    if (data.college_email?.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.college_email)) {
        errors.push({
          field: 'college_email',
          message: 'Invalid email format'
        });
      } else if (!data.college_email.toLowerCase().endsWith('@jkkn.ac.in')) {
        errors.push({
          field: 'college_email',
          message: 'College Email must end with @jkkn.ac.in'
        });
      }
    }

    // Validate personal email if provided
    if (data.student_email?.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.student_email)) {
        errors.push({
          field: 'student_email',
          message: 'Invalid personal email format'
        });
      }
    }

    // Validate mobile if provided
    if (data.mobile?.trim()) {
      const mobileDigits = data.mobile.replace(/\D/g, '');
      if (!/^\d{10}$/.test(mobileDigits)) {
        errors.push({
          field: 'mobile',
          message: 'Mobile number must be 10 digits'
        });
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check for duplicate emails in a batch
   */
  static findDuplicateEmails(profiles: any[]): Map<string, number[]> {
    const emailMap = new Map<string, number[]>();
    const duplicates = new Map<string, number[]>();

    profiles.forEach((profile, index) => {
      const email = profile.college_email?.toLowerCase();
      if (!email) return;

      if (!emailMap.has(email)) {
        emailMap.set(email, []);
      }
      emailMap.get(email)!.push(index);
    });

    // Find emails that appear more than once
    emailMap.forEach((indices, email) => {
      if (indices.length > 1) {
        duplicates.set(email, indices);
      }
    });

    return duplicates;
  }

  /**
   * Check if email already exists in database
   * Uses admin client for server-side validation
   */
  static async checkEmailExists(email: string): Promise<boolean> {
    // Use admin client for server-side validation
    const { data, error } = await supabaseAdmin
      .from('learners_profiles')
      .select('id')
      .ilike('college_email', email)
      .maybeSingle();

    if (error) {
      console.error('[learner-validation] Error checking email:', error);
      return false;
    }

    return !!data;
  }

  /**
   * Check if learner exists and is in active status
   * Uses admin client for server-side validation
   */
  static async validateActiveLearner(learnerId: string): Promise<{
    exists: boolean;
    isActive: boolean;
    learner?: any;
  }> {
    // Use admin client for server-side validation
    const { data: learner, error } = await supabaseAdmin
      .from('learners_profiles')
      .select('id, lifecycle_status, institution_id')
      .eq('id', learnerId)
      .maybeSingle();

    if (error) {
      console.error('[learner-validation] Error checking learner:', error);
      return { exists: false, isActive: false };
    }

    if (!learner) {
      return { exists: false, isActive: false };
    }

    return {
      exists: true,
      isActive: learner.lifecycle_status === 'active',
      learner
    };
  }

  /**
   * Validate foreign key exists
   * Uses admin client for server-side validation
   */
  static async validateForeignKey(
    table: string,
    id: string
  ): Promise<boolean> {
    // Use admin client for server-side validation
    const { data, error } = await supabaseAdmin
      .from(table)
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`[learner-validation] Error validating ${table}:`, error);
      return false;
    }

    return !!data;
  }
}
