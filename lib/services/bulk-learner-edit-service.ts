// ============================================
// BULK LEARNER EDIT SERVICE
// ============================================
// Created: 2025-01-22
// Updated: 2025-01-22 - Added degree and section filter support
// Purpose: Handle bulk edit of active learners' incomplete data
// Filters: Institution → Degree → Department → Program → Semester → Section
// ============================================

import { createClient } from '@supabase/supabase-js';
import { LearnerValidationService, ValidationResult } from './learner-validation-service';

// Create admin client for database operations
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

export interface BulkEditRow {
  rowNumber: number;
  data: any;
  validation: ValidationResult;
}

export interface BulkEditResult {
  success: boolean;
  total_rows: number;
  updated: number;
  skipped: number;
  failed: number;
  updated_learners: Array<{
    id: string;
    name: string;
    fields_updated: string[];
  }>;
  errors: Array<{
    row: number;
    id?: string;
    error: string;
  }>;
}

/**
 * Protected fields that cannot be updated via bulk edit
 */
const PROTECTED_FIELDS = new Set([
  'id',
  'institution_id',
  'lifecycle_status',
  'created_at',
  'created_by',
  'original_admission_id',
  'original_student_id',
  'migration_source',
  'migrated_at'
]);

interface FieldChange {
  field: string;
  fieldLabel: string;
  oldValue: any;
  newValue: any;
}

interface PreviewResult {
  exists: boolean;
  isActive: boolean;
  hasAccess: boolean;
  learnerName?: string;
  changes: FieldChange[];
}

/**
 * Field labels for display
 */
const FIELD_LABELS: Record<string, string> = {
  first_name: 'First Name',
  last_name: 'Last Name',
  date_of_birth: 'Date of Birth',
  gender: 'Gender',
  religion: 'Religion',
  community: 'Community',
  caste: 'Caste',
  aadhar_number: 'Aadhar Number',
  blood_group: 'Blood Group',
  admission_year: 'Admission Year',
  father_name: 'Father Name',
  father_occupation: 'Father Occupation',
  father_mobile: 'Father Mobile',
  mother_name: 'Mother Name',
  mother_occupation: 'Mother Occupation',
  mother_mobile: 'Mother Mobile',
  annual_income: 'Annual Income',
  degree_id: 'Degree ID',
  department_id: 'Department ID',
  program_id: 'Program ID',
  semester_id: 'Semester ID',
  section_id: 'Section ID',
  academic_year_id: 'Academic Year ID',
  regulation_id: 'Regulation ID',
  batch_id: 'Batch ID',
  mobile: 'Student Mobile',
  college_email: 'College Email',
  student_email: 'Personal Email',
  permanent_address_street: 'Address Street',
  permanent_address_taluk: 'Address Taluk',
  permanent_address_district: 'Address District',
  permanent_address_pin_code: 'Address Pin Code',
  permanent_address_state: 'Address State',
  entry_type: 'Entry Type',
  scholarship_type: 'Scholarship Type',
  last_school: 'Last School',
  board_of_study: 'Board of Study',
  roll_number: 'Roll Number',
  register_number: 'Register Number',
  quota: 'Quota',
  category: 'Category',
  student_photo_url: 'Photo URL',
  accommodation_type: 'Accommodation Type',
  hostel_type: 'Hostel Type',
  food_type: 'Food Type',
  bus_required: 'Bus Required',
  bus_route: 'Bus Route',
  bus_pickup_location: 'Bus Pickup Location',
  reference_type: 'Reference Type',
  reference_name: 'Reference Name',
  reference_contact: 'Reference Contact',
  medical_cutoff_marks: 'Medical Cutoff Marks',
  engineering_cutoff_marks: 'Engineering Cutoff Marks',
  neet_roll_number: 'NEET Roll Number',
  neet_score: 'NEET Score',
  counseling_applied: 'Counseling Applied',
  counseling_number: 'Counseling Number'
};

/**
 * Bulk Edit Learner Service
 */
