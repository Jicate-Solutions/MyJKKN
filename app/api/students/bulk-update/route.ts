import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { BulkUpdateStudentDto } from '@/types/student';
import { StudentService } from '@/lib/services/student/student-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Helper to validate UUID format
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

// Helper to parse uploaded file
async function parseUploadedFile(
  file: File
): Promise<BulkUpdateStudentDto[]> {
  const fileExtension = file.name.split('.').pop()?.toLowerCase();

  if (fileExtension === 'csv') {
    // Parse CSV
    const text = await file.text();
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const data = results.data.map((row: any) => ({
            id: row['Student ID *'] || row['Student ID'],
            roll_number: row['Roll Number'] || undefined,
            college_email: row['College Email'] || undefined,
            academic_year_id: row['Academic Year ID'] || undefined,
            semester_id: row['Semester ID'] || undefined,
            section_id: row['Section ID'] || undefined,
            student_photo_url: row['Photo URL'] || undefined
          }));
          resolve(data);
        },
        error: (error: Error | unknown) => reject(error)
      });
    });
  } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    // Parse Excel
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Get the first sheet (Students for Update)
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    return jsonData.map((row: any) => ({
      id: row['Student ID *'] || row['Student ID'],
      roll_number: row['Roll Number'] || undefined,
      college_email: row['College Email'] || undefined,
      academic_year_id: row['Academic Year ID'] || undefined,
      semester_id: row['Semester ID'] || undefined,
      section_id: row['Section ID'] || undefined,
      student_photo_url: row['Photo URL'] || undefined
    }));
  } else {
    throw new Error(
      'Unsupported file format. Please upload CSV or Excel (.xlsx) file.'
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Parse the file
    const updates = await parseUploadedFile(file);

    if (!updates || updates.length === 0) {
      return NextResponse.json(
        { error: 'No valid student data found in the uploaded file' },
        { status: 400 }
      );
    }

    // Validate that all records have student IDs
    const missingIds = updates.filter((u) => !u.id);
    if (missingIds.length > 0) {
      return NextResponse.json(
        {
          error: `${missingIds.length} record(s) are missing Student ID. Student ID is required for matching.`
        },
        { status: 400 }
      );
    }

    // Validate UUID format for all IDs
    const invalidIds = updates.filter((u) => u.id && !isValidUUID(u.id));
    if (invalidIds.length > 0) {
      const exampleInvalidId = invalidIds[0].id;
      return NextResponse.json(
        {
          error: `${invalidIds.length} record(s) have invalid Student ID format. Example: "${exampleInvalidId}" is not a valid UUID. Student IDs must be in UUID format (e.g., 12345678-1234-1234-1234-123456789abc). Please re-export student data to get the correct IDs.`,
          invalidIds: invalidIds.map(u => u.id)
        },
        { status: 400 }
      );
    }

    // Filter out records with no updates (all fields except id are undefined/empty)
    const validUpdates = updates.filter((update) => {
      return (
        update.roll_number ||
        update.college_email ||
        update.academic_year_id ||
        update.semester_id ||
        update.section_id ||
        update.student_photo_url
      );
    });

    if (validUpdates.length === 0) {
      return NextResponse.json(
        {
          error:
            'No updates found in the file. Please fill in at least one onboarding field.'
        },
        { status: 400 }
      );
    }

    // Create server-side Supabase client to bypass RLS
    const supabase = await createServerSupabaseClient();

    // Call the bulk update service with server client
    const result = await StudentService.bulkUpdateStudents(validUpdates, supabase);

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('Error in POST /api/students/bulk-update:', error);
    return NextResponse.json(
      {
        error: 'Failed to process bulk update',
        details: error.message
      },
      { status: 500 }
    );
  }
}
