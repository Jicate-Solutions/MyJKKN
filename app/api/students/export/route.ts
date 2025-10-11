import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Database } from '@/types/supabase';
import type { Student } from '@/types/student'; // Assuming Student type includes related data

// Define which columns to include in the export and their order/header names
const EXPORT_COLUMNS = [
  // Personal Details
  { key: 'first_name', header: 'First Name' },
  { key: 'last_name', header: 'Last Name' },
  { key: 'roll_number', header: 'Roll Number' },
  { key: 'date_of_birth', header: 'Date of Birth' },
  { key: 'gender', header: 'Gender' },
  { key: 'religion', header: 'Religion' },
  { key: 'community', header: 'Community' },
  { key: 'caste', header: 'Caste' },

  // Contact Details
  { key: 'student_mobile', header: 'Student Mobile' },
  { key: 'student_email', header: 'Student Email' },
  { key: 'college_email', header: 'College Email' },

  // Family Details
  { key: 'father_name', header: "Father's Name" },
  { key: 'father_mobile', header: "Father's Mobile" },
  { key: 'father_occupation', header: "Father's Occupation" },
  { key: 'mother_name', header: "Mother's Name" },
  { key: 'mother_mobile', header: "Mother's Mobile" },
  { key: 'mother_occupation', header: "Mother's Occupation" },
  { key: 'annual_income', header: 'Annual Income' },

  // Academic Details
  { key: 'institution.name', header: 'Institution' },
  { key: 'degree.degree_name', header: 'Degree' },
  { key: 'department.department_name', header: 'Department' },
  { key: 'program.program_name', header: 'Program' },
  { key: 'semester.semester_name', header: 'Semester' },
  { key: 'section.section_name', header: 'Section' },
  { key: 'academic_year.academic_year_name', header: 'Academic Year' },
  { key: 'entry_type', header: 'Entry Type' },

  // Previous Academics
  { key: 'last_school', header: 'Last School Attended' },
  { key: 'board_of_study', header: 'Board of Study' },
  { key: 'tenth_marks.max_marks', header: '10th Max Marks' },
  { key: 'tenth_marks.obtained_marks', header: '10th Obtained Marks' },
  { key: 'tenth_marks.percentage', header: '10th Percentage' },
  { key: 'twelfth_marks.group', header: '12th Group' },
  { key: 'twelfth_marks.max_marks', header: '12th Max Marks' },
  { key: 'twelfth_marks.obtained_marks', header: '12th Obtained Marks' },
  { key: 'twelfth_marks.percentage', header: '12th Percentage' },

  // Admission Details
  { key: 'admission_id', header: 'Admission ID' },
  { key: 'application_id', header: 'Application ID' },
  { key: 'medical_cutoff_marks', header: 'Medical Cutoff' },
  { key: 'engineering_cutoff_marks', header: 'Engineering Cutoff' },
  { key: 'neet_roll_number', header: 'NEET Roll Number' },
  { key: 'counseling_applied', header: 'Counseling Applied' },
  { key: 'counseling_number', header: 'Counseling Number' },
  { key: 'first_graduate', header: 'First Graduate' },
  { key: 'quota', header: 'Quota' },
  { key: 'category', header: 'Category' },

  // Address
  { key: 'permanent_address_street', header: 'Street' },
  { key: 'permanent_address_taluk', header: 'Taluk' },
  { key: 'permanent_address_district', header: 'District' },
  { key: 'permanent_address_state', header: 'State' },
  { key: 'permanent_address_pin_code', header: 'PIN Code' },

  // Accommodation & Transport
  { key: 'accommodation_type', header: 'Accommodation' },
  { key: 'hostel_type', header: 'Hostel Type' },
  { key: 'bus_required', header: 'Bus Required' },
  { key: 'bus_route', header: 'Bus Route' },
  { key: 'bus_pickup_location', header: 'Bus Pickup Location' },

  // Reference Details
  { key: 'reference_type', header: 'Reference Type' },
  { key: 'reference_name', header: 'Reference Name' },
  { key: 'reference_contact', header: 'Reference Contact' },

  // Student Photo & Profile
  { key: 'student_photo_url', header: 'Photo URL' },

  // Status & Metadata
  { key: 'status', header: 'Status' },
  { key: 'is_profile_complete', header: 'Profile Complete' },
  { key: 'created_at', header: 'Created At' },
  { key: 'updated_at', header: 'Updated At' }
];

