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

    // Optional fields (for potential immediate onboarding/user creation)
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
          const headers = Object.keys(parsedData[0] || {});
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
                row: index + 2,
                errors: result.error.flatten().fieldErrors,
                rowData: row
              });
            } else {
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
            toast(
              `Validation finished with ${errors.length} error(s). Please fix them before uploading.`,
              { icon: '⚠️' }
            );
          } else if (valid.length > 0) {
            toast.success(
              `Validation successful. ${valid.length} rows ready for upload.`
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
            // Parse JSON strings if needed
            const tenthMarks =
              typeof row.tenth_marks_json === 'string'
                ? JSON.parse(row.tenth_marks_json)
                : row.tenth_marks_json;

            const twelfthMarks =
              typeof row.twelfth_marks_json === 'string'
                ? JSON.parse(row.twelfth_marks_json)
                : row.twelfth_marks_json;

            // Create a new object without the _json fields
            const { tenth_marks_json, twelfth_marks_json, ...restData } = row;

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
