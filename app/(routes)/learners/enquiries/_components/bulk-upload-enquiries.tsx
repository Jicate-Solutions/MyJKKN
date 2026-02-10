// ============================================
// ENHANCED BULK UPLOAD ENQUIRIES DIALOG
// ============================================
// Created: 2025-01-02
// Purpose: Multi-step bulk upload with preview, validation, and confirmation
// Features: Data preview, row-by-row validation, error display with suggestions, progress tracking
// Based on: bulk-upload-profiles-dialog-enhanced.tsx
// ============================================

'use client';

import { useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
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
  Eye,
  TrendingUp,
  ArrowRight,
  ArrowLeft,
  X,
  Filter
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
  checkExistingLearners,
  type ValidationResult,
  type DatabaseValidationResult,
  type DatabaseValidationErrors,
  type ExistingLearnerCheckResult,
  type ExistingLearnersCheckSummary
} from '@/lib/utils/bulk-upload-validation';
import type {
  ParsedRow,
  UploadState,
  ValidationSummary,
  FilterType,
  EnquiryUploadResult
} from './bulk-upload-enquiries-types';
import { ENQUIRY_REQUIRED_FIELDS, ENQUIRY_WARNING_FIELDS } from './bulk-upload-enquiries-types';
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
import { LearnerProfileService } from '@/lib/services/learner-profile-service';

