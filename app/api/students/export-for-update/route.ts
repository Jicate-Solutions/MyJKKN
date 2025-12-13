import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import type { Database } from '@/types/supabase';

// Helper function to fetch all students with pagination to overcome Supabase 1000-row limit
async function fetchAllStudentsForExport(
  supabase: any,
  selectQuery: string,
  applyFilters: (query: any) => any
): Promise<{ data: any[] | null; error: any }> {
  const PAGE_SIZE = 1000;
  let allStudents: any[] = [];
  let currentPage = 0;
  let hasMore = true;

  try {
    while (hasMore) {
      let query = supabase
        .from('students')
        .select(selectQuery)
        .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1)
        .order('created_at', { ascending: false });

      // Apply filters
      query = applyFilters(query);

      const { data: pageData, error } = await query;

      if (error) {
        return { data: null, error };
      }

      if (pageData && pageData.length > 0) {
        allStudents = allStudents.concat(pageData);
        console.log(`[export-for-update] Fetched page ${currentPage + 1}: ${pageData.length} records (total: ${allStudents.length})`);
        currentPage++;

        if (pageData.length < PAGE_SIZE) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    console.log(`[export-for-update] Total students fetched: ${allStudents.length}`);
    return { data: allStudents, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

// Define columns for onboarding export
const EXPORT_COLUMNS = [
  // Required for matching
  { key: 'id', header: 'Student ID *' },

  // Reference fields (read-only, for user reference)
  { key: 'first_name', header: 'First Name' },
  { key: 'last_name', header: 'Last Name' },
  { key: 'student_mobile', header: 'Mobile' },
  { key: 'student_email', header: 'Personal Email' },

  // Current program info (read-only)
  { key: 'program.program_name', header: 'Current Program' },
  { key: 'department.department_name', header: 'Current Department' },

  // Onboarding fields (can be updated if empty)
  { key: 'roll_number', header: 'Roll Number' },
  { key: 'college_email', header: 'College Email' },
  { key: 'academic_year_id', header: 'Academic Year ID' },
  { key: 'semester_id', header: 'Semester ID' },
  { key: 'section_id', header: 'Section ID' },
  { key: 'student_photo_url', header: 'Photo URL' },

  // Status
  { key: 'status', header: 'Status' },
  { key: 'is_profile_complete', header: 'Profile Complete' }
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Create Supabase Admin Client
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Extract filter values
    const institution = searchParams.get('institution');
    const department = searchParams.get('department');
    const program = searchParams.get('program');
    const semester = searchParams.get('semester');
    const section = searchParams.get('section');
    const status = searchParams.get('status');

    // Select query with all related data
    const selectQuery = `
      *,
      institution:institutions!institution_id(id, name),
      degree:degrees!degree_id(id, degree_name),
      department:departments!department_id(id, department_name),
      program:programs!program_id(id, program_name),
      semester:semesters!semester_id(id, semester_name),
      section:sections!section_id(id, section_name),
      academic_year:academic_years!academic_year_id(id, academic_year_name)
    `;

    // Use paginated fetch to overcome Supabase 1000-row limit
    const { data: students, error } = await fetchAllStudentsForExport(
      supabaseAdmin,
      selectQuery,
      (query) => {
        // Only fetch incomplete profiles
        query = query.eq('is_profile_complete', false);

        // Apply filters from query params
        if (institution) {
          query = query.eq('institution_id', institution);
        }
        if (department) {
          query = query.eq('department_id', department);
        }
        if (program) {
          query = query.eq('program_id', program);
        }
        if (semester) {
          query = query.eq('semester_id', semester);
        }
        if (section) {
          query = query.eq('section_id', section);
        }
        if (status) {
          query = query.eq('status', status);
        }
        return query;
      }
    );

    if (error) {
      console.error('Error fetching students for export:', error);
      throw new Error('Database error fetching student data');
    }

    if (!students || students.length === 0) {
      return NextResponse.json(
        {
          message:
            'No incomplete student profiles found based on the selected filters.'
        },
        { status: 404 }
      );
    }

    // Prepare main data sheet
    const headers = EXPORT_COLUMNS.map((col) => col.header);
    const studentData = students.map((student) => {
      const row: Record<string, any> = {};
      EXPORT_COLUMNS.forEach((col) => {
        if (!col.key.includes('.')) {
          row[col.header] = (student as any)[col.key] ?? '';
        } else {
          const keys = col.key.split('.');
          let value = student as any;
          for (const k of keys) {
            value = value?.[k];
            if (value === undefined || value === null) break;
          }
          row[col.header] = value ?? '';
        }

        // Format booleans
        if (typeof row[col.header] === 'boolean') {
          row[col.header] = row[col.header] ? 'Yes' : 'No';
        }
      });
      return row;
    });

    // Fetch reference data for helper sheets
    const { data: academicYears } = await supabaseAdmin
      .from('academic_years')
      .select('id, academic_year_name, start_date, end_date, is_active')
      .eq('is_active', true)
      .order('start_date', { ascending: false });

    const { data: semesters } = await supabaseAdmin
      .from('semesters')
      .select('id, semester_name, semester_code')
      .order('semester_name');

    const { data: sections } = await supabaseAdmin
      .from('sections')
      .select('id, section_name')
      .order('section_name');

    // Create Excel workbook with multiple sheets
    const wb = XLSX.utils.book_new();

    // Sheet 1: Student Data
    const ws1 = XLSX.utils.json_to_sheet(studentData, { header: headers });
    ws1['!cols'] = headers.map(() => ({ wch: 20 }));
    XLSX.utils.book_append_sheet(wb, ws1, 'Students for Update');

    // Sheet 2: Academic Years Reference
    if (academicYears && academicYears.length > 0) {
      const ayData = academicYears.map((ay: any): Record<string, any> => ({
        'Academic Year ID': ay.id,
        'Academic Year Name': ay.academic_year_name,
        'Start Date': ay.start_date,
        'End Date': ay.end_date,
        Active: ay.is_active ? 'Yes' : 'No'
      }));
      const ws2 = XLSX.utils.json_to_sheet(ayData);
      ws2['!cols'] = [
        { wch: 40 },
        { wch: 20 },
        { wch: 15 },
        { wch: 15 },
        { wch: 10 }
      ];
      XLSX.utils.book_append_sheet(wb, ws2, 'Academic Years');
    }

    // Sheet 3: Semesters Reference
    if (semesters && semesters.length > 0) {
      const semData = semesters.map((sem: any) => ({
        'Semester ID': sem.id,
        'Semester Name': sem.semester_name,
        'Semester Code': sem.semester_code
      }));
      const ws3 = XLSX.utils.json_to_sheet(semData);
      ws3['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Semesters');
    }

    // Sheet 4: Sections Reference
    if (sections && sections.length > 0) {
      const secData = sections.map((sec: any) => ({
        'Section ID': sec.id,
        'Section Name': sec.section_name
      }));
      const ws4 = XLSX.utils.json_to_sheet(secData);
      ws4['!cols'] = [{ wch: 40 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws4, 'Sections');
    }

    // Sheet 5: Instructions
    const instructions = [
      {
        '': 'BULK UPDATE INSTRUCTIONS'
      },
      { '': '' },
      {
        '': 'IMPORTANT: This file contains students with INCOMPLETE profiles.'
      },
      {
        '': 'Only EMPTY fields will be updated. Existing data will NOT be overwritten.'
      },
      { '': '' },
      { '': 'STEP 1: Fill in missing information' },
      {
        '': '- Go to "Students for Update" sheet'
      },
      {
        '': '- Fill ONLY the empty cells in the onboarding columns (Roll Number, College Email, etc.)'
      },
      {
        '': '- DO NOT modify the Student ID column - it is used for matching records'
      },
      { '': '' },
      { '': 'STEP 2: Use reference sheets for IDs' },
      {
        '': '- Academic Years: Copy the ID from "Academic Years" sheet'
      },
      { '': '- Semesters: Copy the ID from "Semesters" sheet' },
      { '': '- Sections: Copy the ID from "Sections" sheet' },
      { '': '' },
      { '': 'STEP 3: Upload the file' },
      {
        '': '- Save this file after filling the data'
      },
      {
        '': '- Go to Students > Learners Onboarding page'
      },
      {
        '': '- Click "Bulk Update Students" button'
      },
      { '': '- Upload this file' },
      { '': '' },
      { '': 'ONBOARDING FIELDS (Required for profile completion):' },
      { '': '1. Roll Number' },
      { '': '2. College Email (must end with @jkkn.ac.in)' },
      { '': '3. Academic Year ID' },
      { '': '4. Semester ID' },
      { '': '5. Section ID' },
      { '': '6. Photo URL (optional)' },
      { '': '' },
      { '': 'AUTOMATIC USER CREATION:' },
      {
        '': 'When all 5 required fields are filled, a user account will be automatically created!'
      },
      { '': '' },
      { '': 'SAFETY FEATURES:' },
      {
        '': '- Fields with existing values will NOT be changed'
      },
      {
        '': '- You will see a detailed report after upload showing what was updated vs skipped'
      },
      {
        '': '- Email validation ensures proper format (@jkkn.ac.in domain)'
      },
      {
        '': '- Duplicate user accounts are prevented automatically'
      }
    ];
    const ws5 = XLSX.utils.json_to_sheet(instructions);
    ws5['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws5, 'Instructions');

    // Generate file
    const fileContent = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `students_for_update_${timestamp}.xlsx`;

    return new NextResponse(fileContent as any, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error: any) {
    console.error('Error in GET /api/students/export-for-update:', error);
    return NextResponse.json(
      {
        error: 'Failed to export student data for update',
        details: error.message
      },
      { status: 500 }
    );
  }
}