export async function GET(request: NextRequest) {
  try {
    // --- Authentication/Authorization Check (Highly Recommended) ---
    // Add logic here to ensure the user making the request is authenticated
    // and has the necessary permissions (e.g., admin) to export data.
    // If not authorized, return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // Example (needs proper server-side session handling):
    // const supabase = createServerClient(...); // Use server client
    // const { data: { user } } = await supabase.auth.getUser();
    // if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    // const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    // if (profile?.role !== 'admin' && profile?.role !== 'super_admin') { // Adjust roles as needed
    //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    // }
    // ----------------------------------------------------------------

    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'xlsx'; // Default to xlsx
    const includeInactive = searchParams.get('includeInactive') === 'true';
    const exportAll = searchParams.get('exportAll') === 'true'; // Currently defaults to true

    // Create Supabase Admin Client
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Build the query to fetch student data
    let query = supabaseAdmin
      .from('students')
      .select(
        `
        *, 
        institution:institutions!institution_id(id, name),
        degree:degrees!degree_id(id, degree_name),
        department:departments!department_id(id, department_name),
        program:programs!program_id(id, program_name),
        semester:semesters!semester_id(id, semester_name),
        section:sections!section_id(id, section_name),
        academic_year:academic_years!academic_year_id(id, academic_year_name)
      `
      )
      .order('created_at', { ascending: false });

    // Apply filters based on query params
    if (!includeInactive) {
      // Only include students with 'active' status if includeInactive is false
      query = query.eq('status', 'active');
    }

    // Add other filters from the search params
    const institution = searchParams.get('institution');
    if (institution) {
      query = query.eq('institution_id', institution);
    }
    const degree = searchParams.get('degree');
    if (degree) {
      query = query.eq('degree_id', degree);
    }
    const department = searchParams.get('department');
    if (department) {
      query = query.eq('department_id', department);
    }
    const program = searchParams.get('program');
    if (program) {
      query = query.eq('program_id', program);
    }
    const semester = searchParams.get('semester');
    if (semester) {
      query = query.eq('semester_id', semester);
    }
    const section = searchParams.get('section');
    if (section) {
      query = query.eq('section_id', section);
    }
    const status = searchParams.get('status');
    if (status) {
      query = query.eq('status', status);
    }
    const isProfileComplete = searchParams.get('is_profile_complete');
    if (isProfileComplete) {
      query = query.eq('is_profile_complete', isProfileComplete);
    }
    if (searchParams.get('search')) {
      const searchTerm = searchParams.get('search');
      query = query.or(
        `first_name.ilike.%${searchTerm}%,last_name.ilike.%${searchTerm}%,roll_number.ilike.%${searchTerm}%,student_email.ilike.%${searchTerm}%`
      );
    }

    // Fetch all data (handle potential pagination if dataset is huge, though less common for exports)
    const { data: students, error } = await query;

    if (error) {
      console.error('Error fetching students for export:', error);
      throw new Error('Database error fetching student data');
    }

    if (!students || students.length === 0) {
      return NextResponse.json(
        { message: 'No student data found to export based on criteria.' },
        { status: 404 }
      );
    }

    // Prepare data for the chosen format
    const headers = EXPORT_COLUMNS.map((col) => col.header);
    const dataToExport = students.map((student) => {
      const row: Record<string, any> = {};
      EXPORT_COLUMNS.forEach((col) => {
        // Simple key access
        if (!col.key.includes('.')) {
          row[col.header] = (student as any)[col.key];
        }
        // Nested key access (e.g., 'institution.name')
        else {
          const keys = col.key.split('.');
          let value = student as any;
          for (const k of keys) {
            value = value?.[k];
            if (value === undefined || value === null) break;
          }
          row[col.header] = value ?? ''; // Use empty string for null/undefined nested values
        }
        // Format specific types if needed (e.g., dates, booleans)
        if (row[col.header] instanceof Date) {
          row[col.header] = row[col.header].toISOString();
        }
        if (typeof row[col.header] === 'boolean') {
          row[col.header] = row[col.header] ? 'Yes' : 'No';
        }
      });
      return row;
    });

    // Generate the file content based on the format
    let fileContent: string | Buffer;
    let contentType: string;
    let fileExtension: string = format;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `students_export_${timestamp}.${fileExtension}`;

    switch (format) {
      case 'csv':
        fileContent = Papa.unparse(dataToExport, { header: true });
        contentType = 'text/csv';
        break;
      case 'json':
        fileContent = JSON.stringify(dataToExport, null, 2);
        contentType = 'application/json';
        break;
      case 'xlsx':
      default:
        const ws = XLSX.utils.json_to_sheet(dataToExport, { header: headers });
        // Optional: Adjust column widths
        ws['!cols'] = headers.map(() => ({ wch: 20 }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Students');
        fileContent = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        contentType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        fileExtension = 'xlsx'; // Ensure correct extension
        break;
    }

    // Return the file as a response
    const response = new NextResponse(fileContent as any, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });

    return response;
  } catch (error: any) {
    console.error('Error in GET /api/students/export:', error);
    return NextResponse.json(
      { error: 'Failed to export student data', details: error.message },
      { status: 500 }
    );
  }
}
