// ============================================
// BULK EDIT PREVIEW API
// ============================================
// Created: 2025-01-22
// Purpose: Preview changes before bulk update
// Endpoint: POST /api/learners/bulk-edit-preview
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BulkLearnerEditService, type BulkEditRow } from '@/lib/services/bulk-learner-edit-service';
import { LearnerValidationService } from '@/lib/services/learner-validation-service';
import { parseExcelFile, mapColumns, sanitizeValue } from '@/lib/utils/excel-parser';


/**
 * Column mapping for bulk edit template - ALL FIELDS
 */
const COLUMN_MAPPING: Record<string, string[]> = {
  // REQUIRED: ID for matching
  'id': ['ID*', 'ID', 'id', 'learner_id'],

  // SECTION 1: Basic Details
  'first_name': ['First Name', 'first_name', 'firstname'],
  'last_name': ['Last Name', 'last_name', 'lastname'],
  'date_of_birth': ['Date of Birth', 'DOB', 'date_of_birth', 'dob'],
  'gender': ['Gender', 'gender'],
  'religion': ['Religion', 'religion'],
  'community': ['Community', 'community'],
  'caste': ['Caste', 'caste'],
  'aadhar_number': ['Aadhar Number', 'aadhar_number', 'aadhaar'],
  'blood_group': ['Blood Group', 'blood_group'],
  'admission_year': ['Admission Year', 'admission_year'],

  // SECTION 2: Parent/Guardian Information
  'father_name': ['Father Name', 'father_name', 'fathername'],
  'father_occupation': ['Father Occupation', 'father_occupation'],
  'father_mobile': ['Father Mobile', 'father_mobile'],
  'mother_name': ['Mother Name', 'mother_name', 'mothername'],
  'mother_occupation': ['Mother Occupation', 'mother_occupation'],
  'mother_mobile': ['Mother Mobile', 'mother_mobile'],
  'annual_income': ['Annual Income', 'annual_income'],

  // SECTION 3: Academic Assignment
  'degree_id': ['Degree ID', 'degree_id'],
  'department_id': ['Department ID', 'department_id'],
  'program_id': ['Program ID', 'program_id'],
  'semester_id': ['Semester ID', 'semester_id'],
  'section_id': ['Section ID', 'section_id'],
  'academic_year_id': ['Academic Year ID', 'academic_year_id'],
  'regulation_id': ['Regulation ID', 'regulation_id'],
  'batch_id': ['Batch ID', 'batch_id'],

  // SECTION 4: Contact Details
  'mobile': ['Student Mobile', 'Mobile', 'mobile', 'student_mobile'],
  'college_email': ['College Email', 'college_email', 'email'],
  'student_email': ['Personal Email', 'Student Email', 'student_email', 'personal_email'],

  // SECTION 5: Address Information
  'permanent_address_street': ['Permanent Address Street', 'permanent_address_street', 'address_street'],
  'permanent_address_taluk': ['Permanent Address Taluk', 'permanent_address_taluk', 'taluk'],
  'permanent_address_district': ['Permanent Address District', 'permanent_address_district', 'district'],
  'permanent_address_pin_code': ['Permanent Address Pin Code', 'permanent_address_pin_code', 'pincode', 'pin'],
  'permanent_address_state': ['Permanent Address State', 'permanent_address_state', 'state'],

  // SECTION 6: Entry Type
  'entry_type': ['Entry Type', 'entry_type'],
  'scholarship_type': ['Scholarship Type', 'scholarship_type'],

  // SECTION 7: Previous Education
  'last_school': ['Last School', 'last_school'],
  'board_of_study': ['Board of Study', 'board_of_study'],
  'tenth_max_marks': ['10th Max Marks', 'tenth_max_marks'],
  'tenth_obtained_marks': ['10th Obtained Marks', 'tenth_obtained_marks'],
  'tenth_percentage': ['10th Percentage', 'tenth_percentage'],
  'twelfth_group': ['12th Group', 'twelfth_group'],
  'twelfth_max_marks': ['12th Max Marks', 'twelfth_max_marks'],
  'twelfth_obtained_marks': ['12th Obtained Marks', 'twelfth_obtained_marks'],
  'twelfth_percentage': ['12th Percentage', 'twelfth_percentage'],

  // SECTION 8: Entrance Exam Details
  'medical_cutoff_marks': ['Medical Cutoff Marks', 'medical_cutoff_marks'],
  'engineering_cutoff_marks': ['Engineering Cutoff Marks', 'engineering_cutoff_marks'],
  'neet_roll_number': ['NEET Roll Number', 'neet_roll_number'],
  'neet_score': ['NEET Score', 'neet_score'],
  'counseling_applied': ['Counseling Applied', 'counseling_applied'],
  'counseling_number': ['Counseling Number', 'counseling_number'],

  // SECTION 9: Accommodation Details
  'accommodation_type': ['Accommodation Type', 'accommodation_type'],
  'hostel_type': ['Hostel Type', 'hostel_type'],
  'food_type': ['Food Type', 'food_type'],
  'bus_required': ['Bus Required', 'bus_required'],
  'bus_route': ['Bus Route', 'bus_route'],
  'bus_pickup_location': ['Bus Pickup Location', 'bus_pickup_location'],

  // SECTION 10: Reference Information
  'reference_type': ['Reference Type', 'reference_type'],
  'reference_name': ['Reference Name', 'reference_name'],
  'reference_contact': ['Reference Contact', 'reference_contact'],

  // SECTION 11: Student Specific
  'roll_number': ['Roll Number', 'roll_number'],
  'register_number': ['Register Number', 'register_number'],
  'quota': ['Quota', 'quota'],
  'category': ['Category', 'category'],
  'student_photo_url': ['Photo URL', 'photo_url', 'student_photo_url'],
};