export class BulkLearnerEditService {
  /**
   * Preview changes for a single learner
   * Compares uploaded data with existing data and returns field-by-field changes
   */
  static async previewChanges(
    learnerId: string,
    uploadedData: any,
    userInstitutionId?: string,
    isSuperAdmin: boolean = false
  ): Promise<PreviewResult> {
    // Validate learner exists and is active
    const learnerCheck = await LearnerValidationService.validateActiveLearner(learnerId);

    if (!learnerCheck.exists) {
      return {
        exists: false,
        isActive: false,
        hasAccess: false,
        changes: []
      };
    }

    if (!learnerCheck.isActive) {
      return {
        exists: true,
        isActive: false,
        hasAccess: false,
        learnerName: 'Unknown',
        changes: []
      };
    }

    // Check institution access
    const hasAccess = isSuperAdmin || !userInstitutionId ||
      learnerCheck.learner.institution_id === userInstitutionId;

    if (!hasAccess) {
      return {
        exists: true,
        isActive: true,
        hasAccess: false,
        learnerName: 'Unknown',
        changes: []
      };
    }

    // Fetch full learner data
    const { data: existingLearner, error } = await supabaseAdmin
      .from('learners_profiles')
      .select('*')
      .eq('id', learnerId)
      .single();

    if (error || !existingLearner) {
      return {
        exists: true,
        isActive: true,
        hasAccess: true,
        learnerName: 'Unknown',
        changes: []
      };
    }

    const learnerName = `${existingLearner.first_name} ${existingLearner.last_name || ''}`.trim();

    // Compare fields and detect changes
    const changes: FieldChange[] = [];

    Object.entries(uploadedData).forEach(([key, newValue]) => {
      // Skip ID and protected fields
      if (key === 'id' || PROTECTED_FIELDS.has(key)) {
        return;
      }

      // Skip if no new value provided
      if (newValue === undefined || newValue === null || newValue === '') {
        return;
      }

      const oldValue = existingLearner[key];

      // Compare values (handle different types)
      let isDifferent = false;

      if (typeof newValue === 'object' && typeof oldValue === 'object') {
        // For nested objects (tenth_marks, twelfth_marks)
        isDifferent = JSON.stringify(newValue) !== JSON.stringify(oldValue);
      } else {
        // Convert to strings for comparison
        const oldStr = oldValue === null || oldValue === undefined ? '' : String(oldValue);
        const newStr = String(newValue);
        isDifferent = oldStr !== newStr;
      }

      if (isDifferent) {
        changes.push({
          field: key,
          fieldLabel: FIELD_LABELS[key] || key,
          oldValue: oldValue === null || oldValue === undefined ? '(empty)' : oldValue,
          newValue: newValue
        });
      }
    });

    return {
      exists: true,
      isActive: true,
      hasAccess: true,
      learnerName,
      changes
    };
  }

