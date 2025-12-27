// ============================================
// BULK UPLOAD PROFILES API
// ============================================
// Created: 2025-01-22
// Purpose: Bulk upload NEW learner profiles with auto user creation
// Endpoint: POST /api/learners/bulk-upload-profiles
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BulkLearnerUploadService, type BulkUploadRow } from '@/lib/services/bulk-learner-upload-service';
import { LearnerValidationService } from '@/lib/services/learner-validation-service';
import { parseExcelFile, mapColumns, sanitizeValue } from '@/lib/utils/excel-parser';
import { NameToIdResolver } from '@/lib/services/name-to-id-resolver';
import {
  normalizeDropdownValue,
  GENDER_VALUES,
  RELIGION_VALUES,
  COMMUNITY_VALUES,
  BLOOD_GROUP_VALUES,
  ENTRY_TYPE_VALUES,
  ACCOMMODATION_VALUES,
  HOSTEL_TYPE_VALUES,
  FOOD_TYPE_VALUES,
  QUOTA_VALUES
} from '@/lib/constants/learner-dropdown-values';
import * as XLSX from 'xlsx';


/**
 * Column mapping for bulk upload template
 * Maps various column name variations to expected fields
 */
const COLUMN_MAPPING: Record<string, string[]> = {
  // SECTION 1: Basic Details
  'first_name': ['First Name', '* First Name', 'firstname', 'first_name'],
  'last_name': ['Last Name', 'lastname', 'last_name'],
  'date_of_birth': ['Date of Birth', '* Date of Birth', 'DOB', 'date_of_birth', 'dob'],
  'gender': ['Gender', '* Gender', 'gender'],
  'religion': ['Religion', '* Religion', 'religion'],
  'community': ['Community', '* Community', 'community'],
  'caste': ['Caste', 'caste'],
  'aadhar_number': ['Aadhar Number', 'aadhar_number', 'aadhaar'],
  'blood_group': ['Blood Group', 'blood_group'],
  'admission_year': ['Admission Year', 'admission_year'],

  // SECTION 2: Parent/Guardian Information
  'father_name': ['Father Name', '* Father Name', 'father_name', 'fathername'],
  'father_occupation': ['Father Occupation', 'father_occupation'],
  'father_mobile': ['Father Mobile', '* Father Mobile', 'father_mobile'],
  'mother_name': ['Mother Name', '* Mother Name', 'mother_name', 'mothername'],
  'mother_occupation': ['Mother Occupation', 'mother_occupation'],
  'mother_mobile': ['Mother Mobile', '* Mother Mobile', 'mother_mobile'],
  'annual_income': ['Annual Income', 'annual_income'],

  // SECTION 3: Academic Assignment (accepts both names and IDs)
  'institution_name': ['Institution', '* Institution', 'institution', 'institution_name'],
  'degree_name': ['Degree', '* Degree', 'degree', 'degree_name'],
  'department_name': ['Department', '* Department', 'department', 'department_name'],
  'program_name': ['Program', '* Program', 'program', 'program_name'],
  'semester_name': ['Semester', '* Semester', 'semester', 'semester_name'],
  'section_name': ['Section', '* Section', 'section', 'section_name'],
  'academic_year_name': ['Academic Year', 'academic_year', 'academic_year_name'],
  'regulation_name': ['Regulation', 'regulation', 'regulation_name'],
  'batch_name': ['Batch', 'batch', 'batch_name'],
  // Legacy support for ID-based columns
  'institution_id': ['Institution ID', '* Institution ID', 'institution_id'],
  'degree_id': ['Degree ID', 'degree_id'],
  'department_id': ['Department ID', '* Department ID', 'department_id'],
  'program_id': ['Program ID', '* Program ID', 'program_id'],
  'semester_id': ['Semester ID', '* Semester ID', 'semester_id'],
  'section_id': ['Section ID', '* Section ID', 'section_id'],
  'academic_year_id': ['Academic Year ID', 'academic_year_id'],
  'regulation_id': ['Regulation ID', 'regulation_id'],
  'batch_id': ['Batch ID', 'batch_id'],

  // SECTION 4: Contact Details
  'student_mobile': ['Student Mobile', '* Student Mobile', 'Mobile', 'student_mobile', 'mobile'],
  'college_email': ['College Email', '* College Email', 'Email', 'college_email', 'email'],
  'student_email': ['Personal Email', 'Student Email', 'personal_email', 'student_email'],

  // SECTION 5: Address Information
  'permanent_address_street': ['Permanent Address Street', '* Permanent Address Street', 'permanent_address_street', 'address_street'],
  'permanent_address_taluk': ['Permanent Address Taluk', 'permanent_address_taluk', 'taluk'],
  'permanent_address_district': ['Permanent Address District', '* Permanent Address District', 'permanent_address_district', 'district'],
  'permanent_address_pin_code': ['Permanent Address Pin Code', '* Permanent Address Pin Code', 'permanent_address_pin_code', 'pincode', 'pin'],
  'permanent_address_state': ['Permanent Address State', '* Permanent Address State', 'permanent_address_state', 'state'],

  // SECTION 6: Entry Type
  'entry_type': ['Entry Type', '* Entry Type', 'entry_type'],
  'first_graduate': ['First Graduate', 'first_graduate'],

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
  'accommodation_type': ['Accommodation Type', '* Accommodation Type', 'accommodation_type'],
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

/**
 * POST /api/learners/bulk-upload-profiles
 * Upload Excel file with new learner profiles
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized'
        },
        { status: 401 }
      );
    }

    // 2. Check permissions
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, is_super_admin, institution_id')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch user profile'
        },
        { status: 500 }
      );
    }

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

    // Check for bulk upload permission
    const permissions = rolePermissions?.permissions || {};
    const hasPermission =
      permissions['all'] === true ||
      permissions['learners.profiles.bulk_upload'] === true ||
      profile.is_super_admin;

    if (!hasPermission) {
      return NextResponse.json(
        {
          success: false,
          error: 'You do not have permission to bulk upload learner profiles'
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
    const parseResult = await parseExcelFile(file);

    if (parseResult.errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: parseResult.errors.join(', ')
        },
        { status: 400 }
      );
    }

    if (parseResult.totalRows === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No data found in file'
        },
        { status: 400 }
      );
    }

    // 5. Map and validate rows
    const bulkUploadRows: BulkUploadRow[] = [];

    for (const parsedRow of parseResult.rows) {
      // Map columns
      const mappedData = mapColumns(parsedRow.data, COLUMN_MAPPING);

      // Sanitize values for ALL fields
      const sanitizedData = {
        // Basic Details
        first_name: sanitizeValue(mappedData.first_name, 'text'),
        last_name: sanitizeValue(mappedData.last_name, 'text'),
        date_of_birth: sanitizeValue(mappedData.date_of_birth, 'date'),
        gender: normalizeDropdownValue(mappedData.gender, GENDER_VALUES),
        religion: normalizeDropdownValue(mappedData.religion, RELIGION_VALUES),
        community: normalizeDropdownValue(mappedData.community, COMMUNITY_VALUES),
        caste: sanitizeValue(mappedData.caste, 'text'),
        aadhar_number: sanitizeValue(mappedData.aadhar_number, 'number'),
        blood_group: normalizeDropdownValue(mappedData.blood_group, BLOOD_GROUP_VALUES),
        admission_year: mappedData.admission_year ? parseInt(mappedData.admission_year) : undefined,

        // Parent/Guardian Information
        father_name: sanitizeValue(mappedData.father_name, 'text'),
        father_occupation: sanitizeValue(mappedData.father_occupation, 'text'),
        father_mobile: sanitizeValue(mappedData.father_mobile, 'mobile'),
        mother_name: sanitizeValue(mappedData.mother_name, 'text'),
        mother_occupation: sanitizeValue(mappedData.mother_occupation, 'text'),
        mother_mobile: sanitizeValue(mappedData.mother_mobile, 'mobile'),
        annual_income: sanitizeValue(mappedData.annual_income, 'number'),

        // Academic Assignment (will be converted from names to IDs below)
        institution_id: mappedData.institution_id || undefined,
        degree_id: mappedData.degree_id || undefined,
        department_id: mappedData.department_id || undefined,
        program_id: mappedData.program_id || undefined,
        semester_id: mappedData.semester_id || undefined,
        section_id: mappedData.section_id || undefined,
        academic_year_id: mappedData.academic_year_id || undefined,
        regulation_id: mappedData.regulation_id || undefined,
        batch_id: mappedData.batch_id || undefined,
        // Name fields for conversion
        _institution_name: mappedData.institution_name,
        _degree_name: mappedData.degree_name,
        _department_name: mappedData.department_name,
        _program_name: mappedData.program_name,
        _semester_name: mappedData.semester_name,
        _section_name: mappedData.section_name,
        _academic_year_name: mappedData.academic_year_name,
        _regulation_name: mappedData.regulation_name,
        _batch_name: mappedData.batch_name,

        // Contact Details
        student_mobile: sanitizeValue(mappedData.student_mobile, 'mobile'),
        college_email: sanitizeValue(mappedData.college_email, 'email'),
        student_email: sanitizeValue(mappedData.student_email, 'email'),

        // Address Information
        permanent_address_street: sanitizeValue(mappedData.permanent_address_street, 'text'),
        permanent_address_taluk: sanitizeValue(mappedData.permanent_address_taluk, 'text'),
        permanent_address_district: sanitizeValue(mappedData.permanent_address_district, 'text'),
        permanent_address_pin_code: sanitizeValue(mappedData.permanent_address_pin_code, 'number'),
        permanent_address_state: sanitizeValue(mappedData.permanent_address_state, 'text'),

        // Entry Type
        entry_type: normalizeDropdownValue(mappedData.entry_type, ENTRY_TYPE_VALUES),
        first_graduate: mappedData.first_graduate === 'TRUE' || mappedData.first_graduate === true,

        // Previous Education
        last_school: sanitizeValue(mappedData.last_school, 'text'),
        board_of_study: sanitizeValue(mappedData.board_of_study, 'text'),
        tenth_marks: {
          max_marks: mappedData.tenth_max_marks || '',
          obtained_marks: mappedData.tenth_obtained_marks || '',
          percentage: mappedData.tenth_percentage || ''
        },
        twelfth_marks: {
          group: sanitizeValue(mappedData.twelfth_group, 'text'),
          max_marks: mappedData.twelfth_max_marks || '',
          obtained_marks: mappedData.twelfth_obtained_marks || '',
          percentage: mappedData.twelfth_percentage || '',
          subjects: {}
        },

        // Entrance Exam Details
        medical_cutoff_marks: mappedData.medical_cutoff_marks || '',
        engineering_cutoff_marks: mappedData.engineering_cutoff_marks || '',
        neet_roll_number: mappedData.neet_roll_number || '',
        neet_score: mappedData.neet_score || '',
        counseling_applied: mappedData.counseling_applied === 'TRUE' || mappedData.counseling_applied === true,
        counseling_number: mappedData.counseling_number || '',

        // Accommodation Details
        accommodation_type: normalizeDropdownValue(mappedData.accommodation_type, ACCOMMODATION_VALUES),
        hostel_type: normalizeDropdownValue(mappedData.hostel_type, HOSTEL_TYPE_VALUES),
        food_type: normalizeDropdownValue(mappedData.food_type, FOOD_TYPE_VALUES),
        bus_required: mappedData.bus_required === 'TRUE' || mappedData.bus_required === true,
        bus_route: sanitizeValue(mappedData.bus_route, 'text'),
        bus_pickup_location: sanitizeValue(mappedData.bus_pickup_location, 'text'),

        // Reference Information
        reference_type: sanitizeValue(mappedData.reference_type, 'text'),
        reference_name: sanitizeValue(mappedData.reference_name, 'text'),
        reference_contact: sanitizeValue(mappedData.reference_contact, 'number'),

        // Student Specific
        roll_number: mappedData.roll_number || '',
        register_number: mappedData.register_number || '',
        quota: normalizeDropdownValue(mappedData.quota, QUOTA_VALUES),
        category: sanitizeValue(mappedData.category, 'text'),
        student_photo_url: mappedData.student_photo_url || '',
      };

      // Convert names to IDs if name fields are provided
      console.log(`[bulk-upload-api] Row ${parsedRow.rowNumber}: Starting name-to-ID resolution`);
      console.log(`[bulk-upload-api] Row ${parsedRow.rowNumber}: Names provided:`, {
        institution: sanitizedData._institution_name,
        department: sanitizedData._department_name,
        program: sanitizedData._program_name,
        semester: sanitizedData._semester_name,
        section: sanitizedData._section_name
      });

      // Institution
      if (sanitizedData._institution_name && !sanitizedData.institution_id) {
        console.log(`[bulk-upload-api] Row ${parsedRow.rowNumber}: Resolving institution "${sanitizedData._institution_name}"`);
        const instResult = await NameToIdResolver.resolveInstitutionId(sanitizedData._institution_name);
        console.log(`[bulk-upload-api] Row ${parsedRow.rowNumber}: Institution result:`, instResult);
        if (instResult.found && instResult.id) {
          sanitizedData.institution_id = instResult.id;
        }
      }

      // For non-super-admins, use their institution_id if not provided
      if (!sanitizedData.institution_id && profile.institution_id) {
        sanitizedData.institution_id = profile.institution_id;
      }

      // Degree
      if (sanitizedData._degree_name && !sanitizedData.degree_id) {
        const degreeResult = await NameToIdResolver.resolveDegreeId(
          sanitizedData._degree_name,
          sanitizedData.institution_id
        );
        if (degreeResult.found && degreeResult.id) {
          sanitizedData.degree_id = degreeResult.id;
        }
      }

      // Department
      if (sanitizedData._department_name && !sanitizedData.department_id) {
        const deptResult = await NameToIdResolver.resolveDepartmentId(
          sanitizedData._department_name,
          sanitizedData.institution_id
        );
        if (deptResult.found && deptResult.id) {
          sanitizedData.department_id = deptResult.id;
        }
      }

      // Program
      if (sanitizedData._program_name && !sanitizedData.program_id) {
        console.log(`[bulk-upload-api] Row ${parsedRow.rowNumber}: Resolving program "${sanitizedData._program_name}" with institution_id:`, sanitizedData.institution_id, 'department_id:', sanitizedData.department_id);
        const progResult = await NameToIdResolver.resolveProgramId(
          sanitizedData._program_name,
          sanitizedData.institution_id,
          sanitizedData.department_id
        );
        console.log(`[bulk-upload-api] Row ${parsedRow.rowNumber}: Program result:`, progResult);
        if (progResult.found && progResult.id) {
          sanitizedData.program_id = progResult.id;
        } else {
          console.error(`[bulk-upload-api] Row ${parsedRow.rowNumber}: ❌ FAILED to resolve program "${sanitizedData._program_name}"`);
        }
      }

      // Semester
      if (sanitizedData._semester_name && !sanitizedData.semester_id) {
        console.log(`[bulk-upload-api] Row ${parsedRow.rowNumber}: Resolving semester "${sanitizedData._semester_name}" with institution_id:`, sanitizedData.institution_id, 'program_id:', sanitizedData.program_id);
        const semResult = await NameToIdResolver.resolveSemesterId(
          sanitizedData._semester_name,
          sanitizedData.institution_id,
          sanitizedData.program_id
        );
        console.log(`[bulk-upload-api] Row ${parsedRow.rowNumber}: Semester result:`, semResult);
        if (semResult.found && semResult.id) {
          sanitizedData.semester_id = semResult.id;
        } else {
          console.error(`[bulk-upload-api] Row ${parsedRow.rowNumber}: ❌ FAILED to resolve semester "${sanitizedData._semester_name}"`);
        }
      }

      // Section
      if (sanitizedData._section_name && !sanitizedData.section_id) {
        console.log(`[bulk-upload-api] Row ${parsedRow.rowNumber}: Resolving section "${sanitizedData._section_name}" with institution_id:`, sanitizedData.institution_id, 'semester_id:', sanitizedData.semester_id);
        const secResult = await NameToIdResolver.resolveSectionId(
          sanitizedData._section_name,
          sanitizedData.institution_id,
          sanitizedData.semester_id
        );
        console.log(`[bulk-upload-api] Row ${parsedRow.rowNumber}: Section result:`, secResult);
        if (secResult.found && secResult.id) {
          sanitizedData.section_id = secResult.id;
        } else {
          console.error(`[bulk-upload-api] Row ${parsedRow.rowNumber}: ❌ FAILED to resolve section "${sanitizedData._section_name}"`);
        }
      }

      // Academic Year
      if (sanitizedData._academic_year_name && !sanitizedData.academic_year_id) {
        const yearResult = await NameToIdResolver.resolveAcademicYearId(
          sanitizedData._academic_year_name,
          sanitizedData.institution_id
        );
        if (yearResult.found && yearResult.id) {
          sanitizedData.academic_year_id = yearResult.id;
        }
      }

      // Regulation
      if (sanitizedData._regulation_name && !sanitizedData.regulation_id) {
        const regResult = await NameToIdResolver.resolveRegulationId(
          sanitizedData._regulation_name,
          sanitizedData.institution_id
        );
        if (regResult.found && regResult.id) {
          sanitizedData.regulation_id = regResult.id;
        }
      }

      // Batch
      if (sanitizedData._batch_name && !sanitizedData.batch_id) {
        const batchResult = await NameToIdResolver.resolveBatchId(
          sanitizedData._batch_name,
          sanitizedData.institution_id
        );
        if (batchResult.found && batchResult.id) {
          sanitizedData.batch_id = batchResult.id;
        }
      }

      // Remove temporary name fields before validation
      delete (sanitizedData as any)._institution_name;
      delete (sanitizedData as any)._degree_name;
      delete (sanitizedData as any)._department_name;
      delete (sanitizedData as any)._program_name;
      delete (sanitizedData as any)._semester_name;
      delete (sanitizedData as any)._section_name;
      delete (sanitizedData as any)._academic_year_name;
      delete (sanitizedData as any)._regulation_name;
      delete (sanitizedData as any)._batch_name;

      // Validate row
      const validation = LearnerValidationService.validateBulkUploadProfile(sanitizedData);

      bulkUploadRows.push({
        rowNumber: parsedRow.rowNumber,
        data: sanitizedData,
        validation
      });
    }

    // 6. Process bulk upload
    const result = await BulkLearnerUploadService.processBulkUpload(bulkUploadRows);

    // 7. Return result
    return NextResponse.json(result);

  } catch (error) {
    console.error('[api/learners/bulk-upload-profiles] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