interface FieldChange {
  field: string;
  fieldLabel: string; // Added to match BulkLearnerEditService response
  oldValue: any;
  newValue: any;
}

interface PreviewRow {
  learnerId: string;
  learnerName: string;
  rowNumber: number;
  changes: FieldChange[];
  status: 'valid' | 'error' | 'no_changes';
  error?: string;
}

/**
 * POST /api/learners/bulk-edit-preview
 * Preview changes before bulk update
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    console.log('[bulk-edit-preview] Starting authentication...');
    let supabase;
    let user;

    try {
      supabase = await createServerSupabaseClient();
      console.log('[bulk-edit-preview] Supabase client created');

      console.log('[bulk-edit-preview] Getting user...');
      const authResponse = await supabase.auth.getUser();
      user = authResponse.data.user;
      const authError = authResponse.error;

      if (authError) {
        console.error('[bulk-edit-preview] Auth error:', authError.message, authError);
        return NextResponse.json(
          {
            success: false,
            error: `Authentication failed: ${authError.message}`
          },
          { status: 401 }
        );
      }

      if (!user) {
        console.error('[bulk-edit-preview] No user found in session');
        return NextResponse.json(
          {
            success: false,
            error: 'No user session found. Please log in again.'
          },
          { status: 401 }
        );
      }

      console.log('[bulk-edit-preview] User authenticated:', user.id);
    } catch (authException) {
      console.error('[bulk-edit-preview] Auth exception:', authException);
      return NextResponse.json(
        {
          success: false,
          error: `Authentication error: ${authException instanceof Error ? authException.message : 'Network timeout or connection error. Please try again.'}`
        },
        { status: 401 }
      );
    }

    // 2. Check permissions
    console.log('[bulk-edit-preview] Fetching user profile...');
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('[bulk-edit-preview] Profile fetch error:', profileError.message);
      return NextResponse.json(
        {
          success: false,
          error: `Failed to fetch user profile: ${profileError.message}`
        },
        { status: 500 }
      );
    }

    if (!profileData) {
      console.error('[bulk-edit-preview] No profile data found for user:', user.id);
      return NextResponse.json(
        {
          success: false,
          error: 'User profile not found'
        },
        { status: 500 }
      );
    }

    console.log('[bulk-edit-preview] Profile fetched:', profileData.id, 'Role:', profileData.role);

    const profile = profileData as {
      id: string;
      role: string;
      is_super_admin: boolean | null;
      institution_id: string | null;
    };

    // Get user's role permissions
    const { data: roleData, error: roleError } = await supabase
      .from('custom_roles')
      .select('permissions')
      .eq('role_key', profile.role)
      .single();

    if (roleError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch role permissions'
        },
        { status: 500 }
      );
    }

    const rolePermissions = roleData as {
      permissions: Record<string, boolean>;
    } | null;

    // Check for bulk edit permission
    const permissions = rolePermissions?.permissions || {};
    const hasPermission =
      permissions['all'] === true ||
      permissions['learners.profiles.bulk_edit'] === true ||
      permissions['learners.edit'] === true ||
      profile.is_super_admin;

    if (!hasPermission) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to bulk edit active learners'
        },
        { status: 403 }
      );
    }

    // 3. Parse file from form data
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: 'No file provided'
        },
        { status: 400 }
      );
    }

    // 4. Parse Excel file
    console.log('[bulk-edit-preview] Parsing file:', file.name, 'Size:', file.size);
    const parseResult = await parseExcelFile(file, 'Active Learners');

    if (parseResult.errors.length > 0) {
      console.error('[bulk-edit-preview] Parse errors:', parseResult.errors);
      return NextResponse.json(
        {
          success: false,
          error: parseResult.errors.join(', ')
        },
        { status: 400 }
      );
    }

    console.log('[bulk-edit-preview] Parsed successfully:', parseResult.totalRows, 'rows');

    if (parseResult.totalRows === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No data found in file'
        },
        { status: 400 }
      );
    }

    // 5. Process and preview changes
    const previewRows: PreviewRow[] = [];

    for (const parsedRow of parseResult.rows) {
      // Map columns
      const mappedData = mapColumns(parsedRow.data, COLUMN_MAPPING);

      // Sanitize uploaded data (same logic as bulk-edit route)
      const sanitizedData: any = { id: mappedData.id };

      // Sanitize all fields (using same logic from bulk-edit route)
      // SECTION 1: Basic Details
      if (mappedData.first_name) sanitizedData.first_name = sanitizeValue(mappedData.first_name, 'text');
      if (mappedData.last_name) sanitizedData.last_name = sanitizeValue(mappedData.last_name, 'text');
      if (mappedData.date_of_birth) sanitizedData.date_of_birth = sanitizeValue(mappedData.date_of_birth, 'date');
      if (mappedData.gender) sanitizedData.gender = sanitizeValue(mappedData.gender, 'text');
      if (mappedData.religion) sanitizedData.religion = sanitizeValue(mappedData.religion, 'text');
      if (mappedData.community) sanitizedData.community = sanitizeValue(mappedData.community, 'text');
      if (mappedData.caste) sanitizedData.caste = sanitizeValue(mappedData.caste, 'text');
      if (mappedData.aadhar_number) sanitizedData.aadhar_number = sanitizeValue(mappedData.aadhar_number, 'mobile');
      if (mappedData.blood_group) sanitizedData.blood_group = sanitizeValue(mappedData.blood_group, 'text');
      if (mappedData.admission_year) sanitizedData.admission_year = mappedData.admission_year;

      // SECTION 2: Parent/Guardian Information
      if (mappedData.father_name) sanitizedData.father_name = sanitizeValue(mappedData.father_name, 'text');
      if (mappedData.father_occupation) sanitizedData.father_occupation = sanitizeValue(mappedData.father_occupation, 'text');
      if (mappedData.father_mobile) sanitizedData.father_mobile = sanitizeValue(mappedData.father_mobile, 'mobile');
      if (mappedData.mother_name) sanitizedData.mother_name = sanitizeValue(mappedData.mother_name, 'text');
      if (mappedData.mother_occupation) sanitizedData.mother_occupation = sanitizeValue(mappedData.mother_occupation, 'text');
      if (mappedData.mother_mobile) sanitizedData.mother_mobile = sanitizeValue(mappedData.mother_mobile, 'mobile');
      if (mappedData.annual_income) sanitizedData.annual_income = mappedData.annual_income;

      // SECTION 3: Academic Assignment
      if (mappedData.degree_id) sanitizedData.degree_id = mappedData.degree_id;
      if (mappedData.department_id) sanitizedData.department_id = mappedData.department_id;
      if (mappedData.program_id) sanitizedData.program_id = mappedData.program_id;
      if (mappedData.semester_id) sanitizedData.semester_id = mappedData.semester_id;
      if (mappedData.section_id) sanitizedData.section_id = mappedData.section_id;
      if (mappedData.academic_year_id) sanitizedData.academic_year_id = mappedData.academic_year_id;
      if (mappedData.regulation_id) sanitizedData.regulation_id = mappedData.regulation_id;
      if (mappedData.batch_id) sanitizedData.batch_id = mappedData.batch_id;

      // SECTION 4: Contact Details
      if (mappedData.mobile) sanitizedData.mobile = sanitizeValue(mappedData.mobile, 'mobile');
      if (mappedData.college_email) sanitizedData.college_email = sanitizeValue(mappedData.college_email, 'email');
      if (mappedData.student_email) sanitizedData.student_email = sanitizeValue(mappedData.student_email, 'email');

      // SECTION 5: Address Information
      if (mappedData.permanent_address_street) sanitizedData.permanent_address_street = sanitizeValue(mappedData.permanent_address_street, 'text');
      if (mappedData.permanent_address_taluk) sanitizedData.permanent_address_taluk = sanitizeValue(mappedData.permanent_address_taluk, 'text');
      if (mappedData.permanent_address_district) sanitizedData.permanent_address_district = sanitizeValue(mappedData.permanent_address_district, 'text');
      if (mappedData.permanent_address_pin_code) sanitizedData.permanent_address_pin_code = sanitizeValue(mappedData.permanent_address_pin_code, 'mobile');
      if (mappedData.permanent_address_state) sanitizedData.permanent_address_state = sanitizeValue(mappedData.permanent_address_state, 'text');

      // SECTION 6: Entry Type
      if (mappedData.entry_type) sanitizedData.entry_type = sanitizeValue(mappedData.entry_type, 'text');
      if (mappedData.scholarship_type) {
        // Keep as string, validate against allowed values
        const val = String(mappedData.scholarship_type).toUpperCase().trim();
        const validTypes = ['FIRST GRADUATE', 'PMS SCHOLARSHIP', '7.5% SCHOLARSHIP', 'NOT APPLICABLE'];
        sanitizedData.scholarship_type = validTypes.includes(val) ? val : null;
      }

      // SECTION 7: Previous Education
      if (mappedData.last_school) sanitizedData.last_school = sanitizeValue(mappedData.last_school, 'text');
      if (mappedData.board_of_study) sanitizedData.board_of_study = sanitizeValue(mappedData.board_of_study, 'text');

      // SECTION 8-11: Other fields
      if (mappedData.roll_number) sanitizedData.roll_number = sanitizeValue(mappedData.roll_number, 'text');
      if (mappedData.register_number) sanitizedData.register_number = sanitizeValue(mappedData.register_number, 'text');
      if (mappedData.quota) sanitizedData.quota = sanitizeValue(mappedData.quota, 'text');
      if (mappedData.category) sanitizedData.category = sanitizeValue(mappedData.category, 'text');
      if (mappedData.student_photo_url) sanitizedData.student_photo_url = mappedData.student_photo_url;

      const learnerId = sanitizedData.id;

      // Validate learner exists
      const validation = await BulkLearnerEditService.previewChanges(
        learnerId,
        sanitizedData,
        profile.institution_id || undefined,
        !!profile.is_super_admin
      );

      if (!validation.exists) {
        previewRows.push({
          learnerId,
          learnerName: 'Unknown',
          rowNumber: parsedRow.rowNumber,
          changes: [],
          status: 'error',
          error: 'Learner not found'
        });
        continue;
      }

      if (!validation.isActive) {
        previewRows.push({
          learnerId,
          learnerName: validation.learnerName || 'Unknown',
          rowNumber: parsedRow.rowNumber,
          changes: [],
          status: 'error',
          error: 'Learner is not in active status'
        });
        continue;
      }

      if (!validation.hasAccess) {
        previewRows.push({
          learnerId,
          learnerName: validation.learnerName || 'Unknown',
          rowNumber: parsedRow.rowNumber,
          changes: [],
          status: 'error',
          error: 'No access to this learner (different institution)'
        });
        continue;
      }

      if (validation.changes.length === 0) {
        previewRows.push({
          learnerId,
          learnerName: validation.learnerName || 'Unknown',
          rowNumber: parsedRow.rowNumber,
          changes: [],
          status: 'no_changes',
          error: 'No changes detected'
        });
        continue;
      }

      previewRows.push({
        learnerId,
        learnerName: validation.learnerName || 'Unknown',
        rowNumber: parsedRow.rowNumber,
        changes: validation.changes,
        status: 'valid'
      });
    }

    // 6. Return preview result
    return NextResponse.json({
      success: true,
      total_rows: previewRows.length,
      valid_changes: previewRows.filter(r => r.status === 'valid').length,
      no_changes: previewRows.filter(r => r.status === 'no_changes').length,
      errors: previewRows.filter(r => r.status === 'error').length,
      preview: previewRows
    });

  } catch (error) {
    console.error('[api/learners/bulk-edit-preview] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