  /**
   * Process bulk edit for exited learners
   * Only updates non-empty fields, preserves existing values for empty cells
   */
  static async processBulkEdit(
    rows: BulkEditRow[],
    userInstitutionId?: string,
    isSuperAdmin: boolean = false
  ): Promise<BulkEditResult> {
    const result: BulkEditResult = {
      success: true,
      total_rows: rows.length,
      updated: 0,
      skipped: 0,
      failed: 0,
      updated_learners: [],
      errors: []
    };

    for (const row of rows) {
      try {
        // Skip rows with validation errors
        if (!row.validation.isValid) {
          result.errors.push({
            row: row.rowNumber,
            id: row.data.id,
            error: row.validation.errors.map(e => e.message).join(', ')
          });
          result.failed++;
          continue;
        }

        const learnerId = row.data.id;

        // Validate learner exists and is active
        const learnerCheck = await LearnerValidationService.validateActiveLearner(learnerId);

        if (!learnerCheck.exists) {
          result.errors.push({
            row: row.rowNumber,
            id: learnerId,
            error: 'Learner not found'
          });
          result.failed++;
          continue;
        }

        if (!learnerCheck.isActive) {
          result.errors.push({
            row: row.rowNumber,
            id: learnerId,
            error: 'Learner is not in active status'
          });
          result.failed++;
          continue;
        }

        // Check institution access (if not super admin)
        if (!isSuperAdmin && userInstitutionId) {
          if (learnerCheck.learner.institution_id !== userInstitutionId) {
            result.errors.push({
              row: row.rowNumber,
              id: learnerId,
              error: 'No access to this learner (different institution)'
            });
            result.failed++;
            continue;
          }
        }

        // Build partial update object (only non-empty fields)
        const updateData: any = {};
        const fieldsUpdated: string[] = [];

        Object.entries(row.data).forEach(([key, value]) => {
          // Skip ID and protected fields
          if (key === 'id' || PROTECTED_FIELDS.has(key)) {
            return;
          }

          // Only update if value is provided (not empty)
          if (value !== undefined && value !== null && value !== '') {
            updateData[key] = value;
            fieldsUpdated.push(key);
          }
        });

        // Skip if no fields to update
        if (Object.keys(updateData).length === 0) {
          result.skipped++;
          continue;
        }

        // Update timestamp
        updateData.updated_at = new Date().toISOString();

        // Perform update
        const { data: updatedLearner, error: updateError } = await supabaseAdmin
          .from('learners_profiles')
          .update(updateData)
          .eq('id', learnerId)
          .eq('lifecycle_status', 'active') // Extra safety check
          .select('id, first_name, last_name')
          .single();

        if (updateError) {
          result.errors.push({
            row: row.rowNumber,
            id: learnerId,
            error: `Update failed: ${updateError.message}`
          });
          result.failed++;
          continue;
        }

        result.updated++;
        result.updated_learners.push({
          id: updatedLearner.id,
          name: `${updatedLearner.first_name} ${updatedLearner.last_name || ''}`.trim(),
          fields_updated: fieldsUpdated
        });

      } catch (error) {
        console.error('[bulk-edit] Error processing row:', error);
        result.errors.push({
          row: row.rowNumber,
          id: row.data.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        result.failed++;
      }
    }

    result.success = result.failed === 0;
    return result;
  }

  /**
   * Export active learners for bulk edit
   * Returns current data with empty/missing fields highlighted
   * Uses pagination to fetch ALL records (no limit)
   */
  static async exportActiveForEdit(
    institutionId?: string,
    includeComplete: boolean = false,
    degreeId?: string,
    departmentId?: string,
    programId?: string,
    semesterId?: string,
    sectionId?: string
  ): Promise<any[]> {
    console.log('[bulk-edit] Export parameters:', {
      institutionId,
      includeComplete,
      degreeId,
      departmentId,
      programId,
      semesterId,
      sectionId
    });

    // Build base query
    const buildQuery = () => {
      let query = supabaseAdmin
        .from('learners_profiles')
        .select(`
          *,
          institution:institutions(id, name),
          degree:degrees(id, degree_name),
          department:departments(id, department_name),
          program:programs(id, program_name),
          semester:semesters(id, semester_name),
          section:sections(id, section_name),
          academic_year:academic_years(id, academic_year_name),
          regulation:regulations(id, regulation_year, regulation_code),
          batch:batches(id, batch_name)
        `)
        .eq('lifecycle_status', 'active');

      // Filter by institution if specified
      if (institutionId) {
        query = query.eq('institution_id', institutionId);
      }

      // Filter by degree if specified
      if (degreeId) {
        query = query.eq('degree_id', degreeId);
      }

      // Filter by department if specified
      if (departmentId) {
        query = query.eq('department_id', departmentId);
      }

      // Filter by program if specified
      if (programId) {
        query = query.eq('program_id', programId);
      }

      // Filter by semester if specified
      if (semesterId) {
        query = query.eq('semester_id', semesterId);
      }

      // Filter by section if specified
      if (sectionId) {
        query = query.eq('section_id', sectionId);
      }

      // Filter by profile completeness if requested
      if (!includeComplete) {
        query = query.eq('is_profile_complete', false);
      }

      return query;
    };

    // Fetch ALL records using pagination (no limit)
    const BATCH_SIZE = 1000;
    let allLearners: any[] = [];
    let offset = 0;
    let hasMore = true;

    console.log('[bulk-edit] Starting paginated fetch with batch size:', BATCH_SIZE);

    while (hasMore) {
      const query = buildQuery()
        .range(offset, offset + BATCH_SIZE - 1)
        .order('created_at', { ascending: false });

      const { data: batch, error } = await query;

      if (error) {
        console.error('[bulk-edit] Error fetching learners batch:', error);
        throw new Error(`Failed to fetch learners: ${error.message}`);
      }

      if (batch && batch.length > 0) {
        allLearners = allLearners.concat(batch);
        console.log(`[bulk-edit] Fetched batch: ${batch.length} records (total so far: ${allLearners.length})`);

        // Check if there are more records
        if (batch.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += BATCH_SIZE;
        }
      } else {
        hasMore = false;
      }
    }

    console.log('[bulk-edit] Export complete. Total learners fetched:', allLearners.length);

    return allLearners;
  }
}
