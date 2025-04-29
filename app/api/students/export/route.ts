import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import type { Database } from '@/types/supabase';
import type { Student } from '@/types/student'; // Assuming Student type includes related data

// Define which columns to include in the export and their order/header names
const EXPORT_COLUMNS = [
  { key: 'student_name', header: 'Student Name' },
  { key: 'roll_number', header: 'Roll Number' },
  { key: 'college_email', header: 'College Email' },
  { key: 'student_email', header: 'Personal Email' },
  { key: 'student_mobile', header: 'Mobile' },
  { key: 'gender', header: 'Gender' },
  { key: 'date_of_birth', header: 'DOB' },
  { key: 'institution.name', header: 'Institution' }, // Access nested data
  { key: 'degree.degree_name', header: 'Degree' },
  { key: 'department.department_name', header: 'Department' },
  { key: 'program.program_name', header: 'Program' },
  { key: 'entry_type', header: 'Entry Type' },
  { key: 'status', header: 'Status' },
  { key: 'is_profile_complete', header: 'Profile Complete' },
  { key: 'created_at', header: 'Created At' },
  // Add more columns as needed
  { key: 'permanent_address_street', header: 'Address Street' },
  { key: 'permanent_address_district', header: 'Address District' },
  { key: 'permanent_address_pin_code', header: 'Address PIN' }
  // ... other address fields, academic details etc.
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
        program:programs!program_id(id, program_name)
      `
      )
      .order('created_at', { ascending: false });

    // Apply filters based on query params
    if (!includeInactive) {
      // Only include students with 'active' status if includeInactive is false
      query = query.eq('status', 'active');
    }
    // Add more filters based on `currentFilters` if `exportAll` is false
    // Example: if (!exportAll && searchParams.get('search')) { query = query.ilike(...) }

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
    const response = new NextResponse(fileContent, {
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
