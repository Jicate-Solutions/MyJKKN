export const dynamic = 'force-dynamic';

// ============================================
// EXPORT ENQUIRIES (NON-ACTIVE LEARNERS) FOR BULK EDIT
// ============================================
// Created: 2026-06-29
// Purpose: Download every admission-lifecycle record (all statuses EXCEPT
//   'active') so a super admin can bulk-edit a safe subset of fields and
//   re-upload. Active learners are managed in /learners/profiles, not here.
// Endpoint: GET /api/learners/enquiries/export-for-edit
// Access: SUPER ADMIN ONLY (UI gate + this server check).
// Reuses BulkLearnerEditService.exportActiveForEdit(..., 'non_active').
// ============================================

import { NextRequest, NextResponse, connection } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { BulkLearnerEditService } from '@/lib/services/bulk-learner-edit-service';
import * as XLSX from 'xlsx';

export async function GET(_request: NextRequest) {
  await connection();
  try {
    // 1. Authenticate
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Super-admin-only gate (server-side, not just the hidden UI button)
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_super_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profileData) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch user profile' },
        { status: 500 }
      );
    }

    if (!profileData.is_super_admin) {
      return NextResponse.json(
        { success: false, error: 'This export is restricted to super admins.' },
        { status: 403 }
      );
    }

    // 3. Fetch ALL non-active learners (every lifecycle stage except 'active').
    //    No institution / academic filters — the export is always everything.
    const learners = await BulkLearnerEditService.exportActiveForEdit(
      undefined, // institutionId
      true, // includeComplete (ignored for non_active scope)
      undefined, // degreeId
      undefined, // departmentId
      undefined, // programId
      undefined, // semesterId
      undefined, // sectionId
      'non_active'
    );

    if (learners.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No enquiry-stage learners found to export.' },
        { status: 404 }
      );
    }

    // 4. Build the workbook.
    //    Editable column headers MUST match the bulk-edit COLUMN_MAPPING aliases.
    //    Read-only context columns get a " (read-only)" suffix so they never map
    //    back — edits to them are silently ignored on re-import.
    const excelData = learners.map((learner) => ({
      // 🔒 Match key + read-only context (DO NOT EDIT)
      'ID*': learner.id,
      'Application ID (read-only)': learner.application_id || '',
      'Lifecycle Status (read-only)': learner.lifecycle_status || '',

      // ✏️ SECTION 1: Basic Details
      'First Name': learner.first_name || '',
      'Last Name': learner.last_name || '',
      'Date of Birth': learner.date_of_birth || '',
      'Gender': learner.gender || '',
      'Religion': learner.religion || '',
      'Community': learner.community_ref?.code || '',
      'Caste': learner.caste_ref?.name || '',
      'Aadhar Number': learner.aadhar_number || '',
      'Blood Group': learner.blood_group || '',

      // ✏️ SECTION 2: Parent/Guardian Information
      'Father Name': learner.father_name || '',
      'Father Occupation': learner.father_occupation || '',
      'Father Mobile': learner.father_mobile || '',
      'Mother Name': learner.mother_name || '',
      'Mother Occupation': learner.mother_occupation || '',
      'Mother Mobile': learner.mother_mobile || '',
      'Annual Income': learner.annual_income || '',

      // ✏️ SECTION 4: Contact Details
      'Student Mobile': learner.student_mobile || '',
      'College Email': learner.college_email || '',
      'Personal Email': learner.student_email || '',

      // ✏️ SECTION 5: Address Information
      'Permanent Address Street': learner.permanent_address_street || '',
      'Permanent Address Taluk': learner.permanent_address_taluk || '',
      'Permanent Address District': learner.permanent_address_district || '',
      'Permanent Address Pin Code': learner.permanent_address_pin_code || '',
      'Permanent Address State': learner.permanent_address_state || '',

      // ✏️ SECTION 7: Previous Education
      'Last School': learner.last_school || '',
      'Board of Study': learner.board_of_study || '',
      '10th Max Marks': learner.tenth_marks?.max_marks || '',
      '10th Obtained Marks': learner.tenth_marks?.obtained_marks || '',
      '10th Percentage': learner.tenth_marks?.percentage || '',
      '12th Group': learner.twelfth_marks?.group || '',
      '12th Max Marks': learner.twelfth_marks?.max_marks || '',
      '12th Obtained Marks': learner.twelfth_marks?.obtained_marks || '',
      '12th Percentage': learner.twelfth_marks?.percentage || '',

      // ✏️ SECTION 8: Entrance Exam Details
      'Medical Cutoff Marks': learner.medical_cutoff_marks || '',
      'Engineering Cutoff Marks': learner.engineering_cutoff_marks || '',
      'NEET Roll Number': learner.neet_roll_number || '',
      'NEET Score': learner.neet_score || '',

      // ✏️ SECTION 10: Reference Information
      'Reference Type': learner.reference_type || '',
      'Reference Name': learner.reference_name || '',
      'Reference Contact': learner.reference_contact || '',

      // 🔒 Read-only context (names for reference; cannot be edited here)
      'Institution (read-only)': learner.institution?.name || '',
      'Degree (read-only)': learner.degree?.degree_name || '',
      'Department (read-only)': learner.department?.department_name || '',
      'Program (read-only)': learner.program?.program_name || '',
      'Semester (read-only)': learner.semester?.semester_name || '',
      'Section (read-only)': learner.section?.section_name || '',
      'Academic Year (read-only)': learner.academic_year?.academic_year_name || '',
      'Admission Year (read-only)':
        (learner as any).admission_year_obj?.year ?? learner.admission_year ?? '',
      'Entry Type (read-only)': learner.entry_type || '',
      'Scholarship Type (read-only)': learner.scholarship_type || '',
      'Accommodation Type (read-only)': learner.accommodation_ref?.name || '',
      'Quota (read-only)': learner.quota_ref?.name || ''
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    worksheet['!cols'] = Array(Object.keys(excelData[0] || {}).length).fill({ wch: 20 });
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Enquiries');

    // Instructions sheet
    const instructions = [
      { A: '📋 BULK EDIT ENQUIRY LEARNERS - INSTRUCTIONS (SUPER ADMIN)' },
      { A: '' },
      { A: '⚠️ IMPORTANT' },
      { A: '1. Do NOT modify the "ID*" column - it matches each row to its record.' },
      { A: '2. Do NOT rename the "Enquiries" sheet - it must keep this exact name.' },
      { A: '3. Fill ONLY the fields you want to change. Leave a cell blank to keep its current value.' },
      { A: '4. Only existing records are updated - no new records are created here.' },
      { A: '5. Every status EXCEPT "active" is included (active learners live in Profiles).' },
      { A: '' },
      { A: '✏️ EDITABLE FIELDS' },
      { A: '• Basic Details (Name, DOB, Gender, Religion, Community, Caste, Aadhar, Blood Group)' },
      { A: '• Parent/Guardian (Father/Mother Name, Occupation, Mobile, Annual Income)' },
      { A: '• Contact (Student Mobile, College Email, Personal Email)' },
      { A: '• Address (Street, Taluk, District, Pin Code, State)' },
      { A: '• Education (Last School, Board, 10th & 12th Marks)' },
      { A: '• Entrance Exam (Medical/Engineering Cutoff, NEET Roll/Score)' },
      { A: '• Reference (Type, Name, Contact)' },
      { A: '' },
      { A: '🔒 READ-ONLY (columns suffixed "(read-only)") - shown for reference only' },
      { A: '• Application ID, Lifecycle Status' },
      { A: '• Institution, Degree, Department, Program, Semester, Section, Academic Year, Admission Year' },
      { A: '• Entry Type, Scholarship Type, Accommodation Type, Quota' },
      { A: '  Any edits to these columns are ignored on upload.' },
      { A: '' },
      { A: '📤 UPLOAD STEPS' },
      { A: 'Step 1: Edit the fields you want in the "Enquiries" sheet.' },
      { A: 'Step 2: Save the file (.xlsx).' },
      { A: 'Step 3: Upload via the Bulk Edit dialog, review the preview, then confirm.' }
    ];
    const wsInstructions = XLSX.utils.json_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(workbook, wsInstructions, '📖 Instructions');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `enquiries-bulk-edit-${new Date().toISOString().split('T')[0]}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString()
      }
    });
  } catch (error) {
    console.error('[api/learners/enquiries/export-for-edit] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'An internal server error occurred.'
      },
      { status: 500 }
    );
  }
}
