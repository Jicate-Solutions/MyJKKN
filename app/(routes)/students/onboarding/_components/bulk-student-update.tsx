'use client';

import React, { useState, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

// Define the expected structure for each row in the uploaded file
// IMPORTANT: Adjust this schema based on how you want to match students.
// Using student_id is the safest. If using email/roll_number, ensure they are unique.
const studentUpdateSchema = z.object({
  student_id: z.string().uuid('Invalid Student ID format (UUID expected)'), // Preferred identifier
  // OR use other identifiers, but ensure uniqueness checks if needed:
  // student_email: z.string().email('Invalid student email format').optional(),
  // roll_number: z.string().min(1, 'Roll number cannot be empty').optional(),
  college_email: z.string().email('Invalid college email format'),
  roll_number: z.string().min(1, 'Roll number cannot be empty')
  // Add any other fields you want to allow bulk updating
});

type StudentUpdateData = z.infer<typeof studentUpdateSchema>;

type ValidationError = {
  row: number;
  errors: Record<string, string[] | undefined>; // More specific error mapping
  rowData: Record<string, any>; // Include original row data for context
};

export function BulkStudentUpdate() {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>(
    []
  );
  const [validRows, setValidRows] = useState<StudentUpdateData[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    message: string;
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
              transformHeader: (header) => header.trim(), // Trim header spaces
              transform: (value) => value.trim() // Trim cell value spaces
            });
            if (result.errors.length > 0) {
              toast.error(`CSV parsing error: ${result.errors[0].message}`);
              setIsValidating(false);
              setFile(null); // Clear invalid file
              return;
            }
            parsedData = result.data as Record<string, any>[];
          } else {
            // Excel
            const workbook = XLSX.read(fileContent, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            parsedData = XLSX.utils.sheet_to_json(worksheet, {
              defval: ''
            }) as Record<string, any>[];
            // Trim values for Excel data
            parsedData = parsedData.map((row) => {
              const trimmedRow: Record<string, any> = {};
              for (const key in row) {
                trimmedRow[key.trim()] =
                  typeof row[key] === 'string' ? row[key].trim() : row[key];
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
          const valid: StudentUpdateData[] = [];

          parsedData.forEach((row, index) => {
            const result = studentUpdateSchema.safeParse(row);
            if (!result.success) {
              errors.push({
                row: index + 2, // Assuming header is row 1, data starts row 2
                errors: result.error.flatten().fieldErrors,
                rowData: row
              });
            } else {
              valid.push(result.data);
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
        reader.readAsText(fileToValidate); // Read CSV as text
      } else {
        reader.readAsBinaryString(fileToValidate); // Read Excel as binary string
      }
    },
    [
      resetState,
      setFile,
      setIsValidating,
      setValidationErrors,
      setValidRows,
      setUploadResult
    ]
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
      // Simulate progress for now - replace with actual API call
      // TODO: Replace with actual API call to /api/students/bulk-update
      const totalRows = validRows.length;
      for (let i = 0; i < totalRows; i++) {
        // Simulate processing each row
        await new Promise((resolve) => setTimeout(resolve, 50)); // Simulate network/db time
        setUploadProgress(((i + 1) / totalRows) * 100);
      }

      // --- Make the actual API call ---
      /* 
      const response = await fetch('/api/students/bulk-update', { // Replace with your actual API endpoint
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validRows),
      });

      const resultData = await response.json();

      if (!response.ok) {
        throw new Error(resultData.error || 'Bulk update failed');
      }
      setUploadResult({ success: true, message: resultData.message || `${totalRows} students updated successfully.` });
      toast.success(resultData.message || 'Bulk update successful!');
      */
      // --- End API Call ---

      // --- Placeholder Success ---
      setUploadResult({
        success: true,
        message: `${totalRows} students would be updated (API call placeholder).`
      });
      toast.success('Placeholder: Bulk update successful!');
      // --- End Placeholder Success ---

      // Reset after successful upload
      resetState();
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
          Bulk Update Students
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-3xl max-h-[80vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Bulk Student onboarding Update</DialogTitle>
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
                Required columns: student_id, college_email, roll_number
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
                  <AlertDescription>{uploadResult.message}</AlertDescription>
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
