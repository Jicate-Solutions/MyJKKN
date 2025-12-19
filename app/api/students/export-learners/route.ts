import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import * as XLSX from 'xlsx';

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
        console.log(`[export-learners] Fetched page ${currentPage + 1}: ${pageData.length} records (total: ${allStudents.length})`);
        currentPage++;

        if (pageData.length < PAGE_SIZE) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    console.log(`[export-learners] Total students fetched: ${allStudents.length}`);
    return { data: allStudents, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { searchParams } = new URL(request.url);

    console.log('[export-learners] Query params:', Object.fromEntries(searchParams));

    // Extract filter values
    const isProfileComplete = searchParams.get('is_profile_complete');
    const institution = searchParams.get('institution');
    const department = searchParams.get('department');
    const program = searchParams.get('program');
    const semester = searchParams.get('semester');
    const section = searchParams.get('section');
    const status = searchParams.get('status');

    console.log('[export-learners] Filters:', {
      isProfileComplete,
      institution,
      department,
      program,
      semester,
      section,
      status
    });

    // Select query with all related data
    const selectQuery = `
      *,
      institution:institutions(id, name),
      degree:degrees(id, degree_name),
      department:departments(id, department_name),
      program:programs(id, program_name),
      semester:semesters(id, semester_name),
      section:sections(id, section_name),
      academic_year:academic_years(id, academic_year_name, start_date, end_date, is_active)
    `;

    // Use paginated fetch to overcome Supabase 1000-row limit
    const { data: students, error } = await fetchAllStudentsForExport(
      supabase,
      selectQuery,
      (query) => {
        // Apply is_profile_complete filter if provided (defaults to true from page)
        if (isProfileComplete !== null) {
          query = query.eq('is_profile_complete', isProfileComplete === 'true');
        }
        // Apply other filters
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
        // Handle status filter - can be single value or comma-separated list
        if (status) {
          // Check if status contains comma (multiple values)
          if (status.includes(',')) {
            const statusArray = status.split(',').map(s => s.trim());
            query = query.in('status', statusArray);
          } else {
            query = query.eq('status', status);
          }
        }
        return query;
      }
    );

    if (error) {
      console.error('[export-learners] Database error:', error);
      throw error;
    }

    console.log('[export-learners] Found students:', students?.length || 0);

    if (!students || students.length === 0) {
      // Get total count for helpful error message
      const { count: totalCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true });

      const { count: completeCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('is_profile_complete', true);

      const { count: incompleteCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('is_profile_complete', false);

      console.log('[export-learners] Stats:', {
        total: totalCount,
        complete: completeCount,
        incomplete: incompleteCount,
        filters: Object.fromEntries(searchParams)
      });

      return NextResponse.json(
        {
          message: `No students found matching your filters. Total students: ${totalCount || 0} (${completeCount || 0} complete, ${incompleteCount || 0} incomplete). Try clearing your filters or changing the profile completion filter.`
        },
        { status: 404 }
      );
    }

    // Fetch reference data for dropdowns
    const [academicYears, semesters, sections, institutions, departments, programs] =
      await Promise.all([
        supabase.from('academic_years').select('*').order('academic_year_name'),
        supabase.from('semesters').select('*').order('semester_name'),
        supabase.from('sections').select('*').order('section_name'),
        supabase.from('institutions').select('*').order('name'),
        supabase.from('departments').select('*').order('department_name'),
        supabase.from('programs').select('*').order('program_name')
      ]);

    // Create workbook
    const wb = XLSX.utils.book_new();

    // Sheet 1: Students with ALL editable fields
    const studentData = students.map((student: any) => ({
      'Student ID *': student.id,
      'First Name': student.first_name || '',
      'Last Name': student.last_name || '',
      'Date of Birth': student.date_of_birth || '',
      'Gender': student.gender || '',
      'Student Mobile': student.student_mobile || '',
      'Student Email': student.student_email || '',
      'Roll Number': student.roll_number || '',
      'College Email': student.college_email || '',
      'Academic Year ID': student.academic_year_id || '',
      'Semester ID': student.semester_id || '',
      'Section ID': student.section_id || '',
      'Status': student.status || '',
      'Photo URL': student.student_photo_url || '',
      'Father Name': student.father_name || '',
      'Father Occupation': student.father_occupation || '',
      'Father Mobile': student.father_mobile || '',
      'Mother Name': student.mother_name || '',
      'Mother Occupation': student.mother_occupation || '',
      'Mother Mobile': student.mother_mobile || '',
      'Religion': student.religion || '',
      'Community': student.community || '',
      'Caste': student.caste || '',
      'Annual Income': student.annual_income || '',
      'Aadhar Number': student.aadhar_number || '',
      'Last School': student.last_school || '',
      'Board of Study': student.board_of_study || '',
      'Engineering Cutoff': student.engineering_cutoff_marks || '',
      'Medical Cutoff': student.medical_cutoff_marks || '',
      'NEET Roll Number': student.neet_roll_number || '',
      'NEET Score': student.neet_score || '',
      'Counseling Applied': student.counseling_applied ? 'Yes' : 'No',
      'Counseling Number': student.counseling_number || '',
      'First Graduate': student.first_graduate ? 'Yes' : 'No',
      'Quota': student.quota || '',
      'Category': student.category || '',
      'Address Street': student.permanent_address_street || '',
      'Address Taluk': student.permanent_address_taluk || '',
      'Address District': student.permanent_address_district || '',
      'Address PIN Code': student.permanent_address_pin_code || '',
      'Address State': student.permanent_address_state || '',
      'Accommodation Type': student.accommodation_type || '',
      'Hostel Type': student.hostel_type || '',
      'Food Type': student.food_type || '',
      'Bus Required': student.bus_required ? 'Yes' : 'No',
      'Bus Route': student.bus_route || '',
      'Bus Pickup Location': student.bus_pickup_location || '',
      'Reference Type': student.reference_type || '',
      'Reference Name': student.reference_name || '',
      'Reference Contact': student.reference_contact || ''
    }));

    const ws1 = XLSX.utils.json_to_sheet(studentData);
    ws1['!cols'] = Array(50).fill({ wch: 20 });
    XLSX.utils.book_append_sheet(wb, ws1, 'Learners');

    // Sheet 2: Academic Years Reference
    if (academicYears.data && academicYears.data.length > 0) {
      const ayData = academicYears.data.map((ay: any) => ({
        'Academic Year ID': ay.id,
        'Academic Year Name': ay.academic_year_name,
        'Start Date': ay.start_date,
        'End Date': ay.end_date,
        Active: ay.is_active ? 'Yes' : 'No'
      }));
      const ws2 = XLSX.utils.json_to_sheet(ayData);
      ws2['!cols'] = [{ wch: 40 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Academic Years');
    }

    // Sheet 3: Semesters Reference
    if (semesters.data && semesters.data.length > 0) {
      const semData = semesters.data.map((sem: any) => ({
        'Semester ID': sem.id,
        'Semester Name': sem.semester_name
      }));
      const ws3 = XLSX.utils.json_to_sheet(semData);
      ws3['!cols'] = [{ wch: 40 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Semesters');
    }

    // Sheet 4: Sections Reference
    if (sections.data && sections.data.length > 0) {
      const secData = sections.data.map((sec: any) => ({
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
        Step: 1,
        Instruction: 'DO NOT modify the "Student ID *" column - it is required for matching'
      },
      {
        Step: 2,
        Instruction: 'Edit any fields you want to update'
      },
      {
        Step: 3,
        Instruction: 'You can update BOTH existing AND empty fields'
      },
      {
        Step: 4,
        Instruction:
          'Use the reference sheets to find valid IDs for Academic Year, Semester, Section'
      },
      {
        Step: 5,
        Instruction: 'Save the file and upload it using "Bulk Edit Learners" button'
      },
      {
        Step: 6,
        Instruction: 'Review the preview showing all changes before confirming'
      },
      {
        Step: 7,
        Instruction:
          'For Yes/No fields: use "Yes" or "No" (Counseling Applied, First Graduate, Bus Required)'
      },
      {
        Step: 8,
        Instruction:
          'Valid Status values: active, inactive, pending, exited, graduated'
      }
    ];

    const ws5 = XLSX.utils.json_to_sheet(instructions);
    ws5['!cols'] = [{ wch: 10 }, { wch: 80 }];
    XLSX.utils.book_append_sheet(wb, ws5, 'Instructions');

    // Generate Excel file
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

    // Return as downloadable file
    return new NextResponse(excelBuffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=learners_for_editing_${new Date().toISOString().split('T')[0]}.xlsx`
      }
    });
  } catch (error) {
    console.error('Error exporting learners:', error);
    return NextResponse.json(
      {
        message: 'Failed to export learners',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
