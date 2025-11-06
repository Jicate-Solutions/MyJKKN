import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { BulkUpdateStudentDto } from '@/types/student';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Field validation rules
const FIELD_VALIDATIONS = {
  college_email: {
    pattern: /^[^\s@]+@jkkn\.ac\.in$/i,
    message: 'Email must be in format: username@jkkn.ac.in'
  },
  roll_number: {
    pattern: /^[A-Z0-9-]+$/i,
    message: 'Roll number must contain only letters, numbers, and hyphens'
  }
};

interface ValidationError {
  field: string;
  fieldLabel: string;
  value: any;
  error: string;
}

interface PreviewStudent {
  id: string;
  studentName: string;
  rollNumber?: string;
  updates: Array<{
    field: string;
    fieldLabel: string;
    currentValue: any;
    newValue: any;
    status: 'valid' | 'invalid';
    error?: string;
  }>;
  validationErrors: ValidationError[];
  hasErrors: boolean;
  updateCount: number;
}

interface PreviewResult {
  students: PreviewStudent[];
  summary: {
    total: number;
    validUpdates: number;
    invalidUpdates: number;
    totalFields: number;
    fieldsWithErrors: number;
  };
}

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
        error: (error: Error) => reject(error)
      });
    });
  } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
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
    throw new Error('Unsupported file format. Please upload CSV or Excel file.');
  }
}

// Validate a single field
function validateField(field: string, value: any): string | null {
  if (!value) return null;

  const validation = FIELD_VALIDATIONS[field as keyof typeof FIELD_VALIDATIONS];
  if (!validation) return null;

  if (!validation.pattern.test(String(value))) {
    return validation.message;
  }

  return null;
}

// Field labels for display
const FIELD_LABELS: Record<string, string> = {
  roll_number: 'Roll Number',
  college_email: 'College Email',
  academic_year_id: 'Academic Year',
  semester_id: 'Semester',
  section_id: 'Section',
  student_photo_url: 'Photo URL'
};

export async function POST(request: NextRequest) {
  try {
    console.log('[bulk-update/preview] Request received');

    const supabase = await createServerSupabaseClient();
    const formData = await request.formData();
    const file = formData.get('file') as File;

    console.log('[bulk-update/preview] File:', file ? file.name : 'No file');

    if (!file) {
      console.error('[bulk-update/preview] No file uploaded');
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Parse the file
    console.log('[bulk-update/preview] Parsing file...');
    const updates = await parseUploadedFile(file);
    console.log('[bulk-update/preview] Parsed updates:', updates.length);

    if (!updates || updates.length === 0) {
      console.error('[bulk-update/preview] No valid data in file');
      return NextResponse.json(
        { error: 'No valid student data found in the uploaded file' },
        { status: 400 }
      );
    }

    // Validate student IDs
    const missingIds = updates.filter((u) => !u.id);
    if (missingIds.length > 0) {
      console.error('[bulk-update/preview] Missing IDs:', missingIds.length);
      return NextResponse.json(
        {
          error: `${missingIds.length} record(s) are missing Student ID`
        },
        { status: 400 }
      );
    }

    // Generate preview with validation
    const result: PreviewResult = {
      students: [],
      summary: {
        total: updates.length,
        validUpdates: 0,
        invalidUpdates: 0,
        totalFields: 0,
        fieldsWithErrors: 0
      }
    };

    for (const update of updates) {
      // Fetch current student data
      const { data: currentStudent, error: fetchError } = await supabase
        .from('students')
        .select(
          'id, first_name, last_name, roll_number, college_email, academic_year_id, semester_id, section_id, student_photo_url'
        )
        .eq('id', update.id)
        .single();

      // Validate UUID format first
      if (!isValidUUID(update.id)) {
        result.students.push({
          id: update.id,
          studentName: `Invalid ID: ${update.id}`,
          rollNumber: undefined,
          updates: [],
          validationErrors: [
            {
              field: 'id',
              fieldLabel: 'Student ID',
              value: update.id,
              error: 'Invalid Student ID format. Student ID must be a valid UUID (e.g., 12345678-1234-1234-1234-123456789abc). This ID appears to be corrupted or incomplete. Please re-export student data to get the correct IDs.'
            }
          ],
          hasErrors: true,
          updateCount: 0
        });
        result.summary.invalidUpdates++;
        continue;
      }

      if (fetchError || !currentStudent) {
        result.students.push({
          id: update.id,
          studentName: `Student ID: ${update.id}`,
          rollNumber: undefined,
          updates: [],
          validationErrors: [
            {
              field: 'id',
              fieldLabel: 'Student ID',
              value: update.id,
              error: 'Student not found in database. This ID is correctly formatted but does not exist in the database. Please verify you are using the latest export file.'
            }
          ],
          hasErrors: true,
          updateCount: 0
        });
        result.summary.invalidUpdates++;
        continue;
      }

      const studentName = `${currentStudent.first_name} ${currentStudent.last_name || ''}`.trim();
      const previewStudent: PreviewStudent = {
        id: update.id,
        studentName,
        rollNumber: currentStudent.roll_number,
        updates: [],
        validationErrors: [],
        hasErrors: false,
        updateCount: 0
      };

      // Check each field
      const fields: Array<keyof BulkUpdateStudentDto> = [
        'roll_number',
        'college_email',
        'academic_year_id',
        'semester_id',
        'section_id',
        'student_photo_url'
      ];

      for (const field of fields) {
        const newValue = update[field];
        const currentValue = currentStudent[field];

        // If new value is provided and not empty
        if (newValue !== undefined && newValue !== null && newValue !== '') {
          result.summary.totalFields++;

          // Check if current value is empty (update allowed)
          if (!currentValue || currentValue === '') {
            // Validate the new value
            const validationError = validateField(field, newValue);

            if (validationError) {
              // Invalid value
              previewStudent.updates.push({
                field,
                fieldLabel: FIELD_LABELS[field] || field,
                currentValue: currentValue || 'Empty',
                newValue,
                status: 'invalid',
                error: validationError
              });
              previewStudent.validationErrors.push({
                field,
                fieldLabel: FIELD_LABELS[field] || field,
                value: newValue,
                error: validationError
              });
              previewStudent.hasErrors = true;
              result.summary.fieldsWithErrors++;
            } else {
              // Valid update
              previewStudent.updates.push({
                field,
                fieldLabel: FIELD_LABELS[field] || field,
                currentValue: currentValue || 'Empty',
                newValue,
                status: 'valid'
              });
              previewStudent.updateCount++;
            }
          } else {
            // Field already has a value - will be skipped
            previewStudent.updates.push({
              field,
              fieldLabel: FIELD_LABELS[field] || field,
              currentValue,
              newValue,
              status: 'invalid',
              error: 'Field already has a value (not empty)'
            });
          }
        }
      }

      if (previewStudent.hasErrors) {
        result.summary.invalidUpdates++;
      } else if (previewStudent.updateCount > 0) {
        result.summary.validUpdates++;
      }

      if (previewStudent.updates.length > 0) {
        result.students.push(previewStudent);
      }
    }

    console.log('[bulk-update/preview] Preview generated successfully:', {
      total: result.summary.total,
      validUpdates: result.summary.validUpdates,
      invalidUpdates: result.summary.invalidUpdates
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    console.error('[bulk-update/preview] Error generating preview:', error);
    return NextResponse.json(
      { error: 'Failed to generate preview', details: error.message },
      { status: 500 }
    );
  }
}
