'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
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

// Define the Zod schema for validating a NEW student row
// This needs to align with your CreateStudentDto and database requirements
const newStudentSchema = z
  .object({
    // Personal Info
    student_name: z.string().min(1, 'Student name is required'),
    father_name: z.string().min(1, 'Father name is required'),
    father_occupation: z.string().optional().nullable(),
    father_mobile: z.string().optional().nullable(), // Add more specific phone validation if needed
    mother_name: z.string().min(1, 'Mother name is required'),
    mother_occupation: z.string().optional().nullable(),
    mother_mobile: z.string().min(1, 'Mother mobile is required'),
    date_of_birth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'),
    gender: z.string().min(1, 'Gender is required'),
    religion: z.string().min(1, 'Religion is required'),
    community: z.string().min(1, 'Community is required'),
    caste: z.string().optional().nullable(),
    annual_income: z.string().optional().nullable(),

    // Academic Info
    last_school: z.string().min(1, 'Last school is required'),
    board_of_study: z.string().min(1, 'Board of study is required'),
    tenth_marks_json: z.string().refine(
      (val) => {
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Tenth marks must be valid JSON string' }
    ),
    twelfth_marks_json: z.string().refine(
      (val) => {
        try {
          JSON.parse(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Twelfth marks must be valid JSON string' }
    ),
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
    institution_id: z.string().uuid('Valid Institution UUID required'),
    degree_id: z.string().uuid('Valid Degree UUID required'),
    department_id: z.string().uuid('Valid Department UUID required'),
    program_id: z.string().uuid('Valid Program UUID required'),
    entry_type: z.string().min(1, 'Entry type is required'),

    // Contact Info
    permanent_address_street: z.string().min(1, 'Address street is required'),
    permanent_address_taluk: z.string().optional().nullable(),
    permanent_address_district: z
      .string()
      .min(1, 'Address district is required'),
    permanent_address_pin_code: z
      .string()
      .regex(/^\d{6}$/, 'Address PIN code must be 6 digits'),
    permanent_address_state: z.string().min(1, 'Address state is required'),
    student_mobile: z.string().min(1, 'Student mobile is required'),
    student_email: z.string().email('Valid student email required'),

    // Accommodation Info
    accommodation_type: z.string().min(1, 'Accommodation type is required'),
    hostel_type: z.string().optional().nullable(),
    bus_required: z
      .preprocess((val) => String(val).toLowerCase() === 'true', z.boolean())
      .optional()
      .nullable(),
    bus_route: z.string().optional().nullable(),
    bus_pickup_location: z.string().optional().nullable(),

    // Reference Info
    reference_type: z.string().optional().nullable(),
    reference_name: z.string().optional().nullable(),
    reference_contact: z.string().optional().nullable(),

    // Optional fields (for potential immediate promotion/user creation)
    roll_number: z.string().optional().nullable(),
    college_email: z
      .string()
      .email('Invalid college email format')
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
    [resetState]
  );

  const handleFileValidation = async (fileToValidate: File) => {
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
            dynamicTyping: false // Keep everything as string initially for zod preprocess
          });
          if (result.errors.length > 0) {
            toast.error(`CSV parsing error: ${result.errors[0].message}`);
            setIsValidating(false);
            setFile(null);
            return;
          }
          parsedData = result.data as Record<string, any>[];
        } else {
          // Excel
          const workbook = XLSX.read(fileContent, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          // Use raw: false to try and get correct types, but Zod preprocess handles strings anyway
          parsedData = XLSX.utils.sheet_to_json(worksheet, {
            defval: '',
            raw: false
          }) as Record<string, any>[];
          // Trim keys and string values
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

        // Ensure required headers are present
        const headers = Object.keys(parsedData[0] || {});
        const requiredHeaders = Object.keys(newStudentSchema.shape);
        const missingHeaders = requiredHeaders.filter(
          (h) =>
            !headers.includes(h) &&
            !(
              newStudentSchema.shape[
                h as keyof typeof newStudentSchema.shape
              ] instanceof z.ZodOptional
            ) &&
            !(
              newStudentSchema.shape[
                h as keyof typeof newStudentSchema.shape
              ] instanceof z.ZodNullable
            )
          // Crude check for optional/nullable - Zod doesn't expose easily
        );

        // A better check might be needed if complex optional types are used
        // This check assumes simple optional()/nullable()

        // Refined missing headers check (Check Zod schema definition)
        const requiredSchemaFields = Object.entries(newStudentSchema.shape)
          .filter(
            ([_, schemaType]) =>
              !(schemaType.isOptional() || schemaType.isNullable())
          )
          .map(([key, _]) => key);

        const actualMissingHeaders = requiredSchemaFields.filter(
          (h) => !headers.includes(h)
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

        parsedData.forEach((row, index) => {
          // Pre-process boolean fields expected as strings 'TRUE'/'FALSE'
          const processedRow = { ...row };
          ['counseling_applied', 'first_graduate', 'bus_required'].forEach(
            (key) => {
              if (typeof processedRow[key] === 'string') {
                processedRow[key] = processedRow[key].trim().toLowerCase();
              }
            }
          );

          const result = newStudentSchema.safeParse(processedRow);
          if (!result.success) {
            errors.push({
              row: index + 2, // Row number in the spreadsheet
              errors: result.error.flatten().fieldErrors,
              rowData: row // Show original data for reference
            });
          } else {
            // Transform JSON strings back to objects after validation
            const validData = result.data;
            try {
              validData.tenth_marks_json = JSON.parse(
                validData.tenth_marks_json
              );
              validData.twelfth_marks_json = JSON.parse(
                validData.twelfth_marks_json
              );
              valid.push(validData);
            } catch (jsonError) {
              errors.push({
                row: index + 2,
                errors: {
                  json_parse: ['Failed to parse marks JSON after validation']
                },
                rowData: row
              });
            }
          }
        });

        setValidationErrors(errors);
        setValidRows(valid);

        if (errors.length > 0) {
          toast.warning(
            `Validation finished with ${errors.length} error(s). Please fix them before uploading.`
          );
        } else if (valid.length > 0) {
          toast.success(
            `Validation successful. ${valid.length} rows ready for upload.`
          );
        } else {
          toast.info('No valid rows found to upload after validation.');
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
  };

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
      // --- Make the actual API call to bulk-create endpoint ---
      const response = await fetch('/api/students/bulk-create', {
        // Target the new API endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(validRows)
      });

      const resultData = await response.json();

      if (!response.ok) {
        // Display specific errors from the backend if available
        const errorDetail =
          resultData.error ||
          resultData.message ||
          'Bulk creation failed with unknown error';
        const failedCount = resultData.failed ?? validRows.length; // Estimate failed count if not provided
        setUploadResult({
          success: false,
          message: `Upload failed. ${errorDetail} (${failedCount} records failed).`,
          created: resultData.created,
          failed: failedCount
        });
        toast.error(`Bulk creation failed: ${errorDetail}`);
      } else {
        // Success
        const message =
          resultData.message ||
          `${resultData.created} students created successfully. ${resultData.failed} failed.`;
        setUploadResult({
          success: true,
          message: message,
          created: resultData.created,
          failed: resultData.failed
        });
        toast.success(message);
        // Reset after successful upload
        resetState();
        router.refresh(); // Refresh the student list page
      }
    } catch (error) {
      console.error('Error during bulk upload:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'An unknown error occurred during upload.';
      setUploadResult({ success: false, message });
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
                  <span>Validating file...</span>
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
                  </AlertDescription>
                </Alert>
              )}
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