// Helper component to display validation issues (errors and warnings)
function IssuesDisplay({
  validationResult,
  databaseValidationErrors,
  isExistingLearner,
  existingLearnerInfo
}: {
  validationResult: ValidationResult;
  databaseValidationErrors?: DatabaseValidationErrors;
  isExistingLearner?: boolean;
  existingLearnerInfo?: any;
}) {
  // Filter warnings to only show for required/warning fields
  const relevantWarnings = validationResult.warnings.filter((warning) => {
    const warningLower = warning.toLowerCase();
    return [...ENQUIRY_REQUIRED_FIELDS, ...ENQUIRY_WARNING_FIELDS].some((field) => {
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
              <span className="font-bold">X {error.field}:</span> {error.message}
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
                <span className="font-bold">X {field}:</span> {errorData.error}
              </div>
              {errorData.suggestions && errorData.suggestions.length > 0 && (
                <div className="text-xs text-blue-600 pl-4 break-words">
                  <span className="font-semibold">Try:</span>{' '}
                  {errorData.suggestions.slice(0, 3).join(', ')}
                  {errorData.suggestions.length > 3 && ` +${errorData.suggestions.length - 3} more`}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* EXISTING LEARNER WARNING */}
      {isExistingLearner && existingLearnerInfo && (
        <div className="space-y-0.5 bg-amber-50 dark:bg-amber-950 p-2 rounded border border-amber-200">
          <div className="text-xs text-amber-900 dark:text-amber-100 font-bold">
            ⚠️ Student Already Exists
          </div>
          <div className="text-xs text-amber-800 dark:text-amber-200 space-y-0.5">
            <div><strong>Email:</strong> {existingLearnerInfo.college_email || existingLearnerInfo.student_email}</div>
            <div><strong>Mobile:</strong> {existingLearnerInfo.student_mobile}</div>
            <div><strong>Status:</strong> <span className="capitalize">{existingLearnerInfo.lifecycle_status}</span></div>
            <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              This student was created on {new Date(existingLearnerInfo.created_at).toLocaleDateString()}
            </div>
          </div>
        </div>
      )}

      {/* Show warnings ONLY for required fields (if no errors) */}
      {!hasAnyErrors && !isExistingLearner && relevantWarnings.length > 0 && (
        <>
          {relevantWarnings.slice(0, 2).map((warning, idx) => (
            <div key={`warning-${idx}`} className="text-xs text-amber-600 break-words">
              ! {warning}
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
      {!hasAnyErrors && !isExistingLearner && relevantWarnings.length === 0 && (
        <div className="text-xs text-green-600 font-medium">
          ✓ All fields validated
        </div>
      )}
    </div>
  );
}

export default function BulkUploadEnquiries({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter();
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
    existingLearnersResults: null,
    existingLearnersSummary: null,
    isCheckingDuplicates: false,
    uploadProgress: 0,
    result: null,
    error: null
  });

  // Download template function - calls API to get advanced template with cascading dropdowns
  const downloadTemplate = async () => {
    try {
      toast.loading('Generating template with cascading dropdowns...', { id: 'template-download' });

      const response = await fetch('/api/learners/enquiries/template');

      if (!response.ok) {
        throw new Error('Failed to download template');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enquiry-import-template-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.dismiss('template-download');
      toast.success('Template with cascading dropdowns downloaded successfully!');
    } catch (error) {
      console.error('[bulk-upload-enquiries-enhanced] Error downloading template:', error);
      toast.dismiss('template-download');
      toast.error('Failed to download template');
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
      console.error('[bulk-upload-enquiries-enhanced] Parse error:', error);
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

          // Find the template sheet
          let sheetName = workbook.SheetNames[0];
          const templateSheet = workbook.SheetNames.find(name =>
            name.toLowerCase().includes('template') ||
            name.toLowerCase().includes('enquiry')
          );
          if (templateSheet) {
            sheetName = templateSheet;
          } else if (workbook.SheetNames.length > 1) {
            // Skip Instructions sheet if it exists
            sheetName = workbook.SheetNames.find(name =>
              !name.toLowerCase().includes('instruction') &&
              !name.toLowerCase().includes('info')
            ) || workbook.SheetNames[1];
          }

          const firstSheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet);

          if (jsonData.length === 0) {
            reject(new Error('No data found in file'));
            return;
          }

          // Parse and map rows
          const parsedRows: ParsedRow[] = jsonData.map((row: any, index) => {
            const mappedData = mapColumns(row);

            // Debug log for first row to show column mapping (development only)
            if (process.env.NODE_ENV === 'development' && index === 0) {
              console.log('[bulk-upload-enquiries] Excel column names:', Object.keys(row));
              console.log('[bulk-upload-enquiries] Mapped education fields:', {
                tenth_max_marks: mappedData.tenth_max_marks,
                tenth_obtained_marks: mappedData.tenth_obtained_marks,
                tenth_percentage: mappedData.tenth_percentage,
                twelfth_group: mappedData.twelfth_group,
                twelfth_max_marks: mappedData.twelfth_max_marks,
                twelfth_obtained_marks: mappedData.twelfth_obtained_marks,
                twelfth_percentage: mappedData.twelfth_percentage,
              });
            }

            // Sanitize data (using enquiry-specific fields)
            const sanitizedData = {
              // SECTION 1: Basic Details
              first_name: sanitizeValue(mappedData.first_name, 'text'),
              last_name: sanitizeValue(mappedData.last_name, 'text'),
              date_of_birth: sanitizeValue(mappedData.date_of_birth, 'date'),
              gender: sanitizeValue(mappedData.gender, 'text', 'gender'),
              religion: sanitizeValue(mappedData.religion, 'text', 'religion'),
              community: sanitizeValue(mappedData.community, 'text', 'community'),
              caste: sanitizeValue(mappedData.caste, 'text'),
              aadhar_number: sanitizeValue(mappedData.aadhar_number, 'number'),
              blood_group: sanitizeValue(mappedData.blood_group, 'text', 'blood_group'),

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
              admission_year: sanitizeValue(mappedData.admission_year, 'number'),
              regulation_name: sanitizeValue(mappedData.regulation_name, 'text'),
              batch_name: sanitizeValue(mappedData.batch_name, 'text'),

              // SECTION 4: Contact Details
              student_mobile: sanitizeValue(mappedData.student_mobile, 'mobile'),
              college_email: sanitizeValue(mappedData.college_email, 'email'),
              student_email: sanitizeValue(mappedData.student_email, 'email'),

              // SECTION 5: Address Information
              permanent_address_street: sanitizeValue(mappedData.permanent_address_street, 'text'),
              permanent_address_taluk: sanitizeValue(mappedData.permanent_address_taluk, 'text', 'permanent_address_taluk'),
              permanent_address_district: sanitizeValue(mappedData.permanent_address_district, 'text', 'permanent_address_district'),
              permanent_address_pin_code: sanitizeValue(mappedData.permanent_address_pin_code, 'number'),
              permanent_address_state: sanitizeValue(mappedData.permanent_address_state, 'text', 'permanent_address_state'),

              // SECTION 6: Entry Type & Scholarship Type
              entry_type: sanitizeValue(mappedData.entry_type, 'text', 'entry_type'),
              scholarship_type: sanitizeValue(mappedData.scholarship_type, 'text', 'scholarship_type'),

              // SECTION 7: Accommodation
              accommodation_type: sanitizeValue(mappedData.accommodation_type, 'text', 'accommodation_type'),
              hostel_type: sanitizeValue(mappedData.hostel_type, 'text', 'hostel_type'),
              food_type: sanitizeValue(mappedData.food_type, 'text', 'food_type'),

              // SECTION 8: Previous Education (Required)
              last_school: sanitizeValue(mappedData.last_school, 'text'),
              board_of_study: sanitizeValue(mappedData.board_of_study, 'text'),
              // 10th Marks (individual fields for JSONB)
              tenth_max_marks: sanitizeValue(mappedData.tenth_max_marks, 'number'),
              tenth_obtained_marks: sanitizeValue(mappedData.tenth_obtained_marks, 'number'),
              tenth_percentage: sanitizeValue(mappedData.tenth_percentage, 'number'),
              // 12th Marks (individual fields for JSONB)
              twelfth_group: sanitizeValue(mappedData.twelfth_group, 'text'),
              twelfth_max_marks: sanitizeValue(mappedData.twelfth_max_marks, 'number'),
              twelfth_obtained_marks: sanitizeValue(mappedData.twelfth_obtained_marks, 'number'),
              twelfth_percentage: sanitizeValue(mappedData.twelfth_percentage, 'number'),
              // Entrance Exam Details (Optional)
              medical_cutoff_marks: sanitizeValue(mappedData.medical_cutoff_marks, 'number'),
              engineering_cutoff_marks: sanitizeValue(mappedData.engineering_cutoff_marks, 'number'),
              neet_roll_number: sanitizeValue(mappedData.neet_roll_number, 'text'),
              neet_score: sanitizeValue(mappedData.neet_score, 'number'),

              // SECTION 9: Counseling
              counseling_applied: sanitizeValue(mappedData.counseling_applied, 'text'),
              quota: sanitizeValue(mappedData.quota, 'text', 'quota'),
              category: sanitizeValue(mappedData.category, 'text'),

              // SECTION 9: Reference
              reference_type: sanitizeValue(mappedData.reference_type, 'text'),
              reference_name: sanitizeValue(mappedData.reference_name, 'text'),
              reference_contact: sanitizeValue(mappedData.reference_contact, 'text'),

              // SECTION 11: Enquiry Specific
              enquiry_date: sanitizeValue(mappedData.enquiry_date, 'date') || new Date().toISOString().split('T')[0],
            };

            // Validate row using the shared validation function
            // Note: For enquiries, college_email is optional, so we use the standard validateRow
            // which already handles this based on the data structure
            const validationResult = validateRow(sanitizedData);

            return {
              rowNumber: index + 2, // Excel row number (1-indexed + header row)
              originalData: row,
              mappedData,
              sanitizedData,
              validationStatus: validationResult.status,
              validationResult,
              selected: validationResult.status === 'valid' || validationResult.status === 'warning',
              isDuplicate: false,
              isExistingLearner: false,
              existingLearnerInfo: undefined
            };
          });

          // Check for duplicate emails (only if college_email is provided)
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

      // Debug logging for regulations and batches
      if (process.env.NODE_ENV === 'development') {
        console.log('[bulk-upload-enquiries] Database validation complete');
        console.log('[bulk-upload-enquiries] Regulations validation result:', dbValidationResult.regulations);
        console.log('[bulk-upload-enquiries] Batches validation result:', dbValidationResult.batches);
        console.log('[bulk-upload-enquiries] First row regulation_name:', parsedRows[0]?.sanitizedData?.regulation_name);
        console.log('[bulk-upload-enquiries] First row batch_name:', parsedRows[0]?.sanitizedData?.batch_name);
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

      toast.dismiss('db-validation');

      // ============================================
      // STEP 2: Check for existing learners
      // ============================================
      toast.loading('Checking for existing students...', { id: 'duplicate-check' });
      setState(prev => ({ ...prev, isCheckingDuplicates: true }));

      const { results: existingResults, summary: existingSummary } = await checkExistingLearners(updatedRows);

      // Merge existing learner results with rows
      const finalRows = updatedRows.map(row => {
        const existingCheck = existingResults.find(r => r.rowNumber === row.rowNumber);

        if (existingCheck?.exists) {
          return {
            ...row,
            isExistingLearner: true,
            existingLearnerInfo: existingCheck.existingLearner,
            validationStatus: 'warning' as const, // Show as warning, not error
            selected: false // Auto-deselect existing students
          };
        }

        return row;
      });

      toast.dismiss('duplicate-check');

      // Recalculate summary with database + duplicate validation results
      const summary: ValidationSummary = {
        totalRows: finalRows.length,
        validRows: finalRows.filter(r => r.validationStatus === 'valid').length,
        warningRows: finalRows.filter(r => r.validationStatus === 'warning').length,
        errorRows: finalRows.filter(r => r.validationStatus === 'error').length,
        duplicateEmails: state.validationSummary.duplicateEmails,
        selectedRows: finalRows.filter(r => r.selected).length
      };

      setState(prev => ({
        ...prev,
        parsedRows: finalRows,
        validationSummary: summary,
        databaseValidationResult: dbValidationResult,
        existingLearnersResults: existingResults,
        existingLearnersSummary: existingSummary,
        isValidatingDatabase: false,
        isCheckingDuplicates: false,
        step: 'validate'
      }));

      // Show appropriate messages
      if (existingSummary.duplicates > 0) {
        toast(
          `⚠️ Found ${existingSummary.duplicates} student(s) that already exist in the database. They have been deselected.`,
          {
            duration: 6000,
            icon: '⚠️',
            style: {
              background: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fbbf24'
            }
          }
        );
      }

      if (summary.errorRows > 0) {
        toast.error(`Found ${summary.errorRows} validation errors. Please review.`);
      } else if (existingSummary.duplicates === 0) {
        toast.success('Validation complete! All students are new and ready to upload.');
      }
    } catch (error) {
      console.error('[bulk-upload-enquiries] Validation failed:', error);
      setState(prev => ({
        ...prev,
        isValidatingDatabase: false,
        isCheckingDuplicates: false,
        step: 'validate',
        error: error instanceof Error ? error.message : 'Validation failed'
      }));
      toast.dismiss('db-validation');
      toast.dismiss('duplicate-check');
      toast.error('Validation failed. You can still upload, but some rows may fail.');
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

  // Helper function to get ID from database validation result
  const getIdFromValidation = (
    fieldType: 'institutions' | 'programs' | 'semesters' | 'sections' | 'degrees' | 'departments' | 'academicYears' | 'regulations' | 'batches',
    key: string
  ): string | null => {
    if (!state.databaseValidationResult) return null;
    const result = state.databaseValidationResult[fieldType]?.[key];
    return result?.id || null;
  };

  // Helper function to build composite key for hierarchical lookups
  const buildCompositeKey = (parts: (string | undefined)[]): string => {
    return parts.filter(Boolean).join('|');
  };

  // Handle upload
  const handleUpload = async () => {
    if (state.validationSummary.selectedRows === 0) {
      toast.error('No valid rows selected for upload');
      return;
    }

    setState(prev => ({ ...prev, step: 'uploading', uploadProgress: 0 }));

    const selectedRows = state.parsedRows.filter(r => r.selected);
    const results: EnquiryUploadResult = {
      success: true,
      upload_summary: {
        total_rows: selectedRows.length,
        valid_rows: selectedRows.length,
        invalid_rows: 0,
        enquiries_created: 0,
        enquiries_failed: 0
      },
      created_enquiries: [],
      errors: []
    };

    // Batch-based progress estimation for smoother progress bar
    const BATCH_SIZE = 50; // Process 50 rows per batch (faster for enquiries than profiles)
    const estimatedBatches = Math.ceil(selectedRows.length / BATCH_SIZE);
    const timePerBatch = 1500; // 1.5 seconds per batch
    let currentProgress = 0;

    // Start progress interval for smooth progress bar updates
    const progressInterval = setInterval(() => {
      currentProgress += (100 / estimatedBatches);
      setState(prev => ({
        ...prev,
        uploadProgress: Math.min(Math.round(currentProgress), 95) // Cap at 95% until complete
      }));
    }, timePerBatch);

    try {
      for (let i = 0; i < selectedRows.length; i++) {
        const row = selectedRows[i];

        try {
          const data = row.sanitizedData;

          // Debug log for education fields (helps track mapping issues)
          if (process.env.NODE_ENV === 'development') {
            console.log('[bulk-upload-enquiries] Row', row.rowNumber, 'Education fields:', {
              last_school: data.last_school,
              board_of_study: data.board_of_study,
              tenth_max_marks: data.tenth_max_marks,
              tenth_obtained_marks: data.tenth_obtained_marks,
              tenth_percentage: data.tenth_percentage,
              twelfth_group: data.twelfth_group,
              twelfth_max_marks: data.twelfth_max_marks,
              twelfth_obtained_marks: data.twelfth_obtained_marks,
              twelfth_percentage: data.twelfth_percentage,
            });
          }

          // Build composite keys for hierarchical lookups
          const semesterKey = buildCompositeKey([data.program_name, data.semester_name]);
          const sectionKey = buildCompositeKey([data.program_name, data.semester_name, data.section_name]);

          // Get resolved IDs from database validation result
          const institution_id = getIdFromValidation('institutions', data.institution_name);
          const program_id = getIdFromValidation('programs', data.program_name);
          const semester_id = getIdFromValidation('semesters', semesterKey);
          const section_id = getIdFromValidation('sections', sectionKey);
          const degree_id = getIdFromValidation('degrees', data.degree_name);
          const department_id = getIdFromValidation('departments', data.department_name);
          const academic_year_id = getIdFromValidation('academicYears', data.academic_year_name);
          const regulation_id = data.regulation_name ? getIdFromValidation('regulations', data.regulation_name) : null;
          const batch_id = data.batch_name ? getIdFromValidation('batches', data.batch_name) : null;

          // Debug logging for regulation and batch IDs
          if (process.env.NODE_ENV === 'development') {
            console.log('[bulk-upload-enquiries] Row', row.rowNumber, 'ID Resolution:', {
              regulation_name: data.regulation_name,
              regulation_id,
              batch_name: data.batch_name,
              batch_id,
              academic_year_name: data.academic_year_name,
              academic_year_id,
              admission_year: data.admission_year,
            });
          }

          // Prepare data for API with resolved IDs (enquiry specific)
          // Remove _name fields and add _id fields
          const enquiryData = {
            // Personal Info
            first_name: data.first_name,
            last_name: data.last_name,
            date_of_birth: data.date_of_birth,
            gender: data.gender,
            religion: data.religion,
            community: data.community,
            caste: data.caste,
            aadhar_number: data.aadhar_number,
            blood_group: data.blood_group,

            // Parent/Guardian Info
            father_name: data.father_name,
            father_occupation: data.father_occupation,
            father_mobile: data.father_mobile,
            mother_name: data.mother_name,
            mother_occupation: data.mother_occupation,
            mother_mobile: data.mother_mobile,
            annual_income: data.annual_income,

            // Academic Assignment (IDs, not names)
            institution_id,
            degree_id,
            department_id,
            program_id,
            semester_id,
            section_id,
            academic_year_id,
            admission_year: data.admission_year ? parseInt(data.admission_year) : null,
            regulation_id,
            batch_id,

            // Contact Details
            student_mobile: data.student_mobile,
            // CRITICAL FIX: Ensure college_email is NULL if empty (not empty string)
            // Empty strings violate UNIQUE constraint, NULL values are allowed
            college_email: data.college_email || null,
            student_email: data.student_email,

            // Address Information
            permanent_address_street: data.permanent_address_street,
            permanent_address_taluk: data.permanent_address_taluk,
            permanent_address_district: data.permanent_address_district,
            permanent_address_pin_code: data.permanent_address_pin_code,
            permanent_address_state: data.permanent_address_state,

            // Entry & Scholarship
            entry_type: data.entry_type,
            scholarship_type: data.scholarship_type,

            // Accommodation
            accommodation_type: data.accommodation_type,
            hostel_type: data.hostel_type,
            food_type: data.food_type,

            // Previous Education (Required)
            last_school: data.last_school || 'Not Provided',
            board_of_study: data.board_of_study || 'Not Provided',
            // Build JSONB objects for marks - ensure all values are strings
            tenth_marks: {
              max_marks: String(data.tenth_max_marks || '0'),
              obtained_marks: String(data.tenth_obtained_marks || '0'),
              percentage: String(data.tenth_percentage || '0'),
            },
            twelfth_marks: {
              group: String(data.twelfth_group || 'Not Provided'),
              max_marks: String(data.twelfth_max_marks || '0'),
              obtained_marks: String(data.twelfth_obtained_marks || '0'),
              percentage: String(data.twelfth_percentage || '0'),
            },

            // Entrance Exam Details (Optional)
            medical_cutoff_marks: data.medical_cutoff_marks ? String(data.medical_cutoff_marks) : null,
            engineering_cutoff_marks: data.engineering_cutoff_marks ? String(data.engineering_cutoff_marks) : null,
            neet_roll_number: data.neet_roll_number || null,
            neet_score: data.neet_score ? String(data.neet_score) : null,

            // Counseling
            counseling_applied: data.counseling_applied === 'TRUE' || data.counseling_applied === 'true',
            quota: data.quota,
            category: data.category,

            // Reference
            reference_type: data.reference_type,
            reference_name: data.reference_name,
            reference_contact: data.reference_contact,

            // Enquiry specific
            enquiry_date: data.enquiry_date || new Date().toISOString().split('T')[0],
            lifecycle_status: 'enquiry' as const,
            is_profile_complete: false,
          };

          // Create enquiry using LearnerProfileService
          await LearnerProfileService.createLearnerProfile(enquiryData as any);

          results.upload_summary.enquiries_created++;

          // Store created enquiry details for results display
          results.created_enquiries.push({
            name: `${data.first_name} ${data.last_name}`,
            email: data.college_email || data.student_email || '-',
            mobile: data.student_mobile,
            institution: data.institution_name || '-',
            program: data.program_name || '-',
            semester: data.semester_name || '-',
            section: data.section_name || '-',
          });
        } catch (error: any) {
          console.error(`[bulk-upload-enquiries] Error creating enquiry for row ${row.rowNumber}:`, error);
          results.upload_summary.enquiries_failed++;
          results.errors.push({
            row: row.rowNumber,
            name: `${row.sanitizedData.first_name} ${row.sanitizedData.last_name}`,
            error: error.message || 'Failed to create enquiry'
          });
        }

        // Small delay to prevent overwhelming the database
        if (i < selectedRows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Clear progress interval and set to 100%
      clearInterval(progressInterval);
      setState(prev => ({ ...prev, result: results, step: 'results', uploadProgress: 100 }));

      // Show success message
      if (results.upload_summary.enquiries_created > 0) {
        toast.success(`Successfully created ${results.upload_summary.enquiries_created} enquiries!`);

        // Refresh the page data to show newly created enquiries in real-time
        router.refresh();
      }

      if (results.upload_summary.enquiries_failed > 0) {
        toast.error(`${results.upload_summary.enquiries_failed} enquiries failed to create`);
      }

      if (onSuccess && results.upload_summary.enquiries_created > 0) {
        onSuccess();
      }
    } catch (error) {
      console.error('[bulk-upload-enquiries-enhanced] Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Upload failed');

      // Clear progress interval on error
      clearInterval(progressInterval);

      setState(prev => ({
        ...prev,
        step: 'validate',
        error: error instanceof Error ? error.message : 'Upload failed'
      }));
    }
  };

  // Export created enquiries summary to Excel
  const exportCreatedEnquiries = () => {
    if (!state.parsedRows || state.parsedRows.length === 0) return;

    try {
      // Get successfully created enquiries (selected rows without errors)
      const createdEnquiries = state.parsedRows
        .filter(row => row.selected && row.validationResult.isValid)
        .map(row => ({
          'Row Number': row.rowNumber,
          'First Name': row.sanitizedData.first_name,
          'Last Name': row.sanitizedData.last_name,
          'Student Email': row.sanitizedData.student_email || '',
          'College Email': row.sanitizedData.college_email || '',
          'Mobile': row.sanitizedData.student_mobile,
          'Institution': row.sanitizedData.institution_name,
          'Degree': row.sanitizedData.degree_name,
          'Department': row.sanitizedData.department_name,
          'Program': row.sanitizedData.program_name,
          'Semester': row.sanitizedData.semester_name,
          'Section': row.sanitizedData.section_name,
          'Academic Year': row.sanitizedData.academic_year_name,
          'Status': 'Enquiry',
          'Uploaded': new Date().toLocaleDateString()
        }));

      if (createdEnquiries.length === 0) {
        toast.error('No enquiries to export');
        return;
      }

      // Create workbook
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(createdEnquiries);

      // Set column widths
      ws['!cols'] = [
        { wch: 5 },   // Row Number
        { wch: 15 },  // First Name
        { wch: 15 },  // Last Name
        { wch: 30 },  // Student Email
        { wch: 30 },  // College Email
        { wch: 12 },  // Mobile
        { wch: 40 },  // Institution
        { wch: 20 },  // Degree
        { wch: 35 },  // Department
        { wch: 20 },  // Program
        { wch: 15 },  // Semester
        { wch: 10 },  // Section
        { wch: 15 },  // Academic Year
        { wch: 10 },  // Status
        { wch: 12 }   // Uploaded
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Created Enquiries');

      const date = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `created-enquiries-${date}.xlsx`);

      toast.success(`Exported ${createdEnquiries.length} enquiries to Excel`);
    } catch (error) {
      console.error('[bulk-upload-enquiries] Export error:', error);
      toast.error('Failed to export enquiries');
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
      existingLearnersResults: null,
      existingLearnersSummary: null,
      isCheckingDuplicates: false,
      uploadProgress: 0,
      result: null,
      error: null
    });
    setFilter('all');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
      resetUpload();
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UploadCloud className="mr-2 h-4 w-4" />
          Bulk Upload Enquiries
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[95vw] lg:max-w-7xl h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 py-4 border-b bg-muted/50 flex-shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle className="text-xl flex items-center gap-2">
                <UploadCloud className="h-5 w-5" />
                Bulk Upload Enquiries
              </DialogTitle>
              <DialogDescription className="mt-1.5">
                Upload - Preview - Validate - Confirm - Upload with Progress
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
                    Select a file containing enquiry data for preview and validation
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

              {/* Existing Students Warning */}
              {state.existingLearnersSummary && state.existingLearnersSummary.duplicates > 0 && (
                <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertTitle className="text-amber-900 dark:text-amber-100">
                    {state.existingLearnersSummary.duplicates} Student(s) Already Exist
                  </AlertTitle>
                  <AlertDescription className="text-amber-800 dark:text-amber-200">
                    Found {state.existingLearnersSummary.duplicates} student(s) that already exist in the database.
                    They have been automatically <strong>deselected</strong> to prevent duplicates.
                    You can review them in the table below (marked with ⚠️).
                    <div className="mt-2 text-sm">
                      <strong>New students:</strong> {state.existingLearnersSummary.new} •{' '}
                      <strong>Already exist:</strong> {state.existingLearnersSummary.duplicates}
                    </div>
                  </AlertDescription>
                </Alert>
              )}

             

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
                        {/* Sticky Left Columns */}
                        <TableHead className="sticky left-0 bg-background z-20 w-12 border-r"></TableHead>
                        <TableHead className="sticky left-12 bg-background z-20 w-16 border-r">Row</TableHead>
                        <TableHead className="sticky left-28 bg-background z-20 w-24 border-r">Status</TableHead>

                        {/* SECTION 1: Personal Info (Required) */}
                        <TableHead className="min-w-[120px]">First Name*</TableHead>
                        <TableHead className="min-w-[120px]">Last Name*</TableHead>
                        <TableHead className="min-w-[100px]">DOB*</TableHead>
                        <TableHead className="min-w-[80px]">Gender*</TableHead>
                        <TableHead className="min-w-[100px]">Religion*</TableHead>
                        <TableHead className="min-w-[80px]">Community*</TableHead>
                        <TableHead className="min-w-[80px]">Caste*</TableHead>
                        <TableHead className="min-w-[120px]">Aadhar No.</TableHead>
                        <TableHead className="min-w-[80px]">Blood Group</TableHead>

                        {/* SECTION 2: Parent/Guardian Info */}
                        <TableHead className="min-w-[150px]">Father Name*</TableHead>
                        <TableHead className="min-w-[120px]">Father Occupation</TableHead>
                        <TableHead className="min-w-[120px]">Father Mobile</TableHead>
                        <TableHead className="min-w-[150px]">Mother Name*</TableHead>
                        <TableHead className="min-w-[120px]">Mother Occupation</TableHead>
                        <TableHead className="min-w-[120px]">Mother Mobile</TableHead>
                        <TableHead className="min-w-[100px]">Annual Income</TableHead>

                        {/* SECTION 3: Academic Assignment */}
                        <TableHead className="min-w-[200px]">Institution*</TableHead>
                        <TableHead className="min-w-[120px]">Degree*</TableHead>
                        <TableHead className="min-w-[150px]">Department*</TableHead>
                        <TableHead className="min-w-[120px]">Program*</TableHead>
                        <TableHead className="min-w-[120px]">Semester*</TableHead>
                        <TableHead className="min-w-[80px]">Section*</TableHead>
                        <TableHead className="min-w-[100px]">Academic Year*</TableHead>
                        <TableHead className="min-w-[100px]">Admission Year</TableHead>
                        <TableHead className="min-w-[100px]">Regulation</TableHead>
                        <TableHead className="min-w-[100px]">Batch</TableHead>

                        {/* SECTION 4: Contact Details */}
                        <TableHead className="min-w-[120px]">Student Mobile*</TableHead>
                        <TableHead className="min-w-[180px]">College Email</TableHead>
                        <TableHead className="min-w-[180px]">Student Email</TableHead>

                        {/* SECTION 5: Address Information */}
                        <TableHead className="min-w-[200px]">Address Street*</TableHead>
                        <TableHead className="min-w-[120px]">Taluk</TableHead>
                        <TableHead className="min-w-[120px]">District*</TableHead>
                        <TableHead className="min-w-[100px]">Pin Code*</TableHead>
                        <TableHead className="min-w-[120px]">State*</TableHead>

                        {/* SECTION 6: Entry & Scholarship */}
                        <TableHead className="min-w-[120px]">Entry Type*</TableHead>
                        <TableHead className="min-w-[150px]">Scholarship Type*</TableHead>

                        {/* SECTION 7: Accommodation */}
                        <TableHead className="min-w-[130px]">Accommodation*</TableHead>
                        <TableHead className="min-w-[100px]">Hostel Type</TableHead>
                        <TableHead className="min-w-[80px]">Food Type</TableHead>

                        {/* SECTION 8: Previous Education */}
                        <TableHead className="min-w-[150px]">Last School*</TableHead>
                        <TableHead className="min-w-[120px]">Board*</TableHead>
                        <TableHead className="min-w-[80px]">10th Max</TableHead>
                        <TableHead className="min-w-[80px]">10th Obt</TableHead>
                        <TableHead className="min-w-[80px]">10th %</TableHead>
                        <TableHead className="min-w-[100px]">12th Group</TableHead>
                        <TableHead className="min-w-[80px]">12th Max</TableHead>
                        <TableHead className="min-w-[80px]">12th Obt</TableHead>
                        <TableHead className="min-w-[80px]">12th %</TableHead>

                        {/* Entrance Exam Details */}
                        <TableHead className="min-w-[100px]">Medical Cutoff</TableHead>
                        <TableHead className="min-w-[100px]">Engg Cutoff</TableHead>
                        <TableHead className="min-w-[120px]">NEET Roll No</TableHead>
                        <TableHead className="min-w-[80px]">NEET Score</TableHead>

                        {/* SECTION 9: Counseling */}
                        <TableHead className="min-w-[100px]">Counseling</TableHead>
                        <TableHead className="min-w-[100px]">Quota</TableHead>
                        <TableHead className="min-w-[80px]">Category</TableHead>

                        {/* SECTION 10: Reference */}
                        <TableHead className="min-w-[100px]">Ref. Type</TableHead>
                        <TableHead className="min-w-[120px]">Ref. Name</TableHead>
                        <TableHead className="min-w-[120px]">Ref. Contact</TableHead>

                        {/* SECTION 12: Enquiry */}
                        <TableHead className="min-w-[100px]">Enquiry Date</TableHead>

                        {/* Errors Column - Sticky Right */}
                        <TableHead className="sticky right-0 bg-background z-20 min-w-[300px] border-l">Issues</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRows.map((row) => (
                        <TableRow key={row.rowNumber} className="hover:bg-muted/50">
                          {/* Sticky Left Columns */}
                          <TableCell className="sticky left-0 bg-background z-20 border-r">
                            <Checkbox
                              checked={row.selected}
                              onCheckedChange={() => toggleRowSelection(row.rowNumber)}
                              disabled={row.validationStatus === 'error'}
                            />
                          </TableCell>
                          <TableCell className="sticky left-12 bg-background z-20 font-mono text-sm border-r">{row.rowNumber}</TableCell>
                          <TableCell className="sticky left-28 bg-background z-20 border-r">
                            <ValidationBadge status={row.validationStatus} />
                          </TableCell>

                          {/* SECTION 1: Personal Info */}
                          <TableCell className="text-xs">
                            <div className="flex items-center gap-1">
                              {row.sanitizedData.first_name || '-'}
                              {row.isExistingLearner && (
                                <span
                                  className="text-amber-600 font-bold cursor-help"
                                  title={`Already exists: ${row.existingLearnerInfo?.college_email || row.existingLearnerInfo?.student_email || 'In database'} (${row.existingLearnerInfo?.lifecycle_status})`}
                                >
                                  ⚠️
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.last_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.date_of_birth || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.gender || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.religion || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.community || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.caste || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.aadhar_number || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.blood_group || '-'}</TableCell>

                          {/* SECTION 2: Parent/Guardian Info */}
                          <TableCell className="text-xs">{row.sanitizedData.father_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.father_occupation || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.father_mobile || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.mother_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.mother_occupation || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.mother_mobile || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.annual_income || '-'}</TableCell>

                          {/* SECTION 3: Academic Assignment */}
                          <TableCell className="text-xs">{row.sanitizedData.institution_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.degree_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.department_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.program_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.semester_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.section_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.academic_year_name || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.admission_year || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.regulation_name || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.batch_name || '-'}</TableCell>

                          {/* SECTION 4: Contact Details */}
                          <TableCell className="text-xs font-mono">{row.sanitizedData.student_mobile || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.college_email || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.student_email || '-'}</TableCell>

                          {/* SECTION 5: Address Information */}
                          <TableCell className="text-xs">{row.sanitizedData.permanent_address_street || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.permanent_address_taluk || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.permanent_address_district || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.permanent_address_pin_code || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.permanent_address_state || '-'}</TableCell>

                          {/* SECTION 6: Entry & Scholarship */}
                          <TableCell className="text-xs">{row.sanitizedData.entry_type || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.scholarship_type || '-'}</TableCell>

                          {/* SECTION 7: Accommodation */}
                          <TableCell className="text-xs">{row.sanitizedData.accommodation_type || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.hostel_type || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.food_type || '-'}</TableCell>

                          {/* SECTION 8: Previous Education */}
                          <TableCell className="text-xs">{row.sanitizedData.last_school || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.board_of_study || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.tenth_max_marks || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.tenth_obtained_marks || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.tenth_percentage || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.twelfth_group || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.twelfth_max_marks || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.twelfth_obtained_marks || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.twelfth_percentage || '-'}</TableCell>

                          {/* Entrance Exam Details */}
                          <TableCell className="text-xs font-mono">{row.sanitizedData.medical_cutoff_marks || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.engineering_cutoff_marks || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.neet_roll_number || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.neet_score || '-'}</TableCell>

                          {/* SECTION 9: Counseling */}
                          <TableCell className="text-xs">{row.sanitizedData.counseling_applied || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.quota || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.category || '-'}</TableCell>

                          {/* SECTION 10: Reference */}
                          <TableCell className="text-xs">{row.sanitizedData.reference_type || '-'}</TableCell>
                          <TableCell className="text-xs">{row.sanitizedData.reference_name || '-'}</TableCell>
                          <TableCell className="text-xs font-mono">{row.sanitizedData.reference_contact || '-'}</TableCell>

                          {/* SECTION 12: Enquiry */}
                          <TableCell className="text-xs">{row.sanitizedData.enquiry_date || '-'}</TableCell>

                          {/* Issues Column - Sticky Right */}
                          <TableCell className="sticky right-0 bg-background z-20 min-w-[300px] border-l">
                            {row.validationResult && (
                              <IssuesDisplay
                                validationResult={row.validationResult}
                                databaseValidationErrors={row.databaseValidationErrors}
                                isExistingLearner={row.isExistingLearner}
                                existingLearnerInfo={row.existingLearnerInfo}
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
                  You are about to upload {state.validationSummary.selectedRows} enquiries.
                  All records will have status &quot;Enquiry&quot; - user accounts will be created only after approval.
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
                  <h3 className="text-lg font-semibold mb-2">Uploading Enquiries...</h3>
                  <p className="text-sm text-muted-foreground">
                    Processing {state.validationSummary.selectedRows} enquiry records
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
                    <CardDescription>Enquiries Created</CardDescription>
                    <CardTitle className="text-3xl text-green-600">
                      {state.result.upload_summary.enquiries_created}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Out of {state.result.upload_summary.total_rows} selected rows
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardDescription>Failed</CardDescription>
                    <CardTitle className="text-3xl text-red-600">
                      {state.result.upload_summary.enquiries_failed}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Check errors below for details
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Created Enquiries Table */}
              {state.result.created_enquiries.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-lg flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      Created Enquiries ({state.result.created_enquiries.length})
                    </h4>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={exportCreatedEnquiries}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Export to Excel
                    </Button>
                  </div>

                  <Alert className="border-green-200 bg-green-50">
                    <AlertCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-900">Important Next Steps</AlertTitle>
                    <AlertDescription className="text-green-800">
                      {state.result.upload_summary.enquiries_created} enquiries have been created with status "Enquiry".
                      Review them in the Enquiries list and use bulk status update to approve them.
                    </AlertDescription>
                  </Alert>

                  <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-[400px] overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-muted z-10">
                          <TableRow>
                            <TableHead className="w-[50px]">#</TableHead>
                            <TableHead className="min-w-[180px]">Name</TableHead>
                            <TableHead className="min-w-[200px]">Email</TableHead>
                            <TableHead className="min-w-[120px]">Mobile</TableHead>
                            <TableHead className="min-w-[200px]">Institution</TableHead>
                            <TableHead className="min-w-[180px]">Program</TableHead>
                            <TableHead className="min-w-[120px]">Semester</TableHead>
                            <TableHead className="min-w-[100px]">Section</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {state.result.created_enquiries.map((enquiry, index) => (
                            <TableRow key={index} className="hover:bg-green-50/50">
                              <TableCell className="font-mono text-xs text-muted-foreground">
                                {index + 1}
                              </TableCell>
                              <TableCell className="font-medium">
                                {enquiry.name}
                              </TableCell>
                              <TableCell className="text-sm font-mono">
                                {enquiry.email}
                              </TableCell>
                              <TableCell className="text-sm font-mono">
                                {enquiry.mobile}
                              </TableCell>
                              <TableCell className="text-sm">
                                {enquiry.institution}
                              </TableCell>
                              <TableCell className="text-sm">
                                {enquiry.program}
                              </TableCell>
                              <TableCell className="text-sm">
                                {enquiry.semester}
                              </TableCell>
                              <TableCell className="text-sm">
                                {enquiry.section}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
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
                          {error.name && <p className="text-xs text-red-700">{error.name}</p>}
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
                    Upload {state.validationSummary.selectedRows} Enquiries
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
