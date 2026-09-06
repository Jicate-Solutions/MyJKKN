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
  ACCOMMODATION_VALUES
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
 * A learner photo value is optional. When BLANK it means "no photo" and is
 * always allowed (the profile UI shows a fallback avatar). When PRESENT it must
 * be a real http(s) URL — bare filenames or hyperlink sentinels like 'VIEW'
 * (both seen in past spreadsheet imports) render as a broken image and, when the
 * same string lands on many rows, produce the wrong-person-photo bug
 * (BUG-004438/004437). Callers treat a `false` here as a per-row validation error.
 */
export function isPhotoUrlValueValid(raw: unknown): boolean {
  const v = (raw ?? '').toString().trim();
  if (!v) return true; // blank = no photo, allowed
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
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

    // PHOTO URL: optional, but a PRESENT value must be a real http(s) link.
    // Blocks junk imports ('VIEW', bare filenames) that break the image or get
    // reused across learners. See BUG-004438/004437.
    if (!isPhotoUrlValueValid(data.student_photo_url)) {
      const shown = (data.student_photo_url ?? '').toString().trim().slice(0, 40);
      errors.push({
        field: 'student_photo_url',
        message: `Invalid photo URL "${shown}" — must be a full http(s) link, or leave it blank if there is no photo.`
      });
    }

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
   * Find student_photo_url values that appear on MORE THAN ONE row in a batch.
   * Mirrors findDuplicateEmails. A photo URL is inherently per-person, so any
   * value shared by two distinct learners is a collision (root cause of the
   * wrong-person-photo incident, BUG-004438/004437). Blank photos are ignored.
   * Returns Map<normalizedUrl, rowIndices[]>.
   */
  static findDuplicatePhotoUrls(profiles: any[]): Map<string, number[]> {
    const urlMap = new Map<string, number[]>();
    const duplicates = new Map<string, number[]>();

    profiles.forEach((profile, index) => {
      const url = (profile?.student_photo_url ?? '').toString().trim();
      if (!url) return; // blank photo is never a collision

      if (!urlMap.has(url)) {
        urlMap.set(url, []);
      }
      urlMap.get(url)!.push(index);
    });

    urlMap.forEach((indices, url) => {
      if (indices.length > 1) {
        duplicates.set(url, indices);
      }
    });

    return duplicates;
  }

  /**
   * For a set of photo URLs, find which are ALREADY stored on a learner in the
   * DB and return Map<url, existingOwnerEmails[]>. Lets the caller reject a row
   * whose photo already belongs to a DIFFERENT learner (the same corruption
   * class arriving one upload at a time). Fail-open on DB error (mirrors
   * checkEmailExists) — the intra-batch + format guards still apply.
   */
  static async findExistingPhotoOwners(urls: string[]): Promise<Map<string, string[]>> {
    const owners = new Map<string, string[]>();
    const clean = Array.from(
      new Set(urls.map(u => (u ?? '').toString().trim()).filter(Boolean))
    );
    if (clean.length === 0) return owners;

    // Chunk the IN() list: photo URLs are long, and a single filter over a large
    // batch can blow past PostgREST's query-string limit.
    const CHUNK = 50;
    for (let i = 0; i < clean.length; i += CHUNK) {
      const chunk = clean.slice(i, i + CHUNK);
      const { data, error } = await supabaseAdmin
        .from('learners_profiles')
        .select('college_email, student_photo_url')
        .in('student_photo_url', chunk);

      if (error) {
        console.error('[learner-validation] Error checking existing photo owners:', error);
        return owners; // fail-open; intra-batch + format guards still apply
      }

      data?.forEach(row => {
        const url = (row.student_photo_url ?? '').toString().trim();
        if (!url) return;
        const email = (row.college_email ?? '').toString().toLowerCase();
        if (!owners.has(url)) owners.set(url, []);
        if (email && !owners.get(url)!.includes(email)) {
          owners.get(url)!.push(email);
        }
      });
    }

    return owners;
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
      // community_category_id is carried so bulk-edit can scope caste
      // resolution to the learner's existing community (caste names repeat
      // across communities) when the upload doesn't set a new one.
      // The six reference columns are carried for the same reason: bulk-edit
      // needs the stored referral_type when the sheet's Type cell is blank, and
      // needs the stored values to tell a real edit from a re-uploaded template
      // (writing them back unchanged would bump updated_at on every row).
      // Must stay ONE string literal: Supabase parses the selection at the type
      // level, and a concatenated string degrades the row type to
      // GenericStringError (TS2339 on every field below).
      .select('id, lifecycle_status, institution_id, community_category_id, referral_type, referred_by_id, referred_by_name, reference_type, reference_name, reference_contact')
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
