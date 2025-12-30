// ============================================
// ENHANCED BULK UPLOAD PROFILES DIALOG
// ============================================
// Created: 2025-01-27
// Purpose: Multi-step bulk upload with preview, validation, and confirmation
// Features: Data preview, row-by-row validation, error display, progress tracking
// ============================================

'use client';

import { useState, useRef, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  UploadCloud,
  Download,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  FileText,
  Eye,
  TrendingUp,
  ArrowRight,
  ArrowLeft,
  X,
  Filter,
  UserPlus
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import {
  mapColumns,
  sanitizeValue,
  validateRow,
  findDuplicateEmails,
  validateDatabaseFields,
  getDatabaseValidationErrors,
  type ValidationResult,
  type DatabaseValidationResult,
  type DatabaseValidationErrors
} from '@/lib/utils/bulk-upload-validation';
import type {
  ParsedRow,
  UploadState,
  ValidationSummary,
  FilterType,
  UploadResult
} from './bulk-upload-types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

// Define REQUIRED fields (warnings about these fields are important)
const REQUIRED_FIELDS = [
  'first_name', 'last_name', 'date_of_birth', 'gender', 'religion', 'community', 'caste',
  'father_name', 'father_mobile', 'mother_name', 'mother_mobile',
  'institution_name', 'department_name', 'program_name', 'semester_name', 'section_name', 'academic_year_name',
  'student_mobile', 'college_email',
  'permanent_address_street', 'permanent_address_taluk', 'permanent_address_district',
  'permanent_address_pin_code', 'permanent_address_state',
  'entry_type', 'scholarship_type', 'accommodation_type'
];

// Helper component to display validation issues (errors and warnings)
function IssuesDisplay({
  validationResult,
  databaseValidationErrors
}: {
  validationResult: ValidationResult;
  databaseValidationErrors?: DatabaseValidationErrors;
}) {
  // Filter warnings to only show for required fields
  const relevantWarnings = validationResult.warnings.filter((warning) => {
    const warningLower = warning.toLowerCase();
    return REQUIRED_FIELDS.some((field) => {
      const fieldWithSpaces = field.replace(/_/g, ' ');
      return warningLower.includes(fieldWithSpaces);
    });
  });

  const hasFormatErrors = validationResult.errors.length > 0;
  const hasDbErrors = databaseValidationErrors && Object.keys(databaseValidationErrors).length > 0;
  const hasAnyErrors = hasFormatErrors || hasDbErrors;

  return (
    <div className="space-y-1.5">
      {/* FORMAT VALIDATION ERRORS */}
      {hasFormatErrors && (
        <>
          {validationResult.errors.slice(0, 2).map((error, idx) => (
            <div key={`error-${idx}`} className="text-xs text-red-600 font-medium break-words">
              <span className="font-bold">❌ {error.field}:</span> {error.message}
            </div>
          ))}
          {validationResult.errors.length > 2 && (
            <div className="text-xs text-red-500 font-medium">
              +{validationResult.errors.length - 2} more format errors
            </div>
          )}
        </>
      )}

      {/* DATABASE VALIDATION ERRORS WITH SUGGESTIONS */}
      {hasDbErrors && (
        <>
          {Object.entries(databaseValidationErrors!).map(([field, errorData], idx) => (
            <div key={`db-error-${idx}`} className="space-y-0.5">
              <div className="text-xs text-red-600 font-medium break-words">
                <span className="font-bold">❌ {field}:</span> {errorData.error}
              </div>
              {errorData.suggestions && errorData.suggestions.length > 0 && (
                <div className="text-xs text-blue-600 pl-4 break-words">
                  <span className="font-semibold">💡 Try:</span>{' '}
                  {errorData.suggestions.slice(0, 3).join(', ')}
                  {errorData.suggestions.length > 3 && ` +${errorData.suggestions.length - 3} more`}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* Show warnings ONLY for required fields (if no errors) */}
      {!hasAnyErrors && relevantWarnings.length > 0 && (
        <>
          {relevantWarnings.slice(0, 2).map((warning, idx) => (
            <div key={`warning-${idx}`} className="text-xs text-amber-600 break-words">
              ⚠️ {warning}
            </div>
          ))}
          {relevantWarnings.length > 2 && (
            <div className="text-xs text-amber-500">
              +{relevantWarnings.length - 2} more warnings
            </div>
          )}
        </>
      )}

      {/* Show "All Good" if no issues */}
      {!hasAnyErrors && relevantWarnings.length === 0 && (
        <div className="text-xs text-green-600 font-medium">
          ✓ All fields validated
        </div>
      )}
    </div>
  );
}

export function BulkUploadProfilesDialogEnhanced({ onSuccess }: { onSuccess?: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterType>('all');

  // State management
  const [state, setState] = useState<UploadState>({
    step: 'select-file',
    file: null,
    parsedRows: [],
    validationSummary: {
      totalRows: 0,
      validRows: 0,
      warningRows: 0,
      errorRows: 0,
      duplicateEmails: 0,
      selectedRows: 0
    },
    databaseValidationResult: null,
    isValidatingDatabase: false,
    uploadProgress: 0,
    result: null,
    error: null
  });

  // Download template function (same as original)
  const downloadTemplate = () => {
    try {
      // Create sample data with REQUIRED fields first, then OPTIONAL fields
      const sampleData = [{
        // ============================================
        // REQUIRED FIELDS (marked with *)
        // ============================================

        // Basic Details
        '* First Name': 'JOHN',
        '* Last Name': 'DOE',
        '* Date of Birth': '2005-01-15',
        '* Gender': 'MALE',
        '* Religion': 'HINDU',
        '* Community': 'BC',
        '* Caste': 'OBC',

        // Parent/Guardian Information
        '* Father Name': 'ROBERT DOE',
        '* Father Mobile': '9876543211',
        '* Mother Name': 'MARY DOE',
        '* Mother Mobile': '9876543212',

        // Academic Assignment
        '* Institution': 'JKKN College of Engineering and Technology',
        '* Degree': 'B.E',
        '* Department': 'Computer Science and Engineering',
        '* Program': 'CSE',
        '* Semester': 'I Year I Semester',
        '* Section': 'A',
        '* Academic Year': '2024-2025',

        // Contact Details
        '* Student Mobile': '9876543210',
        '* College Email': 'john.doe@jkkn.ac.in',

        // Address Information
        '* Permanent Address Street': '123 Main Street',
        '* Permanent Address Taluk': 'Namakkal',
        '* Permanent Address District': 'Namakkal',
        '* Permanent Address Pin Code': '637001',
        '* Permanent Address State': 'Tamil Nadu',

        // Entry Type & Scholarship Type
        '* Entry Type': 'FIRST YEAR',
        '* Scholarship Type': 'FIRST GRADUATE',

        // Accommodation
        '* Accommodation Type': 'HOSTEL',

        // ============================================
        // OPTIONAL FIELDS
        // ============================================

        // Basic Details (Optional)
        'Aadhar Number': '123456789012',
        'Blood Group': 'O+',
        'Admission Year': '2024',

        // Parent/Guardian (Optional)
        'Father Occupation': 'Business',
        'Mother Occupation': 'Teacher',
        'Annual Income': '500000',

        // Academic (Optional)
        'Regulation': 'R2021',
        'Batch': '2024-2028',

        // Contact (Optional)
        'Personal Email': 'john@gmail.com',

        // Accommodation (Optional)
        'Hostel Type': 'AC HOSTEL',
        'Food Type': 'VEG',

        // Previous Education (Optional)
        'Last School': 'St. Mary\'s High School',
        'Board of Study': 'CBSE',
        '10th Marks': '{"overall": "95", "maths": "98", "science": "96", "english": "92"}',
        '12th Marks': '{"overall": "92", "physics": "95", "chemistry": "94", "maths": "98"}',
        'Medical Cutoff Marks': '180',
        'Engineering Cutoff Marks': '185',

        // Entrance Exams (Optional)
        'NEET Roll Number': 'NEET2024123456',
        'NEET Score': '625',

        // Counseling (Optional)
        'Counseling Applied': 'TRUE',
        'Counseling Number': 'COUN2024001',
        'Quota': 'MANAGEMENT',
        'Category': 'General',

        // Transport (Optional)
        'Bus Required': 'TRUE',
        'Bus Route': 'Route 5',
        'Bus Pickup Location': 'Central Bus Stand',

        // Reference (Optional)
        'Reference Type': 'Alumni',
        'Reference Name': 'Dr. Kumar',
        'Reference Contact': '9876543299',

        // Student IDs (Optional - auto-generated if not provided)
        'Roll Number': '24CSE001',
        'Register Number': '241CS001',
        'Student Photo URL': 'https://example.com/photos/john.jpg',
      }];

      // Create Instructions sheet with concise information
      const instructionsData = [
        { '': '' },
        { 'BULK UPLOAD LEARNERS - QUICK REFERENCE GUIDE': '' },
        { '': '' },

        { '📋 HOW TO USE THIS TEMPLATE': '' },
        { '1': 'Switch to the "Template" sheet (tab at the bottom of this file)' },
        { '2': 'Fill in all REQUIRED fields (marked with * asterisk)' },
        { '3': 'Fill OPTIONAL fields only if data is available' },
        { '4': 'Save the file and upload it to the system' },
        { '5': 'Fix any validation errors shown and re-upload if needed' },
        { '': '' },

        { '📊 FIELD REQUIREMENTS': '' },
        { 'Required Fields (28)': 'Must be filled for every student - marked with * in template' },
        { 'Optional Fields (35)': 'Can be left blank - no asterisk in template' },
        { '': '' },

        { '✅ DROPDOWN FIELDS - VALID VALUES ONLY': '' },
        { 'Field Name': 'Valid Options (use these exact values)' },
        { '': '' },
        { '* Gender (Required)': 'MALE  |  FEMALE  |  OTHER' },
        { '* Religion (Required)': 'HINDU  |  CHRISTIAN  |  MUSLIM  |  SIKH  |  BUDDHIST  |  JAIN  |  OTHERS' },
        { '* Community (Required)': 'OC  |  BC  |  BCM  |  MBC  |  DNC  |  BC-CC  |  SC  |  ST  |  SBC  |  SC (A)' },
        { '* Entry Type (Required)': 'FIRST YEAR  |  LATERAL ENTRY  |  RE-ADMISSION  |  COLLEGE TRANSFER' },
        { '* Accommodation Type (Required)': 'HOSTEL  |  DAY SCHOLAR  |  HOME' },
        { '* Scholarship Type (Required)': 'FIRST GRADUATE  |  PMS SCHOLARSHIP  |  7.5% SCHOLARSHIP  |  NOT APPLICABLE' },
        { '': '' },
        { 'Blood Group (Optional)': 'A+  |  A-  |  B+  |  B-  |  AB+  |  AB-  |  O+  |  O-  |  A1+  |  A1B' },
        { 'Hostel Type (Optional)': 'AC HOSTEL  |  NON-AC HOSTEL' },
        { 'Food Type (Optional)': 'VEG  |  NON-VEG  |  VEGAN' },
        { 'Quota (Optional)': 'GOVERNMENT  |  MANAGEMENT' },
        { 'Counseling Applied (Optional)': 'TRUE  |  FALSE  |  YES  |  NO  |  1  |  0' },
        { 'Bus Required (Optional)': 'TRUE  |  FALSE  |  YES  |  NO  |  1  |  0' },
        { '': '' },

        { '📝 FORMAT GUIDELINES': '' },
        { 'Date of Birth': 'YYYY-MM-DD  (Example: 2005-01-15)' },
        { 'Mobile Numbers': '10 digits, no spaces/dashes  (Example: 9876543210)' },
        { 'Pin Code': '6 digits  (Example: 637001)' },
        { 'College Email': 'Must end with @jkkn.ac.in  (Example: john.doe@jkkn.ac.in)' },
        { 'Academic Year': 'YYYY-YYYY  (Example: 2024-2025)' },
        { 'Aadhar Number': '12 digits  (Example: 123456789012)' },
        { '10th/12th Marks': 'JSON format  (Example: {"overall": "95", "maths": "98"})' },
        { '': '' },

        { '❌ COMMON MISTAKES': '' },
        { 'Wrong': 'Correct' },
        { 'Entry Type: "FIRST YEAR"': 'Use: REGULAR' },
        { 'Gender: "M" or "F"': 'Use: MALE or FEMALE' },
        { 'Hostel Type: "Boys Hostel"': 'Use: AC HOSTEL or NON-AC HOSTEL' },
        { 'Religion: "Hindu"': 'Use: HINDU (all uppercase)' },
        { 'Email: john@gmail.com': 'Use: john.doe@jkkn.ac.in' },
        { 'Mobile: 98765-43210': 'Use: 9876543210 (no dashes)' },
        { 'Date: 15/01/2005': 'Use: 2005-01-15 (YYYY-MM-DD)' },
        { 'Pin Code: 63701 (5 digits)': 'Use: 637001 (6 digits)' },
        { '': '' },

        { '💡 TIPS FOR SUCCESS': '' },
        { '✓': 'All dropdown values are case-insensitive (MALE = male = Male)' },
        { '✓': 'Required fields marked with * must be filled' },
        { '✓': 'Delete the example row before uploading your actual data' },
        { '✓': 'Copy-paste the example row to create more student entries' },
        { '✓': 'Institution, Department, Program names must match exactly as in database' },
        { '✓': 'Validation errors will show clearly - fix and re-upload' },
        { '✓': 'Download fresh template if you make too many errors' },
        { '': '' },

        { '📞 SUPPORT': '' },
        { 'Need Help?': 'Contact your system administrator' },
        { 'Documentation': 'Refer to bulk-upload-learners-valid-values.md' },
        { 'Last Updated': '2025-12-29' },
        { 'Version': '1.3.0' }
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Add Instructions sheet first
      const wsInstructions = XLSX.utils.json_to_sheet(instructionsData);

      // Set column widths for instructions sheet
      wsInstructions['!cols'] = [
        { wch: 35 }, // Column A (Field names)
        { wch: 50 }, // Column B (Descriptions)
        { wch: 45 }  // Column C (Examples)
      ];

      XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

      // Add Template sheet
      const wsTemplate = XLSX.utils.json_to_sheet(sampleData);
      XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template');

      // Write file
      XLSX.writeFile(wb, 'bulk-upload-profiles-template.xlsx');
      toast.success('Template with instructions downloaded successfully!');
    } catch (error) {
      console.error('[bulk-upload-enhanced] Error generating template:', error);
      toast.error('Failed to generate template');
    }
  };

  // Handle file selection
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.csv')) {
      toast.error('Please upload an Excel (.xlsx) or CSV file');
      return;
    }

    setState(prev => ({ ...prev, file, step: 'preview-data', error: null }));

    // Parse file
    try {
      await parseAndValidateFile(file);
    } catch (error) {
      console.error('[bulk-upload-enhanced] Parse error:', error);
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to parse file',
        step: 'select-file'
      }));
      toast.error('Failed to parse file');
    }
  };

  // Parse and validate file
  const parseAndValidateFile = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);

          if (jsonData.length === 0) {
            reject(new Error('No data found in file'));
            return;
          }

          // Parse and map rows
          const parsedRows: ParsedRow[] = jsonData.map((row: any, index) => {
            const mappedData = mapColumns(row);

            // Debug: Log first row to see what's in the Excel file
            if (index === 0) {
              console.log('[bulk-upload-dialog] 📋 First row RAW from Excel:', row);
              console.log('[bulk-upload-dialog] 🗺️ After column mapping:', {
                last_name: mappedData.last_name,
                caste: mappedData.caste,
                academic_year_name: mappedData.academic_year_name,
                scholarship_type: mappedData.scholarship_type
              });
            }

            // Sanitize data
            const sanitizedData = {
              // SECTION 1: Basic Details
              first_name: sanitizeValue(mappedData.first_name, 'text'),
              last_name: sanitizeValue(mappedData.last_name, 'text'),
              date_of_birth: sanitizeValue(mappedData.date_of_birth, 'date'),
              gender: sanitizeValue(mappedData.gender, 'text'),
              religion: sanitizeValue(mappedData.religion, 'text'),
              community: sanitizeValue(mappedData.community, 'text'),
              caste: sanitizeValue(mappedData.caste, 'text'),
              aadhar_number: sanitizeValue(mappedData.aadhar_number, 'number'),
              blood_group: sanitizeValue(mappedData.blood_group, 'text'),
              admission_year: sanitizeValue(mappedData.admission_year, 'text'),

              // SECTION 2: Parent/Guardian Information
              father_name: sanitizeValue(mappedData.father_name, 'text'),
              father_occupation: sanitizeValue(mappedData.father_occupation, 'text'),
              father_mobile: sanitizeValue(mappedData.father_mobile, 'mobile'),
              mother_name: sanitizeValue(mappedData.mother_name, 'text'),
              mother_occupation: sanitizeValue(mappedData.mother_occupation, 'text'),
              mother_mobile: sanitizeValue(mappedData.mother_mobile, 'mobile'),
              annual_income: sanitizeValue(mappedData.annual_income, 'number'),

              // SECTION 3: Academic Assignment
              institution_name: sanitizeValue(mappedData.institution_name, 'text'),
              degree_name: sanitizeValue(mappedData.degree_name, 'text'),
              department_name: sanitizeValue(mappedData.department_name, 'text'),
              program_name: sanitizeValue(mappedData.program_name, 'text'),
              semester_name: sanitizeValue(mappedData.semester_name, 'text'),
              section_name: sanitizeValue(mappedData.section_name, 'text'),
              academic_year_name: sanitizeValue(mappedData.academic_year_name, 'text'),
              regulation_name: sanitizeValue(mappedData.regulation_name, 'text'),
              batch_name: sanitizeValue(mappedData.batch_name, 'text'),

              // SECTION 4: Contact Details
              student_mobile: sanitizeValue(mappedData.student_mobile, 'mobile'),
              college_email: sanitizeValue(mappedData.college_email, 'email'),
              student_email: sanitizeValue(mappedData.student_email, 'email'),

              // SECTION 5: Address Information
              permanent_address_street: sanitizeValue(mappedData.permanent_address_street, 'text'),
              permanent_address_taluk: sanitizeValue(mappedData.permanent_address_taluk, 'text'),
              permanent_address_district: sanitizeValue(mappedData.permanent_address_district, 'text'),
              permanent_address_pin_code: sanitizeValue(mappedData.permanent_address_pin_code, 'number'),
              permanent_address_state: sanitizeValue(mappedData.permanent_address_state, 'text'),

              // SECTION 6: Entry Type & Scholarship Type
              entry_type: sanitizeValue(mappedData.entry_type, 'text'),
              scholarship_type: sanitizeValue(mappedData.scholarship_type, 'text'),

              // SECTION 7: Accommodation
              accommodation_type: sanitizeValue(mappedData.accommodation_type, 'text'),
              hostel_type: sanitizeValue(mappedData.hostel_type, 'text'),
              food_type: sanitizeValue(mappedData.food_type, 'text'),

              // SECTION 8: Previous Education
              last_school: sanitizeValue(mappedData.last_school, 'text'),
              board_of_study: sanitizeValue(mappedData.board_of_study, 'text'),
              tenth_marks: sanitizeValue(mappedData.tenth_marks, 'text'),
              twelfth_marks: sanitizeValue(mappedData.twelfth_marks, 'text'),
              medical_cutoff_marks: sanitizeValue(mappedData.medical_cutoff_marks, 'text'),
              engineering_cutoff_marks: sanitizeValue(mappedData.engineering_cutoff_marks, 'text'),

              // SECTION 9: Entrance Exams
              neet_roll_number: sanitizeValue(mappedData.neet_roll_number, 'text'),
              neet_score: sanitizeValue(mappedData.neet_score, 'text'),

              // SECTION 10: Counseling Information
              counseling_applied: sanitizeValue(mappedData.counseling_applied, 'text'),
              counseling_number: sanitizeValue(mappedData.counseling_number, 'text'),
              quota: sanitizeValue(mappedData.quota, 'text'),
              category: sanitizeValue(mappedData.category, 'text'),

              // SECTION 11: Transport
              bus_required: sanitizeValue(mappedData.bus_required, 'text'),
              bus_route: sanitizeValue(mappedData.bus_route, 'text'),
              bus_pickup_location: sanitizeValue(mappedData.bus_pickup_location, 'text'),

              // SECTION 12: Reference Information
              reference_type: sanitizeValue(mappedData.reference_type, 'text'),
              reference_name: sanitizeValue(mappedData.reference_name, 'text'),
              reference_contact: sanitizeValue(mappedData.reference_contact, 'text'),

              // SECTION 13: Student IDs
              roll_number: sanitizeValue(mappedData.roll_number, 'text'),
              register_number: sanitizeValue(mappedData.register_number, 'text'),
              student_photo_url: sanitizeValue(mappedData.student_photo_url, 'text'),
            };

            // Debug: Log first row after sanitization
            if (index === 0) {
              console.log('[bulk-upload-dialog] 🧹 After sanitization:', {
                last_name: sanitizedData.last_name,
                caste: sanitizedData.caste,
                academic_year_name: sanitizedData.academic_year_name,
                scholarship_type: sanitizedData.scholarship_type
              });
            }

            // Validate row
            const validationResult = validateRow(sanitizedData);

            return {
              rowNumber: index + 2, // Excel row number (1-indexed + header row)
              originalData: row,
              mappedData,
              sanitizedData,
              validationStatus: validationResult.status,
              validationResult,
              selected: validationResult.status === 'valid' || validationResult.status === 'warning',
              isDuplicate: false
            };
          });

          // Check for duplicate emails
          const duplicates = findDuplicateEmails(parsedRows);
          duplicates.forEach((rowIndices) => {
            rowIndices.forEach((rowIndex) => {
              parsedRows[rowIndex].isDuplicate = true;
              parsedRows[rowIndex].validationStatus = 'error';
              parsedRows[rowIndex].validationResult?.errors.push({
                field: 'college_email',
                message: 'Duplicate email in this file'
              });
            });
          });

          // Calculate summary
          const summary: ValidationSummary = {
            totalRows: parsedRows.length,
            validRows: parsedRows.filter(r => r.validationStatus === 'valid').length,
            warningRows: parsedRows.filter(r => r.validationStatus === 'warning').length,
            errorRows: parsedRows.filter(r => r.validationStatus === 'error').length,
            duplicateEmails: duplicates.size,
            selectedRows: parsedRows.filter(r => r.selected).length
          };

          setState(prev => ({
            ...prev,
            parsedRows,
            validationSummary: summary,
            step: 'validating-format'
          }));

          toast.success(`Format validation complete: ${summary.validRows} valid, ${summary.errorRows} errors.`);

          // Now perform database validation
          performDatabaseValidation(parsedRows);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  };

  // Perform database validation
  const performDatabaseValidation = async (parsedRows: ParsedRow[]) => {
    try {
      setState(prev => ({ ...prev, step: 'validating-database', isValidatingDatabase: true }));
      toast.loading('Validating against database...', { id: 'db-validation' });

      // Call database validation API
      const dbValidationResult = await validateDatabaseFields(parsedRows);

      // Log database validation results for debugging
      console.log('[bulk-upload] Database validation complete');

      const notFoundInstitutions = Object.entries(dbValidationResult.institutions)
        .filter(([_, v]) => !v.found)
        .map(([name, v]) => ({ name, error: v.error, suggestions: v.suggestions }));

      const notFoundPrograms = Object.entries(dbValidationResult.programs)
        .filter(([_, v]) => !v.found)
        .map(([name, v]) => ({ name, error: v.error, suggestions: v.suggestions }));

      const notFoundSemesters = Object.entries(dbValidationResult.semesters)
        .filter(([_, v]) => !v.found)
        .map(([key, v]) => ({ key, error: v.error, suggestions: v.suggestions }));

      const notFoundSections = Object.entries(dbValidationResult.sections)
        .filter(([_, v]) => !v.found)
        .map(([key, v]) => ({ key, error: v.error, suggestions: v.suggestions }));

      const notFoundDegrees = Object.entries(dbValidationResult.degrees)
        .filter(([_, v]) => !v.found)
        .map(([name, v]) => ({ name, error: v.error, suggestions: v.suggestions }));

      const notFoundDepartments = Object.entries(dbValidationResult.departments)
        .filter(([_, v]) => !v.found)
        .map(([name, v]) => ({ name, error: v.error, suggestions: v.suggestions }));

      if (notFoundInstitutions.length > 0) {
        console.warn('[bulk-upload] ❌ Institutions not found:', notFoundInstitutions);
      }
      if (notFoundPrograms.length > 0) {
        console.warn('[bulk-upload] ❌ Programs not found:', notFoundPrograms);
      }
      if (notFoundSemesters.length > 0) {
        console.warn('[bulk-upload] ❌ Semesters not found (may not belong to program):', notFoundSemesters);
      }
      if (notFoundSections.length > 0) {
        console.warn('[bulk-upload] ❌ Sections not found (may not belong to program/semester):', notFoundSections);
      }
      if (notFoundDegrees.length > 0) {
        console.warn('[bulk-upload] ❌ Degrees not found:', notFoundDegrees);
      }
      if (notFoundDepartments.length > 0) {
        console.warn('[bulk-upload] ❌ Departments not found:', notFoundDepartments);
      }

      const totalErrors = notFoundInstitutions.length + notFoundPrograms.length +
                         notFoundSemesters.length + notFoundSections.length +
                         notFoundDegrees.length + notFoundDepartments.length;

      if (totalErrors === 0) {
        console.log('[bulk-upload] ✅ All database validations passed!');
      } else {
        console.warn(`[bulk-upload] ⚠️ Found ${totalErrors} database validation errors across ${parsedRows.length} rows`);
      }

      // Merge database validation results with existing validation
      const updatedRows = parsedRows.map(row => {
        const dbErrors = getDatabaseValidationErrors(row.sanitizedData, dbValidationResult);
        const hasDbErrors = Object.keys(dbErrors).length > 0;

        // Add database validation errors to the row
        const updatedRow: ParsedRow = {
          ...row,
          databaseValidationErrors: dbErrors
        };

        // Update validation status based on database + format validation
        if (row.validationStatus === 'error') {
          // Keep error status if format validation failed
          updatedRow.validationStatus = 'error';
        } else if (hasDbErrors) {
          // Set to error if database validation failed
          updatedRow.validationStatus = 'error';
          updatedRow.selected = false; // Unselect rows with database errors
        }

        return updatedRow;
      });

      // Recalculate summary with database validation results
      const summary: ValidationSummary = {
        totalRows: updatedRows.length,
        validRows: updatedRows.filter(r => r.validationStatus === 'valid').length,
        warningRows: updatedRows.filter(r => r.validationStatus === 'warning').length,
        errorRows: updatedRows.filter(r => r.validationStatus === 'error').length,
        duplicateEmails: state.validationSummary.duplicateEmails,
        selectedRows: updatedRows.filter(r => r.selected).length
      };

      setState(prev => ({
        ...prev,
        parsedRows: updatedRows,
        validationSummary: summary,
        databaseValidationResult: dbValidationResult,
        isValidatingDatabase: false,
        step: 'validate'
      }));

      toast.dismiss('db-validation');

      if (summary.errorRows > 0) {
        toast.error(`Database validation found ${summary.errorRows} errors. Check suggestions.`);
      } else {
        toast.success('Database validation complete! All fields verified.');
      }
    } catch (error) {
      console.error('[bulk-upload] Database validation failed:', error);
      setState(prev => ({
        ...prev,
        isValidatingDatabase: false,
        step: 'validate',
        error: error instanceof Error ? error.message : 'Database validation failed'
      }));
      toast.dismiss('db-validation');
      toast.error('Database validation failed. You can still upload, but some rows may fail.');
    }
  };

  // Toggle row selection
  const toggleRowSelection = (rowNumber: number) => {
    setState(prev => ({
      ...prev,
      parsedRows: prev.parsedRows.map(row =>
        row.rowNumber === rowNumber ? { ...row, selected: !row.selected } : row
      ),
      validationSummary: {
        ...prev.validationSummary,
        selectedRows: prev.parsedRows.filter(r =>
          r.rowNumber === rowNumber ? !r.selected : r.selected
        ).length
      }
    }));
  };

  // Select all/none
  const toggleSelectAll = (selected: boolean) => {
    setState(prev => ({
      ...prev,
      parsedRows: prev.parsedRows.map(row => ({
        ...row,
        selected: row.validationStatus !== 'error' && selected
      })),
      validationSummary: {
        ...prev.validationSummary,
        selectedRows: selected
          ? prev.parsedRows.filter(r => r.validationStatus !== 'error').length
          : 0
      }
    }));
  };

  // Handle upload
  const handleUpload = async () => {
    if (state.validationSummary.selectedRows === 0) {
      toast.error('No valid rows selected for upload');
      return;
    }

    setState(prev => ({ ...prev, step: 'uploading', uploadProgress: 0 }));

    try {
      // Prepare FormData with only selected rows
      const selectedRows = state.parsedRows.filter(r => r.selected);

      // FIX: Use sanitizedData instead of originalData to preserve processed values
      // originalData has raw Excel columns like "* Last Name" which lose data during re-parsing
      // sanitizedData has clean columns like "last_name" with properly processed values
      const dataToUpload = selectedRows.map(row => row.sanitizedData);

      console.log('[bulk-upload-dialog] 📤 Uploading', selectedRows.length, 'rows with sanitized data');
      if (selectedRows.length > 0) {
        console.log('[bulk-upload-dialog] ✅ Sample row being uploaded:', {
          last_name: selectedRows[0].sanitizedData.last_name,
          caste: selectedRows[0].sanitizedData.caste,
          academic_year_name: selectedRows[0].sanitizedData.academic_year_name,
          scholarship_type: selectedRows[0].sanitizedData.scholarship_type
        });
      }

      const ws = XLSX.utils.json_to_sheet(dataToUpload);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Upload');

      // Convert to blob
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const uploadFile = new File([blob], state.file?.name || 'upload.xlsx');

      // Create FormData
      const formData = new FormData();
      formData.append('file', uploadFile);

      // Calculate count-based progress
      const totalRows = selectedRows.length;
      const BATCH_SIZE = 75;
      const estimatedBatches = Math.ceil(totalRows / BATCH_SIZE);
      const timePerBatch = 2000; // 2 seconds per batch estimate

      console.log(`[bulk-upload] Starting upload: ${totalRows} rows, ${estimatedBatches} batches estimated`);

      let currentProgress = 0;
      const progressInterval = setInterval(() => {
        currentProgress += (100 / estimatedBatches);
        setState(prev => ({
          ...prev,
          uploadProgress: Math.min(Math.round(currentProgress), 95)
        }));
      }, timePerBatch);

      // Upload to API
      const response = await fetch('/api/learners/bulk-upload-profiles', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setState(prev => ({ ...prev, uploadProgress: 100 }));
      console.log('[bulk-upload] Upload complete, progress set to 100%');

      const data: UploadResult = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.errors?.[0]?.error || 'Upload failed');
      }

      setState(prev => ({ ...prev, result: data, step: 'results' }));

      // Show success message
      const { upload_summary, user_creation_summary } = data;
      if (upload_summary.learners_created > 0) {
        toast.success(
          `Successfully created ${upload_summary.learners_created} learners! ` +
          `${user_creation_summary.new_users_created} user accounts created.`
        );
      }

      if (upload_summary.learners_failed > 0) {
        toast.error(`${upload_summary.learners_failed} learners failed to create`);
      }

      if (onSuccess && upload_summary.learners_created > 0) {
        onSuccess();
      }
    } catch (error) {
      console.error('[bulk-upload-enhanced] Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');
      setState(prev => ({
        ...prev,
        step: 'validate',
        error: error instanceof Error ? error.message : 'Upload failed'
      }));
    }
  };

  // Reset state
  const resetUpload = () => {
    setState({
      step: 'select-file',
      file: null,
      parsedRows: [],
      validationSummary: {
        totalRows: 0,
        validRows: 0,
        warningRows: 0,
        errorRows: 0,
        duplicateEmails: 0,
        selectedRows: 0
      },
      databaseValidationResult: null,
      isValidatingDatabase: false,
      uploadProgress: 0,
      result: null,
      error: null
    });
    setFilter('all');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Export created users
  const exportCreatedUsers = () => {
    if (!state.result || state.result.created_users.length === 0) return;

    try {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(state.result.created_users);
      XLSX.utils.book_append_sheet(wb, ws, 'Created Users');
      XLSX.writeFile(wb, `created-users-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success('User credentials exported!');
    } catch (error) {
      console.error('[bulk-upload-enhanced] Export error:', error);
      toast.error('Failed to export credentials');
    }
  };

  // Filter rows based on current filter
  const filteredRows = useMemo(() => {
    switch (filter) {
      case 'valid':
        return state.parsedRows.filter(r => r.validationStatus === 'valid');
      case 'warning':
        return state.parsedRows.filter(r => r.validationStatus === 'warning');
      case 'error':
        return state.parsedRows.filter(r => r.validationStatus === 'error');
      case 'selected':
        return state.parsedRows.filter(r => r.selected);
      default:
        return state.parsedRows;
    }
  }, [state.parsedRows, filter]);

  // Render validation status badge
  const ValidationBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'valid':
        return (
          <Badge variant="outline" className="border-green-500 text-green-700 bg-green-50">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Valid
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="outline" className="border-yellow-500 text-yellow-700 bg-yellow-50">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="border-red-500 text-red-700 bg-red-50">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return null;
    }
  };

  // Handle dialog close - reset data when closing
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Dialog is closing - reset all data
      resetUpload();
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadCloud className="mr-2 h-4 w-4" />
          Bulk Upload Profiles
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[95vw] lg:max-w-7xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b bg-muted/50 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl flex items-center gap-2">
                <UploadCloud className="h-5 w-5" />
                Bulk Upload New Learners
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                Upload → Preview → Validate → Confirm → Upload with Progress
              </DialogDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadTemplate}
              className="flex-shrink-0"
            >
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </div>

          {/* Step Indicator */}
          <div className="mt-4 flex items-center gap-2">
            {[
              { key: 'select-file', label: '1. Select File' },
              { key: 'validate', label: '2. Validate' },
              { key: 'confirm', label: '3. Confirm' },
              { key: 'uploading', label: '4. Upload' },
              { key: 'results', label: '5. Results' }
            ].map((step, index) => {
              const isValidating = state.step === 'validating-format' || state.step === 'validating-database';
              const isCurrentStep = state.step === step.key || (isValidating && step.key === 'validate');

              return (
                <div key={step.key} className="flex items-center">
                  <div
                    className={`px-3 py-1 rounded-md text-sm font-medium ${
                      isCurrentStep
                        ? 'bg-primary text-primary-foreground'
                        : state.parsedRows.length > 0 &&
                          ['validate', 'confirm', 'uploading', 'results'].includes(step.key) &&
                          ['validate', 'confirm', 'uploading', 'results'].indexOf(state.step) >=
                            ['validate', 'confirm', 'uploading', 'results'].indexOf(step.key)
                        ? 'bg-green-100 text-green-700'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {step.key === 'validate' && isValidating
                      ? state.step === 'validating-format'
                        ? '2. Validating Format...'
                        : '2. Validating Database...'
                      : step.label}
                  </div>
                  {index < 4 && <ArrowRight className="h-4 w-4 mx-2 text-muted-foreground" />}
                </div>
              );
            })}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 p-6">
          {/* Step 1: Select File */}
          {state.step === 'select-file' && (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center justify-center max-w-2xl mx-auto text-center space-y-6">
                <input
                  type="file"
                  accept=".xlsx,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  ref={fileInputRef}
                />

                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center">
                  <UploadCloud className="h-10 w-10 text-primary" />
                </div>

                <div className="space-y-3">
                  <h3 className="text-lg font-semibold">Upload Excel File</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a file containing new learner profiles for preview and validation
                  </p>
                </div>

                <Button
                  size="lg"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full sm:w-auto"
                >
                  <UploadCloud className="mr-2 h-5 w-5" />
                  Choose File
                </Button>

                <p className="text-xs text-muted-foreground">
                  Supports Excel (.xlsx) and CSV files
                </p>
              </div>
            </div>
          )}

          {/* Step 2 & 3: Preview and Validate */}
          {(state.step === 'preview-data' || state.step === 'validate') && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Total Rows</CardDescription>
                    <CardTitle className="text-2xl">{state.validationSummary.totalRows}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Valid</CardDescription>
                    <CardTitle className="text-2xl text-green-600">
                      {state.validationSummary.validRows}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Warnings</CardDescription>
                    <CardTitle className="text-2xl text-yellow-600">
                      {state.validationSummary.warningRows}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Errors</CardDescription>
                    <CardTitle className="text-2xl text-red-600">
                      {state.validationSummary.errorRows}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Selected</CardDescription>
                    <CardTitle className="text-2xl text-blue-600">
                      {state.validationSummary.selectedRows}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {/* Important Notice */}
              <Alert variant="destructive" className="border-orange-500 bg-orange-50 dark:bg-orange-950">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-orange-900 dark:text-orange-100">⚠️ Critical: Use EXACT Database Values</AlertTitle>
                <AlertDescription className="text-sm space-y-2 text-orange-800 dark:text-orange-200">
                  <p><strong>✅ Basic validation complete:</strong> Required fields, formats, and dropdown values verified.</p>

                  <div className="bg-white dark:bg-gray-900 p-3 rounded border border-orange-300 space-y-1.5">
                    <p className="font-semibold text-orange-900 dark:text-orange-100">❌ Common Mistakes (will cause upload failure):</p>
                    <ul className="text-xs space-y-1 ml-4 list-disc">
                      <li><strong>Program:</strong> Using "CSE" instead of "(BE) CSE" - MUST include degree prefix in brackets</li>
                      <li><strong>Semester:</strong> Using "II Year III Semester" instead of "Semester 4" or "2 Year" - Check database format</li>
                      <li><strong>Section:</strong> Will fail if Program/Semester are wrong (cascading effect)</li>
                    </ul>
                  </div>

                  <p className="text-xs font-medium">
                    💡 <strong>Tip:</strong> If you see "not found in database" errors during upload, check the console logs - they show sample database values you should use.
                  </p>
                </AlertDescription>
              </Alert>

              {/* Filter and Actions */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select value={filter} onValueChange={(v) => setFilter(v as FilterType)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Rows</SelectItem>
                      <SelectItem value="selected">Selected Only</SelectItem>
                      <SelectItem value="valid">Valid Only</SelectItem>
                      <SelectItem value="warning">Warnings Only</SelectItem>
                      <SelectItem value="error">Errors Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-sm text-muted-foreground">
                    Showing {filteredRows.length} of {state.parsedRows.length} rows
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSelectAll(true)}
                  >
                    Select All Valid
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toggleSelectAll(false)}
                  >
                    Deselect All
                  </Button>
                </div>
              </div>

              {/* Data Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[400px] overflow-auto relative">
                  <Table className="relative">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-20 w-12 border-r"></TableHead>
                        <TableHead className="w-16 border-r">Row</TableHead>
                        <TableHead className="w-24 border-r">Status</TableHead>

                        {/* Personal Info */}
                        <TableHead className="min-w-[120px]">First Name*</TableHead>
                        <TableHead className="min-w-[120px]">Last Name</TableHead>
                        <TableHead className="min-w-[100px]">DOB*</TableHead>
                        <TableHead className="min-w-[80px]">Gender*</TableHead>
                        <TableHead className="min-w-[100px]">Religion*</TableHead>
                        <TableHead className="min-w-[100px]">Community*</TableHead>
                        <TableHead className="min-w-[100px]">Caste*</TableHead>

                        {/* Contact Info */}
                        <TableHead className="min-w-[150px]">College Email*</TableHead>
                        <TableHead className="min-w-[120px]">Student Mobile*</TableHead>
                        <TableHead className="min-w-[150px]">Personal Email</TableHead>

                        {/* Parent Info */}
                        <TableHead className="min-w-[150px]">Father Name*</TableHead>
                        <TableHead className="min-w-[120px]">Father Mobile*</TableHead>
                        <TableHead className="min-w-[150px]">Mother Name*</TableHead>
                        <TableHead className="min-w-[120px]">Mother Mobile*</TableHead>

                        {/* Academic Info */}
                        <TableHead className="min-w-[200px]">Institution*</TableHead>
                        <TableHead className="min-w-[120px]">Department*</TableHead>
                        <TableHead className="min-w-[120px]">Program*</TableHead>
                        <TableHead className="min-w-[150px]">Semester*</TableHead>
                        <TableHead className="min-w-[100px]">Section*</TableHead>
                        <TableHead className="min-w-[120px]">Academic Year*</TableHead>

                        {/* Address */}
                        <TableHead className="min-w-[200px]">Address Street*</TableHead>
                        <TableHead className="min-w-[120px]">Taluk*</TableHead>
                        <TableHead className="min-w-[120px]">District*</TableHead>
                        <TableHead className="min-w-[100px]">Pin Code*</TableHead>
                        <TableHead className="min-w-[120px]">State*</TableHead>

                        {/* Other Required */}
                        <TableHead className="min-w-[120px]">Entry Type*</TableHead>
                        <TableHead className="min-w-[150px]">Scholarship Type*</TableHead>
                        <TableHead className="min-w-[150px]">Accommodation*</TableHead>

                        {/* Errors Column - Sticky Right */}
                        <TableHead className="sticky right-0 bg-background z-20 min-w-[300px] border-l">Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => (
                        <TableRow key={row.rowNumber} className="hover:bg-muted/50">
                          <TableCell className="border-r">
                            <Checkbox
                              checked={row.selected}
                              onCheckedChange={() => toggleRowSelection(row.rowNumber)}
                              disabled={row.validationStatus === 'error'}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm border-r">{row.rowNumber}</TableCell>
                          <TableCell className="border-r">
                            <ValidationBadge status={row.validationStatus} />
                          </TableCell>

                          {/* Personal Info */}
                          <TableCell className="text-xs">{row.sanitizedData.first_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.last_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.date_of_birth || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.gender || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.religion || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.community || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.caste || '-'}</TableCell>

                          {/* Contact Info */}
                          <TableCell className="text-xs font-mono">{row.sanitizedData.college_email || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.student_mobile || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.student_email || '-'}</TableCell>

                          {/* Parent Info */}
                          <TableCell className="text-xs">{row.sanitizedData.father_name || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.father_mobile || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.mother_name || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.mother_mobile || '-'}</TableCell>

                          {/* Academic Info */}
                          <TableCell className="text-xs">{row.sanitizedData.institution_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.department_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.program_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.semester_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.section_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.academic_year_name || '-'}</TableCell>

                          {/* Address */}
                          <TableCell className="text-xs">{row.sanitizedData.permanent_address_street || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.permanent_address_taluk || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.permanent_address_district || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.permanent_address_pin_code || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.permanent_address_state || '-'}</TableCell>

                          {/* Other Required */}
                          <TableCell className="text-xs">{row.sanitizedData.entry_type || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.scholarship_type || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.accommodation_type || '-'}</TableCell>

                          {/* Issues Column - Sticky Right */}
                          <TableCell className="border-l">
                            {row.validationResult && (
                              <IssuesDisplay
                                validationResult={row.validationResult}
                                databaseValidationErrors={row.databaseValidationErrors}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {state.validationSummary.errorRows > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Validation Errors Found</AlertTitle>
                  <AlertDescription>
                    {state.validationSummary.errorRows} rows have errors. Only valid rows can be uploaded.
                    Fix errors in your Excel file or proceed with valid rows only.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step 4: Confirm */}
          {state.step === 'confirm' && (
            <div className="space-y-4">
              <Alert>
                <Eye className="h-4 w-4" />
                <AlertTitle>Ready to Upload</AlertTitle>
                <AlertDescription>
                  You are about to upload {state.validationSummary.selectedRows} learner profiles.
                  User accounts will be created automatically for complete profiles.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Selected Rows</CardTitle>
                    <CardDescription className="text-3xl font-bold text-blue-600">
                      {state.validationSummary.selectedRows}
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Valid Rows</CardTitle>
                    <CardDescription className="text-3xl font-bold text-green-600">
                      {state.validationSummary.validRows}
                    </CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle>Skipped (Errors)</CardTitle>
                    <CardDescription className="text-3xl font-bold text-red-600">
                      {state.validationSummary.errorRows}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </div>
            </div>
          )}

          {/* Step 5: Uploading */}
          {state.step === 'uploading' && (
            <div className="flex items-center justify-center h-full">
              <div className="w-full max-w-md space-y-6">
                <div className="text-center">
                  <TrendingUp className="h-16 w-16 mx-auto mb-4 text-primary animate-pulse" />
                  <h3 className="text-lg font-semibold mb-2">Uploading Profiles...</h3>
                  <p className="text-sm text-muted-foreground">
                    Processing {state.validationSummary.selectedRows} learner profiles
                  </p>
                </div>

                <div className="space-y-2">
                  <Progress value={state.uploadProgress} className="h-3" />
                  <p className="text-sm text-center text-muted-foreground">
                    {state.uploadProgress}% Complete
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Results */}
          {state.step === 'results' && state.result && (
            <div className="space-y-6">
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Learners Created</CardDescription>
                    <CardTitle className="text-3xl text-green-600">
                      {state.result.upload_summary.learners_created}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Out of {state.result.upload_summary.total_rows} total rows
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>User Accounts Created</CardDescription>
                    <CardTitle className="text-3xl text-blue-600">
                      {state.result.user_creation_summary.new_users_created}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {state.result.user_creation_summary.profiles_complete} complete profiles
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Created Users */}
              {state.result.created_users.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <UserPlus className="h-5 w-5" />
                      Created User Accounts ({state.result.created_users.length})
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportCreatedUsers}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export Credentials
                    </Button>
                  </div>

                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Important: Save These Credentials</AlertTitle>
                    <AlertDescription>
                      Temporary passwords are shown only once. Export or copy them before closing this dialog.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-lg p-3 bg-muted/20">
                    {state.result.created_users.map((user, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg text-sm bg-green-50 border border-green-200"
                      >
                        <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-green-800">{user.name}</p>
                          <p className="text-xs text-green-700 break-all">{user.email}</p>
                          <p className="text-xs text-green-700 mt-1">
                            <span className="font-medium">Password:</span> {user.temp_password}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Errors */}
              {state.result.errors.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-lg text-red-600">
                    Errors ({state.result.errors.length})
                  </h4>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto border rounded-lg p-3 bg-muted/20">
                    {state.result.errors.map((error, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-3 p-3 rounded-lg text-sm bg-red-50 border border-red-200"
                      >
                        <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-red-800">Row {error.row}</p>
                          {error.email && <p className="text-xs text-red-700">{error.email}</p>}
                          <p className="text-xs text-red-700 break-words">{error.error}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer with Actions */}
        <div className="px-6 py-4 border-t bg-muted/50 flex-shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div>
              {state.step !== 'select-file' && state.step !== 'results' && (
                <Button
                  variant="destructive"
                  onClick={resetUpload}
                  disabled={state.step === 'uploading'}
                  className="gap-2"
                >
                  <X className="h-4 w-4" />
                  Clear Upload
                </Button>
              )}
            </div>

            <div className="flex gap-2">
              {state.step === 'validate' && (
                <>
                  <Button
                    variant="outline"
                    onClick={resetUpload}
                    className="gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Start Over
                  </Button>
                  <Button
                    onClick={() => setState(prev => ({ ...prev, step: 'confirm' }))}
                    disabled={state.validationSummary.selectedRows === 0}
                    className="gap-2"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </>
              )}

              {state.step === 'confirm' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setState(prev => ({ ...prev, step: 'validate' }))}
                    className="gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Review
                  </Button>
                  <Button
                    onClick={handleUpload}
                    className="gap-2"
                  >
                    <UploadCloud className="h-4 w-4" />
                    Upload {state.validationSummary.selectedRows} Profiles
                  </Button>
                </>
              )}

              {state.step === 'results' && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setOpen(false)}
                    className="gap-2"
                  >
                    <X className="h-4 w-4" />
                    Close
                  </Button>
                  <Button onClick={resetUpload} className="gap-2">
                    <UploadCloud className="h-4 w-4" />
                    Upload Another File
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
