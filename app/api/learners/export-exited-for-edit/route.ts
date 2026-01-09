// ============================================
// EXPORT ACTIVE LEARNERS FOR EDIT API
// ============================================
// Created: 2025-01-22
// Updated: 2025-01-22 - Changed to work with ACTIVE learners, added degree and section filters
// Purpose: Download active learners' data for bulk editing
// Endpoint: GET /api/learners/export-exited-for-edit
// Note: Despite endpoint name, this now works with ACTIVE learners
// Filters: Institution → Degree → Department → Program → Semester → Section
// ============================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BulkLearnerEditService } from '@/lib/services/bulk-learner-edit-service';
import * as XLSX from 'xlsx';


/**
 * GET /api/learners/export-exited-for-edit
 * Download exited learners with current data for bulk editing
 */
export async function GET(request: NextRequest) {
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

    // 3. Parse query parameters
    const { searchParams } = new URL(request.url);
    const includeComplete = searchParams.get('include_complete') === 'true';

    // 4. Get institution filter (non-super-admins can only see their institution)
    const institutionId = profile.is_super_admin
      ? searchParams.get('institution_id') || undefined
      : profile.institution_id || undefined;

    // Get additional filters
    const degreeId = searchParams.get('degree_id') || undefined;
    const departmentId = searchParams.get('department_id') || undefined;
    const programId = searchParams.get('program_id') || undefined;
    const semesterId = searchParams.get('semester_id') || undefined;
    const sectionId = searchParams.get('section_id') || undefined;

    console.log('[export-exited] Request parameters:', {
      includeComplete,
      institutionId,
      degreeId,
      departmentId,
      programId,
      semesterId,
      sectionId,
      isSuperAdmin: profile.is_super_admin,
      userInstitutionId: profile.institution_id
    });

    // 5. Export active learners
    const learners = await BulkLearnerEditService.exportActiveForEdit(
      institutionId,
      includeComplete,
      degreeId,
      departmentId,
      programId,
      semesterId,
      sectionId
    );

    console.log('[export-active] Learners fetched:', learners.length);

    // Check if no data found
    if (learners.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'No active learners found matching the criteria. Try enabling "Include Complete Profiles" or adjusting filters.'
        },
        { status: 404 }
      );
    }

    // 6. Generate Excel file
    const workbook = XLSX.utils.book_new();

    // Prepare data for Excel - ALL FIELDS
    const excelData = learners.map(learner => ({
      // REQUIRED: ID for matching (read-only)
      'ID*': learner.id,

      // SECTION 1: Basic Details
      'First Name': learner.first_name || '',
      'Last Name': learner.last_name || '',
      'Date of Birth': learner.date_of_birth || '',
      'Gender': learner.gender || '',
      'Religion': learner.religion || '',
      'Community': learner.community || '',
      'Caste': learner.caste || '',
      'Aadhar Number': learner.aadhar_number || '',
      'Blood Group': learner.blood_group || '',
      'Admission Year': learner.admission_year || '',

      // SECTION 2: Parent/Guardian Information
      'Father Name': learner.father_name || '',
      'Father Occupation': learner.father_occupation || '',
      'Father Mobile': learner.father_mobile || '',
      'Mother Name': learner.mother_name || '',
      'Mother Occupation': learner.mother_occupation || '',
      'Mother Mobile': learner.mother_mobile || '',
      'Annual Income': learner.annual_income || '',

      // SECTION 3: Academic Assignment
      'Institution': learner.institution?.name || '',
      'Degree': learner.degree?.degree_name || '',
      'Department': learner.department?.department_name || '',
      'Program': learner.program?.program_name || '',
      'Semester': learner.semester?.semester_name || '',
      'Section': learner.section?.section_name || '',
      'Academic Year': learner.academic_year?.academic_year_name || '',
      'Regulation': learner.regulation?.regulation_code || learner.regulation?.regulation_year || '',
      'Batch': learner.batch?.batch_name || '',

      // SECTION 4: Contact Details
      'Student Mobile': learner.mobile || '',
      'College Email': learner.college_email || '',
      'Personal Email': learner.student_email || '',

      // SECTION 5: Address Information
      'Permanent Address Street': learner.permanent_address_street || '',
      'Permanent Address Taluk': learner.permanent_address_taluk || '',
      'Permanent Address District': learner.permanent_address_district || '',
      'Permanent Address Pin Code': learner.permanent_address_pin_code || '',
      'Permanent Address State': learner.permanent_address_state || '',

      // SECTION 6: Entry Type
      'Entry Type': learner.entry_type || '',
      'Scholarship Type': learner.scholarship_type || '',

      // SECTION 7: Previous Education
      'Last School': learner.last_school || '',
      'Board of Study': learner.board_of_study || '',
      '10th Max Marks': learner.tenth_marks?.max_marks || '',
      '10th Obtained Marks': learner.tenth_marks?.obtained_marks || '',
      '10th Percentage': learner.tenth_marks?.percentage || '',
      '12th Group': learner.twelfth_marks?.group || '',
      '12th Max Marks': learner.twelfth_marks?.max_marks || '',
      '12th Obtained Marks': learner.twelfth_marks?.obtained_marks || '',
      '12th Percentage': learner.twelfth_marks?.percentage || '',

      // SECTION 8: Entrance Exam Details
      'Medical Cutoff Marks': learner.medical_cutoff_marks || '',
      'Engineering Cutoff Marks': learner.engineering_cutoff_marks || '',
      'NEET Roll Number': learner.neet_roll_number || '',
      'NEET Score': learner.neet_score || '',
      'Counseling Applied': learner.counseling_applied ? 'TRUE' : 'FALSE',
      'Counseling Number': learner.counseling_number || '',

      // SECTION 9: Accommodation Details
      'Accommodation Type': learner.accommodation_type || '',
      'Hostel Type': learner.hostel_type || '',
      'Food Type': learner.food_type || '',
      'Bus Required': learner.bus_required ? 'TRUE' : 'FALSE',
      'Bus Route': learner.bus_route || '',
      'Bus Pickup Location': learner.bus_pickup_location || '',

      // SECTION 10: Reference Information
      'Reference Type': learner.reference_type || '',
      'Reference Name': learner.reference_name || '',
      'Reference Contact': learner.reference_contact || '',

      // SECTION 11: Student Specific
      'Roll Number': learner.roll_number || '',
      'Register Number': learner.register_number || '',
      'Quota': learner.quota || '',
      'Category': learner.category || '',
      'Photo URL': learner.student_photo_url || '',
    }));

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Set column widths for better readability
    const baseWidth = 20;
    worksheet['!cols'] = Array(Object.keys(excelData[0] || {}).length).fill({ wch: baseWidth });

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Active Learners');

    // Add instructions sheet
    const instructions = [
      { 'A': '📋 BULK EDIT ACTIVE LEARNERS - INSTRUCTIONS' },
      { 'A': '' },
      { 'A': '⚠️ IMPORTANT NOTES' },
      { 'A': '1. Do NOT modify the ID* column - it is used to match records' },
      { 'A': '2. Do NOT rename the "Active Learners" sheet - it must keep this exact name' },
      { 'A': '3. Fill in ONLY the empty or missing fields you want to update' },
      { 'A': '4. Leave cells blank to keep existing values unchanged' },
      { 'A': '5. You can update partial data - not all fields are required' },
      { 'A': '6. Only learners in "Active" status can be updated via this feature' },
      { 'A': '' },
      { 'A': '📝 ALL EDITABLE FIELDS (11 SECTIONS)' },
      { 'A': '' },
      { 'A': 'SECTION 1: Basic Details' },
      { 'A': '• First Name, Last Name, Date of Birth, Gender' },
      { 'A': '• Religion, Community, Caste, Aadhar Number' },
      { 'A': '• Blood Group, Admission Year' },
      { 'A': '' },
      { 'A': 'SECTION 2: Parent/Guardian Information' },
      { 'A': '• Father Name, Father Occupation, Father Mobile' },
      { 'A': '• Mother Name, Mother Occupation, Mother Mobile' },
      { 'A': '• Annual Income' },
      { 'A': '' },
      { 'A': 'SECTION 3: Academic Assignment' },
      { 'A': '• Institution, Degree, Department' },
      { 'A': '• Program, Semester, Section' },
      { 'A': '• Academic Year, Regulation, Batch' },
      { 'A': '  Note: These fields show names for readability (view-only in Excel)' },
      { 'A': '' },
      { 'A': 'SECTION 4: Contact Details' },
      { 'A': '• Student Mobile, College Email, Personal Email' },
      { 'A': '' },
      { 'A': 'SECTION 5: Address Information' },
      { 'A': '• Street, Taluk, District, Pin Code, State' },
      { 'A': '' },
      { 'A': 'SECTION 6: Entry Type & Scholarship' },
      { 'A': '• Entry Type, Scholarship Type (First Graduate / PMS / 7.5% / Not Applicable)' },
      { 'A': '' },
      { 'A': 'SECTIONS 7-11: Optional Fields' },
      { 'A': '• Previous Education (School, Board, 10th & 12th Marks)' },
      { 'A': '• Entrance Exams (NEET, Cutoff Marks, Counseling)' },
      { 'A': '• Accommodation (Hostel, Food, Bus Details)' },
      { 'A': '• Reference Information' },
      { 'A': '• Student Specific (Roll Number, Register Number, Quota, Category)' },
      { 'A': '' },
      { 'A': '❌ PROTECTED FIELDS (Cannot be updated)' },
      { 'A': '• ID*, Institution, Lifecycle Status, Created At' },
      { 'A': '' },
      { 'A': '📤 UPLOAD STEPS' },
      { 'A': 'Step 1: Fill in the missing fields in the "Active Learners" sheet' },
      { 'A': 'Step 2: Save the file' },
      { 'A': 'Step 3: Upload via the Bulk Edit dialog in MyJKKN' },
      { 'A': 'Step 4: Review the update summary' },
    ];

    const wsInstructions = XLSX.utils.json_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(workbook, wsInstructions, '📖 Instructions');

    // 7. Convert to buffer and return
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set response headers for file download
    const filename = `active-learners-${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });

  } catch (error) {
    console.error('[api/learners/export-exited-for-edit] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
