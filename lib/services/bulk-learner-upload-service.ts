// ============================================
// BULK LEARNER UPLOAD SERVICE
// ============================================
// Created: 2025-01-22
// Purpose: Handle bulk upload of new learner profiles with auto user creation
// ============================================

import { createClient } from '@supabase/supabase-js';
import { LearnerValidationService, ValidationResult } from './learner-validation-service';
import { buildQuotaResolver } from '@/lib/utils/quota-name-resolver';
import { buildCommunityResolver } from '@/lib/utils/community-name-resolver';
import { buildCasteResolver } from '@/lib/utils/caste-name-resolver';
import { buildAccommodationTypeResolverMulti } from '@/lib/utils/accommodation-type-resolver';
import type { LearnerProfile } from '@/types/learner-profile';
import { randomUUID } from 'crypto';
import { generateTemporaryPassword } from '@/lib/utils/temporary-password';

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
 * Check if profile is complete
 * Profile is complete if all required fields are filled
 */
function isProfileComplete(profile: Partial<LearnerProfile>): boolean {
  return !!(
    profile.first_name &&
    profile.college_email &&
    profile.student_mobile &&
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
    rows: BulkUploadRow[],
    userId?: string
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

    // Rows that pass per-row validation but must still be excluded from
    // insertion because of a batch-level or DB-level collision. Indices point
    // into validRows; a single filter removes them all before processing.
    const excludedIndices = new Set<number>();

    // GUARD 1: duplicate college_email within this file (existing behaviour).
    const duplicates = LearnerValidationService.findDuplicateEmails(
      validRows.map(r => r.data)
    );
    duplicates.forEach((rowIndices, email) => {
      rowIndices.forEach(index => {
        result.errors.push({
          row: validRows[index].rowNumber,
          email,
          error: `Duplicate email in file: ${email} appears in rows ${rowIndices.map(i => validRows[i].rowNumber).join(', ')}`
        });
        excludedIndices.add(index);
      });
    });

    // GUARD 2: the SAME student_photo_url assigned to multiple distinct learners
    // in this file. Root cause of BUG-004438/004437 — a bulk sheet repeated one
    // photo URL across dozens of rows, so every learner rendered the same (wrong)
    // person's face. A photo URL is inherently per-person; sharing one is always
    // an error. Reject every row in the colliding group with an explicit message.
    const photoDupes = LearnerValidationService.findDuplicatePhotoUrls(
      validRows.map(r => r.data)
    );
    photoDupes.forEach((rowIndices) => {
      const rowsLabel = rowIndices.map(i => validRows[i].rowNumber).join(', ');
      rowIndices.forEach(index => {
        result.errors.push({
          row: validRows[index].rowNumber,
          email: validRows[index].data.college_email,
          error: `Same photo URL assigned to multiple learners (rows ${rowsLabel}). Each learner needs their own photo — fix the file and re-upload.`
        });
        excludedIndices.add(index);
      });
    });

    // GUARD 3: student_photo_url already stored on a DIFFERENT learner in the DB
    // (the same corruption class arriving one upload at a time). Re-uploading the
    // same learner with their own existing photo is fine and is NOT flagged.
    const photoOwners = await LearnerValidationService.findExistingPhotoOwners(
      validRows.map(r => (r.data as { student_photo_url?: string }).student_photo_url || '')
    );
    if (photoOwners.size > 0) {
      validRows.forEach((row, index) => {
        const url = ((row.data as { student_photo_url?: string }).student_photo_url || '').trim();
        if (!url) return;
        const existingOwners = photoOwners.get(url);
        if (!existingOwners) return;
        const rowEmail = (row.data.college_email || '').toLowerCase();
        const otherOwners = existingOwners.filter(e => e !== rowEmail);
        if (otherOwners.length > 0) {
          result.errors.push({
            row: row.rowNumber,
            email: row.data.college_email,
            error: `Photo URL already belongs to another learner (${otherOwners.join(', ')}). Each learner needs their own photo.`
          });
          excludedIndices.add(index);
        }
      });
    }

    // Surface the rejections in the summary + "learners failed" toast so nothing
    // is dropped silently (repo rule: validation failures must be explicit).
    result.upload_summary.learners_failed += excludedIndices.size;

    const rowsToProcess = excludedIndices.size > 0
      ? validRows.filter((_, index) => !excludedIndices.has(index))
      : validRows;

    await this.processValidRows(rowsToProcess, result);

    // Log bulk upload activity (summary)
    try {
      if (userId) {
        await supabaseAdmin.from('user_activity_logs').insert({
          user_id: userId,
          action_type: 'import',
          resource_type: 'learner',
          description: `Bulk uploaded ${result.upload_summary.learners_created} learner enquiries (${result.upload_summary.learners_failed} failed)`,
          metadata: {
            sub_type: 'bulk_upload',
            success_count: result.upload_summary.learners_created,
            failed_count: result.upload_summary.learners_failed,
            total_rows: result.upload_summary.total_rows,
          },
        });
      }
    } catch (logError) {
      console.error('[bulk-upload] Failed to log activity:', logError);
    }

    return result;
  }

  /**
   * Process valid rows - create learners and users using batch operations
   */
  private static async processValidRows(
    rows: BulkUploadRow[],
    result: BulkUploadResult
  ): Promise<void> {
    const BATCH_SIZE = 75;

    console.log(`[bulk-upload] Processing ${rows.length} valid rows in batches of ${BATCH_SIZE}`);

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      console.log(`[bulk-upload] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: rows ${i + 1}-${i + batch.length}`);

      try {
        // STEP 1: Batch upsert learners FIRST (create learner records to get IDs)
        console.log('[bulk-upload] STEP 1: Upserting learners_profiles...');
        const learnerResults = await this.batchUpsertLearners(batch, result);
        console.log(`[bulk-upload] STEP 1 complete: ${learnerResults.size} learners processed`);

        // STEP 2: Batch upsert profiles WITH learner_id references
        console.log('[bulk-upload] STEP 2: Upserting profiles with learner_id references...');
        const profileResults = await this.batchUpsertProfiles(batch, learnerResults, result);
        console.log(`[bulk-upload] STEP 2 complete: ${profileResults.size} profiles processed`);

        // STEP 3: Sequential auth user creation
        const completeLearners = batch.filter(row => {
          const email = row.data.college_email!.toLowerCase();
          const learner = learnerResults.get(email);
          return learner && isProfileComplete(row.data);
        });
        console.log(`[bulk-upload] STEP 3: Creating auth users for ${completeLearners.length} complete learners...`);
        await this.createAuthUsers(completeLearners, profileResults, learnerResults, result);

      } catch (error) {
        console.error('[bulk-upload] ❌ BATCH PROCESSING ERROR:', error);
        console.error('[bulk-upload] Error details:', {
          message: error instanceof Error ? error.message : 'Unknown',
          stack: error instanceof Error ? error.stack : undefined
        });

        batch.forEach(row => {
          result.errors.push({
            row: row.rowNumber,
            email: row.data.college_email,
            error: `Batch failed: ${error instanceof Error ? error.message : 'Unknown'}`
          });
          result.upload_summary.learners_failed++;
        });
      }
    }
  }

  /**
   * Batch upsert profiles with learner_id references
   * Updates institutional fields, preserves personal fields
   * Note: Uses check-then-insert/update pattern (no UNIQUE constraint on email)
   */
  private static async batchUpsertProfiles(
    rows: BulkUploadRow[],
    learnerResults: Map<string, {id: string, inserted: boolean}>,
    result: BulkUploadResult
  ): Promise<Map<string, {id: string, inserted: boolean}>> {

    const emails = rows.map(r => r.data.college_email!);
    const resultMap = new Map<string, {id: string, inserted: boolean}>();

    // STEP 1: Check which emails already exist in profiles table
    const { data: existingProfiles, error: checkError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .in('email', emails);

    if (checkError) {
      throw new Error(`Failed to check existing profiles: ${checkError.message}`);
    }

    // Build map of existing profiles
    const existingMap = new Map<string, string>(); // email -> id
    existingProfiles?.forEach(profile => {
      existingMap.set(profile.email.toLowerCase(), profile.id);
    });

    // STEP 2: Separate rows into updates vs inserts
    const toUpdate: Array<{id: string, data: any}> = [];
    const toInsert: any[] = [];

    rows.forEach(row => {
      const fullName = `${row.data.first_name} ${row.data.last_name || ''}`.trim();
      const email = row.data.college_email!;
      const emailLower = email.toLowerCase();

      // Get learner_id from learner results (CRITICAL: created in STEP 1)
      const learnerInfo = learnerResults.get(emailLower);
      const learnerId = learnerInfo?.id || null;

      if (!learnerId) {
        console.warn(`[bulk-upload] ⚠️ No learner_id found for ${email} - skipping profile creation`);
        return;
      }

      const existingId = existingMap.get(emailLower);

      if (existingId) {
        // Update existing profile with learner_id
        const profileData = {
          email: email,
          full_name: fullName,
          phone_number: row.data.student_mobile || null,
          role: 'student',
          gender: row.data.gender || null,
          institution_id: row.data.institution_id,
          department_id: row.data.department_id,
          learner_id: learnerId, // CRITICAL: Link to learner record created in STEP 1
          profile_completed: false,
          is_active: true
        };
        toUpdate.push({ id: existingId, data: profileData });
        resultMap.set(emailLower, { id: existingId, inserted: false });
      } else {
        // Insert new profile with learner_id AND generated UUID
        const newProfileId = randomUUID();
        const profileData = {
          id: newProfileId, // ✅ FIX: Generate UUID (database has no DEFAULT)
          email: email,
          full_name: fullName,
          phone_number: row.data.student_mobile || null,
          role: 'student',
          gender: row.data.gender || null,
          institution_id: row.data.institution_id,
          department_id: row.data.department_id,
          learner_id: learnerId, // CRITICAL: Link to learner record created in STEP 1
          profile_completed: false,
          is_active: true
        };
        toInsert.push(profileData);
        // Note: Will add to resultMap after successful insert
      }
    });

    // STEP 3: Batch update existing profiles
    if (toUpdate.length > 0) {
      for (const { id, data } of toUpdate) {
        const { error: updateError } = await supabaseAdmin
          .from('profiles')
          .update({
            institution_id: data.institution_id,
            department_id: data.department_id,
            phone_number: data.phone_number,
            gender: data.gender,
            learner_id: data.learner_id, // Update learner_id reference
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (updateError) {
          console.error(`[bulk-upload] Failed to update profile ${id}:`, updateError);
        }
      }
      result.user_creation_summary.existing_users += toUpdate.length;
    }

    // STEP 4: Batch insert new profiles
    if (toInsert.length > 0) {
      console.log(`[bulk-upload] Inserting ${toInsert.length} new profiles with generated UUIDs`);

      const { data: newProfiles, error: insertError } = await supabaseAdmin
        .from('profiles')
        .insert(toInsert)
        .select('id, email');

      if (insertError) {
        console.error('[bulk-upload] Profile insert error:', insertError);
        throw new Error(`Batch profile insert failed: ${insertError.message}`);
      }

      // Add new profiles to result map
      newProfiles?.forEach(profile => {
        resultMap.set(profile.email.toLowerCase(), {
          id: profile.id,
          inserted: true
        });
      });

      console.log(`[bulk-upload] ✅ Successfully inserted ${newProfiles?.length || 0} profiles`);
    }

    return resultMap;
  }

  /**
   * Batch upsert learners_profiles (check existing + insert new)
   * Returns Map<email, {id, inserted}> for use in profile creation
   */
  private static async batchUpsertLearners(
    rows: BulkUploadRow[],
    result: BulkUploadResult
  ): Promise<Map<string, {id: string, inserted: boolean}>> {

    const emails = rows.map(r => r.data.college_email!);
    const resultMap = new Map<string, {id: string, inserted: boolean}>();

    // STEP 1: Check which learners already exist
    const { data: existingLearners, error: checkError } = await supabaseAdmin
      .from('learners_profiles')
      .select('id, college_email')
      .in('college_email', emails);

    if (checkError) {
      throw new Error(`Failed to check existing learners: ${checkError.message}`);
    }

    // Build map of existing learners
    const existingMap = new Map<string, string>(); // email -> id
    existingLearners?.forEach(learner => {
      const emailLower = learner.college_email.toLowerCase();
      existingMap.set(emailLower, learner.id);
      resultMap.set(emailLower, { id: learner.id, inserted: false });
    });

    console.log(`[bulk-upload] Found ${existingMap.size} existing learners`);

    // STEP 2: Separate rows into new vs existing
    const newLearners = rows.filter(
      row => !existingMap.has(row.data.college_email!.toLowerCase())
    );

    if (newLearners.length === 0) {
      console.log('[bulk-upload] No new learners to insert (all already exist)');
      return resultMap;
    }

    console.log(`[bulk-upload] Preparing to insert ${newLearners.length} new learners`);

    // Resolve the readable quota label (Excel "Quota" column) → quota_id (FK).
    // Storage is quota_id only; the legacy `quota` TEXT column is being retired.
    const resolveQuota = await buildQuotaResolver(supabaseAdmin);
    const resolveCommunity = await buildCommunityResolver(supabaseAdmin);
    const resolveCaste = await buildCasteResolver(supabaseAdmin);
    // accommodation_type TEXT is retired — resolve the Excel label → the
    // institution-scoped accommodation_types FK (rows span institutions).
    const resolveAccommodation = await buildAccommodationTypeResolverMulti(supabaseAdmin);

    // STEP 3: Batch insert new learners
    const learnerData = newLearners.map(row => {
      // FIX: Keep scholarship_type as text (no longer converting to boolean first_graduate)
      // The database now has scholarship_type column as TEXT.
      // Resolve readable quota/community/caste/accommodation labels → FK ids; the
      // legacy TEXT columns are retired. Caste resolution is community-scoped
      // (ambiguous names); accommodation is institution-scoped.
      const { quota, community, caste, accommodation_type, ...rest } = row.data as Record<string, any>;
      const communityCategoryId = resolveCommunity(community) ?? (row.data as any).community_category_id ?? null;
      const institutionId = (row.data as any).institution_id ?? null;
      return {
        ...rest,
        quota_id: resolveQuota(quota) ?? (row.data as any).quota_id ?? null,
        community_category_id: communityCategoryId,
        caste_id: resolveCaste(caste, communityCategoryId) ?? (row.data as any).caste_id ?? null,
        accommodation_type_id:
          resolveAccommodation(accommodation_type, institutionId) ??
          (row.data as any).accommodation_type_id ??
          null,
        lifecycle_status: 'active',
        is_profile_complete: isProfileComplete(row.data)
      };
    });

    // Log first record for debugging
    if (learnerData.length > 0) {
      console.log('[bulk-upload] Sample learner data (first record):', JSON.stringify(learnerData[0], null, 2));
    }

    const { data: insertedLearners, error: insertError } = await supabaseAdmin
      .from('learners_profiles')
      .insert(learnerData)
      .select('id, college_email, is_profile_complete');

    if (insertError) {
      console.error('[bulk-upload] ❌ Batch learner insert ERROR:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint
      });

      if (insertError.code === '23505') { // Unique constraint violation
        console.warn('[bulk-upload] Some learners already exist (concurrent upload?)');
        result.upload_summary.learners_created += newLearners.length;
      } else {
        throw new Error(`Batch learner insert failed: ${insertError.message}`);
      }
    } else {
      console.log(`[bulk-upload] ✅ Successfully inserted ${insertedLearners?.length || 0} learners`);

      // Add inserted learners to result map
      insertedLearners?.forEach(learner => {
        const emailLower = learner.college_email.toLowerCase();
        resultMap.set(emailLower, { id: learner.id, inserted: true });
      });

      result.upload_summary.learners_created += insertedLearners?.length || 0;
      const completeProfiles = insertedLearners?.filter(l => l.is_profile_complete) || [];
      result.user_creation_summary.profiles_complete += completeProfiles.length;
    }

    return resultMap;
  }

  /**
   * Create auth users for complete profiles (sequential - can't batch)
   */
  private static async createAuthUsers(
    rows: BulkUploadRow[],
    profileResults: Map<string, {id: string, inserted: boolean}>,
    learnerResults: Map<string, {id: string, inserted: boolean}>,
    result: BulkUploadResult
  ): Promise<void> {

    for (const row of rows) {
      try {
        const email = row.data.college_email!.toLowerCase();
        const profileInfo = profileResults.get(email);

        if (!profileInfo || !isProfileComplete(row.data)) continue;

        // Generate temp password
        const tempPassword = generateTemporaryPassword();
        const fullName = `${row.data.first_name} ${row.data.last_name || ''}`.trim();

        // Create auth user
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: row.data.college_email!,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName, role: 'student' }
        });

        if (authError) {
          // Check if error is "email already exists" - this is OK, not a failure
          if (authError.message?.includes('already been registered') || authError.code === 'email_exists') {
            console.log(`[bulk-upload] ℹ️ Auth user already exists for ${email}, skipping`);
            result.user_creation_summary.existing_users++;
            continue;
          }

          // Other errors are actual failures
          console.error(`[bulk-upload] Auth creation failed for ${email}:`, authError);
          result.user_creation_summary.user_creation_failed++;
          continue;
        }

        result.user_creation_summary.new_users_created++;
        result.created_users.push({
          name: fullName,
          email: row.data.college_email!,
          temp_password: tempPassword
        });

      } catch (error) {
        console.error('[bulk-upload] Error creating auth user:', error);
        result.user_creation_summary.user_creation_failed++;
      }
    }
  }
}
