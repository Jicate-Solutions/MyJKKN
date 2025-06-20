'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import toast from 'react-hot-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import {
  AlertCircle,
  CheckCircle,
  FileUp,
  Loader2,
  Upload,
  X,
  XCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation'; // Import useRouter
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { StudentService } from '@/lib/services/student/student-service';

// Helper function to parse and normalize date formats
const parseAndNormalizeDate = (dateString: string): string | null => {
  if (!dateString || typeof dateString !== 'string') return null;

  const cleanDate = dateString.trim();
  if (!cleanDate) return null;

  // Try multiple date formats
  const formats = [
    // YYYY-MM-DD (current required format)
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // DD/MM/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // MM/DD/YYYY
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    // DD-MM-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    // MM-DD-YYYY
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    // DD.MM.YYYY
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/,
    // YYYY/MM/DD
    /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
    // YYYY.MM.DD
    /^(\d{4})\.(\d{1,2})\.(\d{1,2})$/
  ];

  // Try parsing with different formats
  let parsedDate: Date | null = null;

  // First check if it's already in YYYY-MM-DD format
  if (formats[0].test(cleanDate)) {
    const match = cleanDate.match(formats[0]);
    if (match) {
      const [_, year, month, day] = match;
      parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }
  // Try DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY formats
  else if (
    formats[1].test(cleanDate) ||
    formats[3].test(cleanDate) ||
    formats[5].test(cleanDate)
  ) {
    const match = cleanDate.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (match) {
      const [_, day, month, year] = match;
      parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }
  // Try YYYY/MM/DD or YYYY.MM.DD formats
  else if (formats[6].test(cleanDate) || formats[7].test(cleanDate)) {
    const match = cleanDate.match(/^(\d{4})[\/.](\d{1,2})[\/.](\d{1,2})$/);
    if (match) {
      const [_, year, month, day] = match;
      parsedDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }
  // Try native Date parsing as fallback
  else {
    parsedDate = new Date(cleanDate);
  }

  // Validate the parsed date
  if (!parsedDate || isNaN(parsedDate.getTime())) {
    return null;
  }

  // Check if date is reasonable (between 1900 and current year + 10)
  const year = parsedDate.getFullYear();
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear + 10) {
    return null;
  }

  // Return in YYYY-MM-DD format
  const normalizedYear = parsedDate.getFullYear();
  const normalizedMonth = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const normalizedDay = String(parsedDate.getDate()).padStart(2, '0');

  return `${normalizedYear}-${normalizedMonth}-${normalizedDay}`;
};

/**
 * COMPREHENSIVE BULK STUDENT UPLOAD COMPONENT
 *
 * This component provides a user-friendly bulk upload system for creating student records.
 *
 * KEY IMPROVEMENTS MADE:
 *
 * 1. **User-Friendly Template Structure**:
 *    - Replaced complex JSON fields with separate, easy-to-fill columns
 *    - Clear indication of required vs optional fields (marked with *)
 *    - Organized fields into logical sections (Personal, Academic, Course, Contact, Reference)
 *
 * 2. **Simplified Academic Marks Entry**:
 *    - Instead of complex JSON strings for marks, users fill separate columns:
 *      * tenth_marks_max_marks, tenth_marks_obtained_marks, tenth_marks_percentage
 *      * twelfth_marks_group, twelfth_marks_max_marks, twelfth_marks_obtained_marks, twelfth_marks_percentage
 *      * Individual subject marks (physics, chemistry, mathematics, biology, computer_science)
 *    - System automatically converts these to required JSON format during processing
 *
 * 3. **Multi-Sheet Excel Template**:
 *    - Sheet 1: Main template with sample data
 *    - Sheet 2: Comprehensive instructions and field explanations
 *    - Sheet 3: Reference data (Institution, Degree, Department, Program UUIDs)
 *    - Sheet 4: JSON examples showing how separate fields are converted
 *
 * 4. **Enhanced Validation**:
 *    - Clear field-by-field validation with descriptive error messages
 *    - Handles headers with asterisks (required field markers)
 *    - Transforms user-friendly input into database-compatible format
 *
 * 5. **Required Fields for Profile Completion**:
 *    - Basic creation: student_name, father_name, mother_name, mother_mobile, date_of_birth,
 *      gender, religion, community, academic info, course info, contact info, accommodation_type
 *    - Profile completion (optional): roll_number, college_email, semester_id, section_id
 *    - When college_email is provided, user accounts are automatically created
 *
 * 6. **Batch Processing & Error Handling**:
 *    - Processes uploads in batches of 50 for better performance
 *    - Detailed error reporting with row-level validation
 *    - User creation tracking with success/failure details
 *    - Progress indicators and comprehensive result summaries
 *
 * 7. **Reference Data Integration**:
 *    - Template includes actual Institution, Degree, Department, and Program UUIDs
 *    - Users don't need to guess or look up complex identifiers
 *    - Clear examples for all field types and formats
 *
 * VALIDATION SCHEMA:
 * The component now uses separate fields for marks instead of JSON, making it much more
 * user-friendly while maintaining full compatibility with the database structure.
 */

// Define the Zod schema for validating a NEW student row with user-friendly separate fields
// This accepts separate marks columns and will be transformed into JSON for the database
const newStudentSchema = z
  .object({
    // Personal Info
    student_name: z.string().min(1, 'Student name is required'),
    father_name: z.string().min(1, 'Father name is required'),
    father_occupation: z.string().optional().nullable(),
    father_mobile: z.string().optional().nullable(),
    mother_name: z.string().min(1, 'Mother name is required'),
    mother_occupation: z.string().optional().nullable(),
    mother_mobile: z.string().min(1, 'Mother mobile is required'),
    date_of_birth: z
      .string()
      .min(1, 'Date of birth is required')
      .transform((val) => {
        const normalized = parseAndNormalizeDate(val);
        if (!normalized) {
          throw new Error(
            'Invalid date format. Accepted formats: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, etc.'
          );
        }
        return normalized;
      }),
    gender: z.string().min(1, 'Gender is required'),
    religion: z.string().min(1, 'Religion is required'),
    community: z.string().min(1, 'Community is required'),
    caste: z.string().optional().nullable(),
    annual_income: z.string().optional().nullable(),

    // Academic Info - Separate fields for easier user input (now optional)
    last_school: z.string().optional().nullable(),
    board_of_study: z.string().optional().nullable(),

    // 10th marks - separate fields (now optional)
    tenth_marks_max_marks: z.string().optional().nullable(),
    tenth_marks_obtained_marks: z.string().optional().nullable(),
    tenth_marks_percentage: z.string().optional().nullable(),

    // 12th marks - separate fields (now optional)
    twelfth_marks_group: z.string().optional().nullable(),
    twelfth_marks_max_marks: z.string().optional().nullable(),
    twelfth_marks_obtained_marks: z.string().optional().nullable(),
    twelfth_marks_percentage: z.string().optional().nullable(),

    // 12th marks - subject-wise (optional)
    twelfth_marks_physics: z.string().optional().nullable(),
    twelfth_marks_chemistry: z.string().optional().nullable(),
    twelfth_marks_mathematics: z.string().optional().nullable(),
    twelfth_marks_biology: z.string().optional().nullable(),
    twelfth_marks_computer_science: z.string().optional().nullable(),
    twelfth_marks_other_subject: z.string().optional().nullable(),
    medical_cutoff_marks: z.string().optional().nullable(),
    engineering_cutoff_marks: z.string().optional().nullable(),
    neet_roll_number: z.string().optional().nullable(),
    counseling_applied: z
      .preprocess((val) => String(val).toLowerCase() === 'true', z.boolean())
      .optional()
      .nullable(),
    counseling_number: z.string().optional().nullable(),
    first_graduate: z
      .preprocess((val) => String(val).toLowerCase() === 'true', z.boolean())
      .optional()
      .nullable(),

    // Course Info
    quota: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    institution_id: z
      .string()
      .uuid('Institution ID must be a valid UUID. Check Reference Data sheet.'),
    degree_id: z
      .string()
      .uuid('Degree ID must be a valid UUID. Check Reference Data sheet.')
      .optional()
      .nullable(),
    department_id: z
      .string()
      .uuid('Department ID must be a valid UUID. Check Reference Data sheet.'),
    program_id: z
      .string()
      .uuid('Program ID must be a valid UUID. Check Reference Data sheet.'),
    entry_type: z.string().optional().nullable(),

    // Contact Info
    permanent_address_street: z
      .string()
      .min(1, 'Permanent address street is required'),
    permanent_address_taluk: z.string().optional().nullable(),
    permanent_address_district: z
      .string()
      .min(1, 'Permanent address district is required'),
    permanent_address_pin_code: z
      .string()
      .regex(/^\d{6}$/, 'PIN code must be exactly 6 digits (e.g., 637001)'),
    permanent_address_state: z
      .string()
      .min(1, 'Permanent address state is required'),
    student_mobile: z
      .string()
      .min(10, 'Student mobile must be at least 10 digits')
      .regex(
        /^\d{10,15}$/,
        'Student mobile must contain only digits (10-15 characters)'
      ),
    student_email: z
      .string()
      .email(
        'Student email must be a valid email address (e.g., student@domain.com)'
      ),

    // Accommodation Info
    accommodation_type: z
      .string()
      .min(1, 'Accommodation type is required (e.g., DAY SCHOLAR, HOSTEL)'),
    hostel_type: z.string().optional().nullable(),
    bus_required: z
      .preprocess((val) => {
        if (val === null || val === undefined || val === '') return null;
        return String(val).toLowerCase() === 'true';
      }, z.boolean())
      .optional()
      .nullable(),
    bus_route: z.string().optional().nullable(),
    bus_pickup_location: z.string().optional().nullable(),

    // Reference Info
    reference_type: z.string().optional().nullable(),
    reference_name: z.string().optional().nullable(),
    reference_contact: z.string().optional().nullable(),

    // Optional fields (for potential immediate onboarding/user creation)
    roll_number: z.string().optional().nullable(),
    college_email: z
      .string()
      .email(
        'College email must be a valid email address (e.g., student@college.edu)'
      )
      .optional()
      .nullable()
  })
  .strict(); // Use strict to prevent unexpected extra fields

type NewStudentData = z.infer<typeof newStudentSchema>;

type ValidationError = {
  row: number;
  errors: Record<string, string[] | undefined>;
  rowData: Record<string, any>;
};

type DuplicateCheckResult = {
  isDuplicate: boolean;
  duplicateField: string;
  existingStudentInfo?: string;
};

// Function to check for existing students using direct Supabase queries
const checkForDuplicateStudent = async (
  studentData: NewStudentData
): Promise<DuplicateCheckResult> => {
  try {
    const { createClientSupabaseClient } = await import(
      '@/lib/supabase/client'
    );
    const supabase = createClientSupabaseClient();

    // Check by student email (most reliable unique identifier)
    if (studentData.student_email) {
      const { data: existingByEmail, error: emailError } = await supabase
        .from('students')
        .select('id, student_name')
        .eq('student_email', studentData.student_email)
        .limit(1);

      if (emailError) throw emailError;

      if (existingByEmail && existingByEmail.length > 0) {
        return {
          isDuplicate: true,
          duplicateField: 'student_email',
          existingStudentInfo: `Student with email "${studentData.student_email}" already exists: ${existingByEmail[0].student_name} (ID: ${existingByEmail[0].id})`
        };
      }
    }

    // Check by college email if provided
    if (studentData.college_email) {
      const { data: existingByCollegeEmail, error: collegeEmailError } =
        await supabase
          .from('students')
          .select('id, student_name')
          .eq('college_email', studentData.college_email)
          .limit(1);

      if (collegeEmailError) throw collegeEmailError;

      if (existingByCollegeEmail && existingByCollegeEmail.length > 0) {
        return {
          isDuplicate: true,
          duplicateField: 'college_email',
          existingStudentInfo: `Student with college email "${studentData.college_email}" already exists: ${existingByCollegeEmail[0].student_name} (ID: ${existingByCollegeEmail[0].id})`
        };
      }
    }

    // Check by roll number if provided
    if (studentData.roll_number) {
      const { data: existingByRoll, error: rollError } = await supabase
        .from('students')
        .select('id, student_name')
        .eq('roll_number', studentData.roll_number)
        .limit(1);

      if (rollError) throw rollError;

      if (existingByRoll && existingByRoll.length > 0) {
        return {
          isDuplicate: true,
          duplicateField: 'roll_number',
          existingStudentInfo: `Student with roll number "${studentData.roll_number}" already exists: ${existingByRoll[0].student_name} (ID: ${existingByRoll[0].id})`
        };
      }
    }

    // Check by mobile + name combination as additional check
    if (studentData.student_mobile && studentData.student_name) {
      const { data: existingByMobileAndName, error: mobileNameError } =
        await supabase
          .from('students')
          .select('id, student_name')
          .eq('student_mobile', studentData.student_mobile)
          .eq('student_name', studentData.student_name)
          .limit(1);

      if (mobileNameError) throw mobileNameError;

      if (existingByMobileAndName && existingByMobileAndName.length > 0) {
        return {
          isDuplicate: true,
          duplicateField: 'student_mobile + student_name',
          existingStudentInfo: `Student with mobile "${studentData.student_mobile}" and name "${studentData.student_name}" already exists (ID: ${existingByMobileAndName[0].id})`
        };
      }
    }

    return { isDuplicate: false, duplicateField: '' };
  } catch (error) {
    console.error('Error checking for duplicate student:', error);
    // Return false to not block upload due to check error, but log it
    return { isDuplicate: false, duplicateField: '' };
  }
};

export function BulkCreateStudents() {
  const router = useRouter(); // Add router
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [validRows, setValidRows] = useState<NewStudentData[]>([]); // Use NewStudentData type
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
    created?: number;
    failed?: number;
    usersCreated?: number;
    userCreationResults?: Array<{
      student_id: string;
      student_name: string;
      email: string;
      success: boolean;
      message?: string;
    }>;
  } | null>(null);

  const resetState = useCallback((keepOpen = false) => {
    setFile(null);
    setIsValidating(false);
    setIsUploading(false);
    setValidationErrors([]);
    setValidRows([]);
    setUploadProgress(0);
    setUploadResult(null);
    if (!keepOpen) {
      setIsOpen(false);
    }
  }, []);

  const handleFileValidation = useCallback(
    async (fileToValidate: File) => {
      setIsValidating(true);
      setValidationErrors([]);
      setValidRows([]);
      setUploadResult(null);
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const fileContent = event.target?.result;
          let parsedData: Record<string, any>[] = [];
          if (fileToValidate.type === 'text/csv') {
            const result = Papa.parse(fileContent as string, {
              header: true,
              skipEmptyLines: true,
              transformHeader: (header) => header.trim(),
              transform: (value) => value.trim(),
              dynamicTyping: false
            });
            if (result.errors.length > 0) {
              toast.error(`CSV parsing error: ${result.errors[0].message}`);
              setIsValidating(false);
              setFile(null);
              return;
            }
            parsedData = result.data as Record<string, any>[];
          } else {
            const workbook = XLSX.read(fileContent, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            parsedData = XLSX.utils.sheet_to_json(worksheet, {
              defval: '',
              raw: false
            }) as Record<string, any>[];
            parsedData = parsedData.map((row) => {
              const trimmedRow: Record<string, any> = {};
              for (const key in row) {
                const trimmedKey = key.trim();
                const value = row[key];
                trimmedRow[trimmedKey] =
                  typeof value === 'string' ? value.trim() : value;
              }
              return trimmedRow;
            });
          }
          if (parsedData.length === 0) {
            toast.error("File is empty or couldn't be parsed correctly.");
            resetState(true);
            return;
          }
          const errors: ValidationError[] = [];
          const valid: NewStudentData[] = [];
          const duplicateErrors: ValidationError[] = [];
          const headers = Object.keys(parsedData[0] || {});

          // Clean header names to remove potential asterisks from required field markers
          const cleanHeaders = headers.map((h) =>
            h.replace(/\s*\*\s*$/, '').trim()
          );

          const requiredSchemaFields = Object.entries(newStudentSchema.shape)
            .filter(
              ([_, schemaType]) =>
                !(schemaType.isOptional() || schemaType.isNullable())
            )
            .map(([key, _]) => key);

          const actualMissingHeaders = requiredSchemaFields.filter(
            (h) => !cleanHeaders.includes(h)
          );

          if (actualMissingHeaders.length > 0) {
            toast.error(
              `Missing required columns in the file: ${actualMissingHeaders.join(
                ', '
              )}`
            );
            resetState(true);
            return;
          }
          // Process each row with validation and duplicate checking
          for (let index = 0; index < parsedData.length; index++) {
            const row = parsedData[index];

            try {
              // Clean the row keys to remove asterisks and normalize data
              const processedRow: Record<string, any> = {};
              Object.entries(row).forEach(([key, value]) => {
                const cleanKey = key.replace(/\s*\*\s*$/, '').trim();
                processedRow[cleanKey] = value;
              });

              // Normalize boolean fields
              ['counseling_applied', 'first_graduate', 'bus_required'].forEach(
                (key) => {
                  if (typeof processedRow[key] === 'string') {
                    processedRow[key] = processedRow[key].trim().toLowerCase();
                  }
                }
              );

              // Step 1: Validate with Zod schema
              const result = newStudentSchema.safeParse(processedRow);
              if (!result.success) {
                errors.push({
                  row: index + 2,
                  errors: result.error.flatten().fieldErrors,
                  rowData: row
                });
                continue; // Skip to next row
              }

              const validData = result.data;

              // Step 2: Check for duplicates
              const duplicateCheck = await checkForDuplicateStudent(validData);
              if (duplicateCheck.isDuplicate) {
                duplicateErrors.push({
                  row: index + 2,
                  errors: {
                    [duplicateCheck.duplicateField]: [
                      `DUPLICATE: ${duplicateCheck.existingStudentInfo}`
                    ]
                  },
                  rowData: row
                });
                continue; // Skip to next row
              }

              // Step 3: Transform data (marks JSON conversion)
              try {
                // Transform separate marks fields into JSON format (only if data exists)
                let tenthMarksJson = null;
                if (
                  validData.tenth_marks_max_marks ||
                  validData.tenth_marks_obtained_marks ||
                  validData.tenth_marks_percentage
                ) {
                  tenthMarksJson = {
                    max_marks: validData.tenth_marks_max_marks || '',
                    obtained_marks: validData.tenth_marks_obtained_marks || '',
                    percentage: validData.tenth_marks_percentage || ''
                  };
                }

                // Build subjects object for 12th marks
                const subjects: Record<string, string> = {};
                if (validData.twelfth_marks_physics)
                  subjects.physics = validData.twelfth_marks_physics;
                if (validData.twelfth_marks_chemistry)
                  subjects.chemistry = validData.twelfth_marks_chemistry;
                if (validData.twelfth_marks_mathematics)
                  subjects.mathematics = validData.twelfth_marks_mathematics;
                if (validData.twelfth_marks_biology)
                  subjects.biology = validData.twelfth_marks_biology;
                if (validData.twelfth_marks_computer_science)
                  subjects.computerScience =
                    validData.twelfth_marks_computer_science;
                if (validData.twelfth_marks_other_subject)
                  subjects.other = validData.twelfth_marks_other_subject;

                let twelfthMarksJson = null;
                if (
                  validData.twelfth_marks_group ||
                  validData.twelfth_marks_max_marks ||
                  validData.twelfth_marks_obtained_marks ||
                  validData.twelfth_marks_percentage
                ) {
                  twelfthMarksJson = {
                    group: validData.twelfth_marks_group || '',
                    max_marks: validData.twelfth_marks_max_marks || '',
                    obtained_marks:
                      validData.twelfth_marks_obtained_marks || '',
                    percentage: validData.twelfth_marks_percentage || '',
                    subjects: subjects
                  };
                }

                // Create final data object with JSON fields (only include if data exists)
                const transformedData: any = { ...validData };
                if (tenthMarksJson) {
                  transformedData.tenth_marks_json =
                    JSON.stringify(tenthMarksJson);
                }
                if (twelfthMarksJson) {
                  transformedData.twelfth_marks_json =
                    JSON.stringify(twelfthMarksJson);
                }

                valid.push(transformedData as NewStudentData);
              } catch (transformError) {
                errors.push({
                  row: index + 2,
                  errors: {
                    marks_transform: [
                      'Failed to transform marks data into required format'
                    ]
                  },
                  rowData: row
                });
              }
            } catch (rowError) {
              console.error(`Error processing row ${index + 2}:`, rowError);
              errors.push({
                row: index + 2,
                errors: {
                  processing_error: [
                    `Row processing failed: ${
                      rowError instanceof Error
                        ? rowError.message
                        : 'Unknown error'
                    }`
                  ]
                },
                rowData: row
              });
            }
          }
          // Combine validation errors and duplicate errors
          const allErrors = [...errors, ...duplicateErrors];

          setValidationErrors(allErrors);
          setValidRows(valid);

          if (allErrors.length > 0) {
            const validationErrorCount = errors.length;
            const duplicateErrorCount = duplicateErrors.length;

            let errorMessage = `Validation finished with ${allErrors.length} error(s)`;
            if (validationErrorCount > 0 && duplicateErrorCount > 0) {
              errorMessage += ` (${validationErrorCount} validation errors, ${duplicateErrorCount} duplicates)`;
            } else if (duplicateErrorCount > 0) {
              errorMessage += ` (${duplicateErrorCount} duplicates found)`;
            }
            errorMessage += '. Please fix them before uploading.';

            toast(errorMessage, { icon: '⚠️' });
          } else if (valid.length > 0) {
            toast.success(
              `Validation successful! ${valid.length} rows ready for upload. No duplicates found.`
            );
          } else {
            toast('No valid rows found to upload after validation.', {
              icon: 'ℹ️'
            });
          }
        } catch (error) {
          console.error('Error processing file:', error);
          toast.error(
            'Failed to process the file. Ensure it is formatted correctly.'
          );
          resetState(true);
        } finally {
          setIsValidating(false);
        }
      };
      reader.onerror = () => {
        toast.error('Error reading the file.');
        setIsValidating(false);
        resetState(true);
      };
      if (fileToValidate.type === 'text/csv') {
        reader.readAsText(fileToValidate);
      } else {
        reader.readAsBinaryString(fileToValidate);
      }
    },
    [resetState]
  );
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      resetState(true);
      if (acceptedFiles.length > 0) {
        const selectedFile = acceptedFiles[0];
        if (
          selectedFile.type === 'text/csv' ||
          selectedFile.type === 'application/vnd.ms-excel' ||
          selectedFile.type ===
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ) {
          setFile(selectedFile);
          handleFileValidation(selectedFile);
        } else {
          toast.error('Invalid file type. Please upload a CSV or Excel file.');
        }
      }
    },
    [resetState, handleFileValidation]
  );

  const handleUpload = async () => {
    if (validRows.length === 0 || validationErrors.length > 0) {
      toast.error(
        'Cannot upload. Please ensure there are valid rows and no validation errors.'
      );
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setUploadResult(null);

    try {
      // Process rows in batches similar to the staff module
      const batchSize = 50;
      const batches = [];
      for (let i = 0; i < validRows.length; i += batchSize) {
        batches.push(validRows.slice(i, i + batchSize));
      }

      let createdCount = 0;
      let failedCount = 0;
      let usersCreatedCount = 0;
      const errorDetails: string[] = [];
      const userCreationResults: {
        student_id: string;
        student_name: string;
        email: string;
        success: boolean;
        message?: string;
      }[] = [];

      // Process each batch
      for (const batch of batches) {
        // Setting progress for batches
        setUploadProgress(Math.floor((createdCount / validRows.length) * 100));

        // Create a promise for each student in the batch
        const promises = batch.map(async (row) => {
          try {
            // Parse JSON strings that were created during validation
            const rowData = row as any;
            const tenthMarks =
              typeof rowData.tenth_marks_json === 'string'
                ? JSON.parse(rowData.tenth_marks_json)
                : rowData.tenth_marks_json;

            const twelfthMarks =
              typeof rowData.twelfth_marks_json === 'string'
                ? JSON.parse(rowData.twelfth_marks_json)
                : rowData.twelfth_marks_json;

            // Create a new object without the separate marks fields and _json fields
            const {
              tenth_marks_json,
              twelfth_marks_json,
              tenth_marks_max_marks,
              tenth_marks_obtained_marks,
              tenth_marks_percentage,
              twelfth_marks_group,
              twelfth_marks_max_marks,
              twelfth_marks_obtained_marks,
              twelfth_marks_percentage,
              twelfth_marks_physics,
              twelfth_marks_chemistry,
              twelfth_marks_mathematics,
              twelfth_marks_biology,
              twelfth_marks_computer_science,
              twelfth_marks_other_subject,
              ...restData
            } = rowData;

            // Add in the special fields handling and include defaults for required fields
            // Handle as type any to bypass complex strict type checking
            // We've already validated this data with Zod earlier
            const processedData = {
              ...restData,
              tenth_marks: tenthMarks,
              twelfth_marks: twelfthMarks,
              status: 'active',
              admission_id: null, // Use null instead of empty string for UUID field
              is_profile_complete: false,
              counseling_applied:
                typeof restData.counseling_applied === 'string'
                  ? String(restData.counseling_applied).toLowerCase() === 'true'
                  : Boolean(restData.counseling_applied),
              first_graduate:
                typeof restData.first_graduate === 'string'
                  ? String(restData.first_graduate).toLowerCase() === 'true'
                  : Boolean(restData.first_graduate),
              bus_required:
                typeof restData.bus_required === 'string'
                  ? String(restData.bus_required).toLowerCase() === 'true'
                  : Boolean(restData.bus_required)
            };

            // Create student using the enhanced service method with type assertion
            console.log(`Creating student: ${processedData.student_name}`);
            const result = await StudentService.createStudentWithUserResult(
              processedData as any
            );

            if (result.student) {
              createdCount++;

              // Check if user was created based on the result
              if (result.student.college_email) {
                // Record the result for tracking
                userCreationResults.push({
                  student_id: result.student.id,
                  student_name: result.student.student_name,
                  email: result.student.college_email,
                  success: result.userCreated,
                  message: result.userError
                });

                if (result.userCreated) {
                  usersCreatedCount++;
                }
              }
            }
          } catch (error) {
            console.error(`Error creating student:`, error);
            failedCount++;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            errorDetails.push(`Row ${batch.indexOf(row) + 1}: ${errorMessage}`);

            if (row.college_email) {
              userCreationResults.push({
                student_id: 'failed',
                student_name: row.student_name,
                email: row.college_email,
                success: false,
                message: errorMessage
              });
            }
          }
        });

        // Wait for all promises in the batch to complete
        await Promise.all(promises);
      }

      // Complete progress
      setUploadProgress(100);

      // Prepare result message
      const successMessage = `Created ${createdCount} students successfully.`;
      const failureMessage = failedCount > 0 ? ` Failed: ${failedCount}.` : '';
      const userMessage = ` ${usersCreatedCount} user accounts created.`;

      // Set the upload result
      setUploadResult({
        success: createdCount > 0,
        message: successMessage + failureMessage + userMessage,
        created: createdCount,
        failed: failedCount,
        usersCreated: usersCreatedCount,
        userCreationResults
      });

      // Show a single consolidated success/error toast
      if (createdCount > 0) {
        toast.success(successMessage + userMessage);
      }

      if (failedCount > 0) {
        // Only show detailed errors for a reasonable number of failures
        if (errorDetails.length <= 3) {
          toast.error(
            `Failed to create ${failedCount} students: ${errorDetails.join(
              '; '
            )}`
          );
        } else {
          toast.error(
            `Failed to create ${failedCount} students. See console for details.`
          );
          console.error('Student creation errors:', errorDetails);
        }
      }

      // Reset and refresh if completely successful
      if (failedCount === 0) {
        resetState();
        router.refresh();
      }
    } catch (error) {
      console.error('Error during bulk upload:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during upload.';
      setUploadResult({
        success: false,
        message,
        created: 0,
        failed: validRows.length
      });
      toast.error(`Upload failed: ${message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        '.xlsx'
      ]
    },
    maxFiles: 1
  });

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      resetState();
    }
  };

  // Helper function to group user creation results
  const getUserCreationSummary = () => {
    if (
      !uploadResult?.userCreationResults ||
      uploadResult.userCreationResults.length === 0
    ) {
      return null;
    }

    const successful = uploadResult.userCreationResults.filter(
      (r) => r.success
    );
    const failed = uploadResult.userCreationResults.filter((r) => !r.success);

    return (
      <div className='mt-4 space-y-4'>
        <h4 className='font-medium'>User Account Creation Summary</h4>

        <div className='flex items-center gap-2 text-sm'>
          <Badge
            variant='outline'
            className='bg-green-50 text-green-700 border-green-200'
          >
            Success: {successful.length}
          </Badge>
          <Badge
            variant='outline'
            className='bg-red-50 text-red-700 border-red-200'
          >
            Failed: {failed.length}
          </Badge>
        </div>

        {(successful.length > 0 || failed.length > 0) && (
          <Accordion type='single' collapsible className='w-full'>
            {successful.length > 0 && (
              <AccordionItem value='successful-users'>
                <AccordionTrigger className='text-sm'>
                  <span className='flex items-center'>
                    <CheckCircle className='h-4 w-4 mr-2 text-green-600' />
                    Created User Accounts ({successful.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className='text-xs space-y-1 max-h-[150px] overflow-y-auto'>
                    {successful.map((result, idx) => (
                      <div
                        key={`success-${idx}`}
                        className='py-1 border-b border-gray-100'
                      >
                        {result.student_name} ({result.email})
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {failed.length > 0 && (
              <AccordionItem value='failed-users'>
                <AccordionTrigger className='text-sm'>
                  <span className='flex items-center'>
                    <XCircle className='h-4 w-4 mr-2 text-red-600' />
                    Failed User Accounts ({failed.length})
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className='text-xs space-y-1 max-h-[150px] overflow-y-auto'>
                    {failed.map((result, idx) => (
                      <div
                        key={`failed-${idx}`}
                        className='py-1 border-b border-gray-100'
                      >
                        <span className='font-medium'>
                          {result.student_name}
                        </span>
                        <span className='mx-1'>({result.email})</span>
                        <span className='text-red-600'>
                          - {result.message || 'Unknown error'}
                        </span>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <Upload className='mr-2 h-4 w-4' />
          Bulk Create Students
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-3xl max-h-[80vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Bulk Create New Students</DialogTitle>
        </DialogHeader>
        <div className='flex-1 overflow-y-auto pr-2 space-y-4'>
          {!file && (
            <div
              {...getRootProps()}
              className={`mt-4 p-6 border-2 border-dashed rounded-md text-center cursor-pointer hover:border-primary transition-colors ${
                isDragActive ? 'border-primary bg-primary/10' : 'border-muted'
              }`}
            >
              <input {...getInputProps()} />
              <FileUp className='mx-auto h-10 w-10 text-muted-foreground mb-2' />
              {isDragActive ? (
                <p>Drop the file here ...</p>
              ) : (
                <p>Drag & drop CSV/Excel file here, or click to select</p>
              )}
              <p className='text-xs text-muted-foreground mt-1'>
                Upload file with new student data.
              </p>
            </div>
          )}

          {file && (
            <div className='space-y-2'>
              <div className='flex items-center justify-between text-sm'>
                <p className='font-medium'>Selected file: {file.name}</p>
                <Button
                  variant='ghost'
                  size='sm'
                  onClick={() => resetState(true)}
                  className='text-xs h-6'
                >
                  <X className='h-3 w-3 mr-1' /> Change File
                </Button>
              </div>

              {isValidating && (
                <div className='flex items-center space-x-2 text-sm text-muted-foreground'>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <span>Validating file and checking for duplicates...</span>
                </div>
              )}
              {isUploading && (
                <div className='space-y-1'>
                  <p className='text-sm text-muted-foreground'>Uploading...</p>
                  <Progress value={uploadProgress} className='w-full h-2' />
                </div>
              )}
              {uploadResult && (
                <Alert
                  variant={uploadResult.success ? 'default' : 'destructive'}
                >
                  {uploadResult.success ? (
                    <CheckCircle className='h-4 w-4' />
                  ) : (
                    <XCircle className='h-4 w-4' />
                  )}
                  <AlertTitle>
                    {uploadResult.success ? 'Upload Complete' : 'Upload Failed'}
                  </AlertTitle>
                  <AlertDescription>
                    {uploadResult.message}
                    {uploadResult.created !== undefined && (
                      <span className='ml-2 text-xs'>
                        (Created: {uploadResult.created})
                      </span>
                    )}
                    {uploadResult.failed !== undefined &&
                      uploadResult.failed > 0 && (
                        <span className='ml-2 text-xs'>
                          (Failed: {uploadResult.failed})
                        </span>
                      )}
                    {uploadResult.usersCreated !== undefined && (
                      <span className='ml-2 text-xs'>
                        (User Accounts: {uploadResult.usersCreated})
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {/* Add user creation details */}
              {getUserCreationSummary()}
            </div>
          )}

          {validationErrors.length > 0 && (
            <div className='space-y-2'>
              <h4 className='font-semibold text-destructive'>
                Validation Errors ({validationErrors.length}):
              </h4>
              <Alert variant='destructive'>
                <AlertCircle className='h-4 w-4' />
                <AlertTitle>Please fix the errors in your file</AlertTitle>
                <AlertDescription>
                  <ScrollArea className='h-[150px] mt-2'>
                    <Table className='table-fixed text-xs'>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='w-[50px]'>Row</TableHead>
                          <TableHead className='w-[120px]'>Field</TableHead>
                          <TableHead>Error</TableHead>
                          <TableHead>Value Found</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {validationErrors.map((err, index) => (
                          <React.Fragment key={`error-group-${index}`}>
                            {Object.entries(err.errors).map(
                              ([field, messages]) =>
                                messages?.map((msg, msgIdx) => (
                                  <TableRow
                                    key={`error-${index}-${field}-${msgIdx}`}
                                  >
                                    {msgIdx === 0 && (
                                      <TableCell
                                        rowSpan={
                                          Object.values(err.errors).flat()
                                            .length
                                        }
                                        className='align-top font-medium'
                                      >
                                        {err.row}
                                      </TableCell>
                                    )}
                                    <TableCell className='font-mono break-words'>
                                      {field}
                                    </TableCell>
                                    <TableCell className='break-words'>
                                      {msg}
                                    </TableCell>
                                    <TableCell className='font-mono break-words'>
                                      {String(
                                        err.rowData[field] !== undefined &&
                                          err.rowData[field] !== null
                                          ? err.rowData[field]
                                          : '[empty]'
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))
                            )}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
        <DialogFooter className='mt-4 pt-4 border-t'>
          <DialogClose asChild>
            <Button
              variant='outline'
              onClick={() => resetState()}
              disabled={isUploading}
            >
              Cancel
            </Button>
          </DialogClose>
          <Button
            onClick={handleUpload}
            disabled={
              !file ||
              validRows.length === 0 ||
              validationErrors.length > 0 ||
              isUploading ||
              isValidating
            }
          >
            {isUploading ? (
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            ) : null}
            Upload {validRows.length > 0 ? `(${validRows.length})` : ''} Valid
            Records
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
