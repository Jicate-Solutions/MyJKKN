// ============================================
// BULK LEARNER UPLOAD SERVICE
// ============================================
// Created: 2025-01-22
// Purpose: Handle bulk upload of new learner profiles with auto user creation
// ============================================

import { createClient } from '@supabase/supabase-js';
import { LearnerValidationService, ValidationResult } from './learner-validation-service';
import type { LearnerProfile } from '@/types/learner-profile';

// Create admin client for user management
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

/**
 * Generate temporary password for new users
 */
function generateTemporaryPassword(length = 12): string {
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';
  let password = '';
  for (let i = 0, n = charset.length; i < length; ++i) {
    password += charset.charAt(Math.floor(Math.random() * n));
  }
  // Ensure password has at least one digit
  if (!/\d/.test(password)) {
    password += Math.floor(Math.random() * 10);
  }
  // Ensure password has at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    password += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return password.slice(0, length);
}

/**
 * Check if profile is complete
 * Profile is complete if all required fields are filled
 */
function isProfileComplete(profile: Partial<LearnerProfile>): boolean {
  return !!(
    profile.first_name &&
    profile.college_email &&
    profile.mobile &&
    profile.institution_id &&
    profile.department_id &&
    profile.program_id &&
    profile.semester_id &&
    profile.section_id
  );
}

export interface BulkUploadRow {
  rowNumber: number;
  data: Partial<LearnerProfile>;
  validation: ValidationResult;
}

export interface BulkUploadResult {
  success: boolean;
  upload_summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    learners_created: number;
    learners_failed: number;
  };
  user_creation_summary: {
    profiles_complete: number;
    existing_users: number;
    new_users_created: number;
    user_creation_failed: number;
  };
  created_users: Array<{
    name: string;
    email: string;
    temp_password: string;
  }>;
  errors: Array<{
    row: number;
    email?: string;
    error: string;
  }>;
}

/**
 * Bulk Upload Learner Profiles Service
 */
export class BulkLearnerUploadService {
  /**
   * Process bulk upload
   * Creates new learners with lifecycle_status='active' and auto-creates user accounts
   */
  static async processBulkUpload(
    rows: BulkUploadRow[]
  ): Promise<BulkUploadResult> {
    const result: BulkUploadResult = {
      success: true,
      upload_summary: {
        total_rows: rows.length,
        valid_rows: 0,
        invalid_rows: 0,
        learners_created: 0,
        learners_failed: 0
      },
      user_creation_summary: {
        profiles_complete: 0,
        existing_users: 0,
        new_users_created: 0,
        user_creation_failed: 0
      },
      created_users: [],
      errors: []
    };

    // Validate all rows first
    const validRows = rows.filter(row => row.validation.isValid);
    const invalidRows = rows.filter(row => !row.validation.isValid);

    result.upload_summary.valid_rows = validRows.length;
    result.upload_summary.invalid_rows = invalidRows.length;

    // Add invalid row errors
    invalidRows.forEach(row => {
      result.errors.push({
        row: row.rowNumber,
        email: row.data.college_email,
        error: row.validation.errors.map(e => e.message).join(', ')
      });
    });

    // Check for duplicate emails in batch
    const duplicates = LearnerValidationService.findDuplicateEmails(
      validRows.map(r => r.data)
    );

    if (duplicates.size > 0) {
      duplicates.forEach((rowIndices, email) => {
        rowIndices.forEach(index => {
          result.errors.push({
            row: validRows[index].rowNumber,
            email,
            error: `Duplicate email in file: ${email} appears in rows ${rowIndices.map(i => validRows[i].rowNumber).join(', ')}`
          });
        });
      });

      // Remove duplicates from valid rows
      const duplicateIndices = new Set(Array.from(duplicates.values()).flat());
      const uniqueValidRows = validRows.filter((_, index) => !duplicateIndices.has(index));

      // Process unique rows
      await this.processValidRows(uniqueValidRows, result);
    } else {
      // Process all valid rows
      await this.processValidRows(validRows, result);
    }

    return result;
  }

  /**
   * Process valid rows - create learners and users
   */
  private static async processValidRows(
    rows: BulkUploadRow[],
    result: BulkUploadResult
  ): Promise<void> {
    for (const row of rows) {
      try {
        // Check if email already exists in database
        const emailExists = await LearnerValidationService.checkEmailExists(
          row.data.college_email!
        );

        if (emailExists) {
          result.errors.push({
            row: row.rowNumber,
            email: row.data.college_email,
            error: 'Email already exists in database'
          });
          result.upload_summary.learners_failed++;
          continue;
        }

        // Prepare learner data
        const learnerData: Partial<LearnerProfile> = {
          ...row.data,
          lifecycle_status: 'active', // CRITICAL: Set to active (not enquiry)
          is_profile_complete: isProfileComplete(row.data)
        };

        // Create learner profile
        const { data: learner, error: learnerError } = await supabaseAdmin
          .from('learners_profiles')
          .insert(learnerData)
          .select()
          .single();

        if (learnerError) {
          result.errors.push({
            row: row.rowNumber,
            email: row.data.college_email,
            error: `Failed to create learner: ${learnerError.message}`
          });
          result.upload_summary.learners_failed++;
          continue;
        }

        result.upload_summary.learners_created++;

        // Check if profile is complete
        if (learnerData.is_profile_complete) {
          result.user_creation_summary.profiles_complete++;

          // Try to create user account
          try {
            await this.createUserAccount(learner, result);
          } catch (userError) {
            console.error('[bulk-upload] User creation failed:', userError);
            result.user_creation_summary.user_creation_failed++;
            // Note: Learner is still created, just user account failed
          }
        }

      } catch (error) {
        console.error('[bulk-upload] Error processing row:', error);
        result.errors.push({
          row: row.rowNumber,
          email: row.data.college_email,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        result.upload_summary.learners_failed++;
      }
    }
  }

  /**
   * Create user account for learner
   */
  private static async createUserAccount(
    learner: any,
    result: BulkUploadResult
  ): Promise<void> {
    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .ilike('email', learner.college_email)
      .maybeSingle();

    if (existingProfile) {
      result.user_creation_summary.existing_users++;
      return;
    }

    // Generate temp password
    const tempPassword = generateTemporaryPassword();
    const fullName = `${learner.first_name} ${learner.last_name || ''}`.trim();

    // Create auth user
    const { data: authUser, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: learner.college_email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'student'
        }
      });

    if (authError) {
      throw new Error(`Failed to create auth user: ${authError.message}`);
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authUser.user.id,
        email: learner.college_email,
        full_name: fullName,
        phone_number: learner.mobile,
        role: 'student',
        institution_id: learner.institution_id,
        profile_completed: true,
        is_active: true
      });

    if (profileError) {
      // Clean up by deleting the auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      throw new Error(`Failed to create profile: ${profileError.message}`);
    }

    result.user_creation_summary.new_users_created++;
    result.created_users.push({
      name: fullName,
      email: learner.college_email,
      temp_password: tempPassword
    });
  }
}
