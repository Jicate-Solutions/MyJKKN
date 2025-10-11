'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Upload,
  FileImage,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Download,
  Bug,
  Search,
  Database,
  Shield
} from 'lucide-react';
import { StorageService } from '@/lib/storage/storage-service';
import { toast } from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import Image from 'next/image';

interface FilePreview {
  file: File;
  roll_number: string | null;
  preview_url: string;
  status:
    | 'pending'
    | 'matched'
    | 'unmatched'
    | 'uploading'
    | 'success'
    | 'error';
  error?: string;
  student_name?: string;
  institution_name?: string;
  validation_details?: {
    file_type_valid: boolean;
    file_size_valid: boolean;
    roll_number_extracted: boolean;
    student_found: boolean;
    institution_found: boolean;
    auth_valid: boolean;
  };
  detailed_error?: string;
}

interface DiagnosticLog {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}

interface UploadResult {
  success: Array<{
    roll_number: string;
    student_name: string;
    image_url: string;
  }>;
  failed: Array<{
    filename: string;
    roll_number?: string;
    error: string;
    detailed_error?: string;
  }>;
}

interface UploadProgress {
  completed: number;
  total: number;
  current?: string;
}

export function BulkUploadStudentImagesDebug() {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    completed: 0,
    total: 0
  });
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [activeTab, setActiveTab] = useState('upload');
  const [diagnosticLogs, setDiagnosticLogs] = useState<DiagnosticLog[]>([]);
  const [isRunningDiagnostics, setIsRunningDiagnostics] = useState(false);

  const supabase = createClientSupabaseClient();

  // Enhanced logging function
  const addLog = (
    level: 'info' | 'warn' | 'error',
    message: string,
    data?: any
  ) => {
    const log: DiagnosticLog = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    };
    setDiagnosticLogs((prev) => [...prev, log]);
    console.log(`[${level.toUpperCase()}] ${message}`, data);
  };

  // Test roll number extraction with various patterns
  const testRollNumberExtraction = () => {
    const testFilenames = [
      'DB22079.jpg',
      'db22079.JPG',
      'DB20014.png',
      'CS21001.jpeg',
      'ME20045.gif',
      'invalid_name.jpg',
      'DB22079_photo.jpg',
      '22079.jpg',
      'DBCS22079.jpg',
      'DB220791.jpg'
    ];

    addLog(
      'info',
      'Testing roll number extraction with various filename patterns'
    );

    testFilenames.forEach((filename) => {
      const result = extractRollNumber(filename);
      addLog(
        'info',
        `Filename: ${filename} -> Roll Number: ${result || 'NO MATCH'}`
      );
    });
  };

  // Test database connectivity and student data
  const testDatabaseConnection = async () => {
    addLog('info', 'Testing database connection and student data retrieval');

    try {
      // Test authentication
      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();
      if (authError || !user) {
        addLog('error', 'Authentication failed', authError);
        return;
      }
      addLog('info', 'Authentication successful', { userId: user.id });

      // Test student query
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select(
          `
          id,
          student_name,
          roll_number,
          institutions!inner(name)
        `
        )
        .limit(5);

      if (studentsError) {
        addLog('error', 'Failed to fetch students', studentsError);
        return;
      }

      addLog(
        'info',
        `Successfully fetched ${students?.length || 0} students`,
        students
      );

      // Test specific roll numbers from our sample
      const testRollNumbers = ['DB22079', 'DB20014', 'DB20044'];
      const { data: testStudents, error: testError } = await supabase
        .from('students')
        .select(
          `
          id,
          student_name,
          roll_number,
          institutions!inner(name)
        `
        )
        .in('roll_number', testRollNumbers);

      if (testError) {
        addLog('error', 'Failed to fetch test roll numbers', testError);
        return;
      }

      addLog(
        'info',
        `Test roll numbers found: ${testStudents?.length || 0}`,
        testStudents
      );
    } catch (error) {
      addLog('error', 'Database test failed', error);
    }
  };

  // Test storage bucket access
  const testStorageAccess = async () => {
    addLog('info', 'Testing Supabase storage bucket access');

    try {
      // Test bucket list access
      const { data: buckets, error: bucketsError } =
        await supabase.storage.listBuckets();
      if (bucketsError) {
        addLog('error', 'Failed to list buckets', bucketsError);
        return;
      }
      addLog('info', 'Available buckets', buckets);

      // Test student-photos bucket specifically
      const { data: files, error: filesError } = await supabase.storage
        .from('student-photos')
        .list('', { limit: 5 });

      if (filesError) {
        addLog('error', 'Failed to access student-photos bucket', filesError);
        return;
      }
      addLog('info', 'Student photos bucket accessible', {
        fileCount: files?.length || 0
      });
    } catch (error) {
      addLog('error', 'Storage access test failed', error);
    }
  };

  // Run comprehensive diagnostics
  const runDiagnostics = async () => {
    setIsRunningDiagnostics(true);
    setDiagnosticLogs([]);

    addLog('info', '=== Starting Comprehensive Diagnostics ===');

    testRollNumberExtraction();
    await testDatabaseConnection();
    await testStorageAccess();

    addLog('info', '=== Diagnostics Complete ===');
    setIsRunningDiagnostics(false);
    setActiveTab('diagnostics');
  };

  // Enhanced roll number extraction with logging
  const extractRollNumber = (filename: string): string | null => {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const rollNumberMatch = nameWithoutExt.match(/^([A-Z]{2,4}\d{2,6})$/i);
    return rollNumberMatch ? rollNumberMatch[1].toUpperCase() : null;
  };

  // Enhanced file validation
  const validateFileDetailed = useCallback(async (
    file: File
  ): Promise<FilePreview['validation_details']> => {
    const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB

    const validation = {
      file_type_valid: ALLOWED_TYPES.includes(file.type),
      file_size_valid: file.size <= MAX_SIZE,
      roll_number_extracted: false,
      student_found: false,
      institution_found: false,
      auth_valid: false
    };

    // Test roll number extraction
    const rollNumber = extractRollNumber(file.name);
    validation.roll_number_extracted = !!rollNumber;

    if (rollNumber) {
      try {
        // Test authentication
        const {
          data: { user },
          error: authError
        } = await supabase.auth.getUser();
        validation.auth_valid = !authError && !!user;

        if (validation.auth_valid) {
          // Test student lookup
          const { data: student, error: studentError } = await supabase
            .from('students')
            .select(
              `
              id,
              student_name,
              roll_number,
              institutions!inner(name)
            `
            )
            .eq('roll_number', rollNumber)
            .single();

          validation.student_found = !studentError && !!student;
          validation.institution_found =
            validation.student_found && !!student?.institutions?.[0]?.name;
        }
      } catch (error) {
        addLog('error', `Validation failed for ${file.name}`, error);
      }
    }

    return validation;
  }, [supabase]);

  // Enhanced file drop handler
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    addLog('info', `Processing ${acceptedFiles.length} dropped files`);

    const newFiles: FilePreview[] = [];

    for (const file of acceptedFiles) {
      addLog('info', `Processing file: ${file.name}`);

      const roll_number = extractRollNumber(file.name);
      const validation_details = await validateFileDetailed(file);

      const filePreview: FilePreview = {
        file,
        roll_number,
        preview_url: URL.createObjectURL(file),
        status: roll_number ? 'matched' : 'unmatched',
        validation_details
      };

      // Add detailed error if validation failed
      if (validation_details && !validation_details.file_type_valid) {
        filePreview.detailed_error = `Invalid file type: ${file.type}. Only JPEG, PNG, GIF allowed.`;
      } else if (validation_details && !validation_details.file_size_valid) {
        filePreview.detailed_error = `File too large: ${(
          file.size /
          1024 /
          1024
        ).toFixed(2)}MB. Max 5MB allowed.`;
      } else if (
        validation_details &&
        !validation_details.roll_number_extracted
      ) {
        filePreview.detailed_error = `Could not extract roll number from filename. Expected format: ROLLNUMBER.extension`;
      } else if (validation_details && !validation_details.auth_valid) {
        filePreview.detailed_error = `Authentication required for upload.`;
      } else if (validation_details && !validation_details.student_found) {
        filePreview.detailed_error = `No student found with roll number: ${roll_number}`;
      } else if (validation_details && !validation_details.institution_found) {
        filePreview.detailed_error = `Student institution not found for roll number: ${roll_number}`;
      }

      newFiles.push(filePreview);

      addLog('info', `File processed: ${file.name}`, {
        roll_number,
        validation_details,
        detailed_error: filePreview.detailed_error
      });
    }

    setFiles((prev) => [...prev, ...newFiles]);
    setActiveTab('preview');
  }, [validateFileDetailed]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif']
    },
    multiple: true
  });

  // Remove file from preview
  const removeFile = (index: number) => {
    setFiles((prev) => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview_url);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  // Clear all files
  const clearFiles = () => {
    files.forEach((file) => URL.revokeObjectURL(file.preview_url));
    setFiles([]);
    setUploadResult(null);
    setUploadProgress({ completed: 0, total: 0 });
    setDiagnosticLogs([]);
  };

  // Enhanced bulk upload with detailed logging
  const handleUpload = async () => {
    const validFiles = files.filter(
      (f) => f.status === 'matched' && !f.detailed_error
    );

    if (validFiles.length === 0) {
      toast.error('No valid files to upload');
      addLog('error', 'No valid files available for upload');
      return;
    }

    addLog('info', `Starting bulk upload of ${validFiles.length} files`);
    setIsUploading(true);
    setUploadProgress({ completed: 0, total: validFiles.length });

    try {
      const result = await StorageService.bulkUploadStudentPhotos(
        validFiles.map((f) => f.file),
        (progress) => {
          setUploadProgress(progress);
          addLog(
            'info',
            `Upload progress: ${progress.completed}/${progress.total}`,
            progress
          );
        }
      );

      setUploadResult(result);
      setActiveTab('results');

      addLog('info', `Upload completed`, {
        success: result.success.length,
        failed: result.failed.length
      });

      if (result.success.length > 0) {
        toast.success(`Successfully uploaded ${result.success.length} photos`);
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to upload ${result.failed.length} photos`);
        result.failed.forEach((failure) => {
          addLog('error', `Upload failed: ${failure.filename}`, failure);
        });
      }
    } catch (error) {
      console.error('Bulk upload error:', error);
      addLog('error', 'Bulk upload failed with exception', error);
      toast.error('Bulk upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Download diagnostic report
  const downloadDiagnosticReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      files_processed: files.length,
      files_with_errors: files.filter((f) => f.detailed_error).length,
      diagnostic_logs: diagnosticLogs,
      file_details: files.map((f) => ({
        filename: f.file.name,
        roll_number: f.roll_number,
        status: f.status,
        validation_details: f.validation_details,
        detailed_error: f.detailed_error
      }))
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-upload-diagnostic-report-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const matchedFiles = files.filter((f) => f.status === 'matched');
  const unmatchedFiles = files.filter((f) => f.status === 'unmatched');
  const validFiles = files.filter(
    (f) => f.status === 'matched' && !f.detailed_error
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <Bug className='mr-2 h-4 w-4' />
          Debug Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-6xl max-h-[90vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Bulk Upload Student Photos - Debug Mode</DialogTitle>
          <DialogDescription>
            Enhanced diagnostic version with detailed error logging and
            validation testing
          </DialogDescription>
        </DialogHeader>

        <div className='flex-1 overflow-hidden'>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className='h-full flex flex-col'
          >
            <TabsList className='grid w-full grid-cols-5'>
              <TabsTrigger value='upload'>Upload</TabsTrigger>
              <TabsTrigger value='preview'>
                Preview ({files.length})
              </TabsTrigger>
              <TabsTrigger value='diagnostics'>Diagnostics</TabsTrigger>
              <TabsTrigger value='results'>Results</TabsTrigger>
              <TabsTrigger value='logs'>
                Logs ({diagnosticLogs.length})
              </TabsTrigger>
            </TabsList>

            <div className='flex-1 overflow-hidden'>
              <TabsContent value='upload' className='h-full space-y-4'>
                <div className='flex justify-between items-start'>
                  <div>
                    <h3 className='text-lg font-medium'>Upload Instructions</h3>
                    <p className='text-sm text-muted-foreground'>
                      Name files as ROLLNUMBER.extension (e.g., DB22092.jpg)
                    </p>
                  </div>
                  <div className='space-x-2'>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={runDiagnostics}
                      disabled={isRunningDiagnostics}
                    >
                      {isRunningDiagnostics ? (
                        <>
                          <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                          Running...
                        </>
                      ) : (
                        <>
                          <Search className='mr-2 h-4 w-4' />
                          Run Diagnostics
                        </>
                      )}
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={downloadDiagnosticReport}
                      disabled={diagnosticLogs.length === 0}
                    >
                      <Download className='mr-2 h-4 w-4' />
                      Download Report
                    </Button>
                  </div>
                </div>

                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-primary bg-primary/10'
                      : 'border-muted-foreground/25'
                  }`}
                >
                  <input {...getInputProps()} />
                  <FileImage className='mx-auto h-12 w-12 text-muted-foreground mb-4' />
                  {isDragActive ? (
                    <p>Drop the image files here...</p>
                  ) : (
                    <div>
                      <p className='text-lg mb-2'>
                        Drag & drop image files here, or click to select
                      </p>
                      <p className='text-sm text-muted-foreground'>
                        Supports JPG, PNG, GIF (max 5MB each)
                      </p>
                    </div>
                  )}
                </div>

                <Alert>
                  <AlertCircle className='h-4 w-4' />
                  <AlertTitle>Debug Mode Active</AlertTitle>
                  <AlertDescription>
                    This version provides detailed validation and error logging
                    to help identify upload issues. Check the Diagnostics and
                    Logs tabs for detailed information.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value='preview' className='h-full space-y-4'>
                <div className='flex justify-between items-center'>
                  <div className='flex gap-2 flex-wrap'>
                    <Badge
                      variant='outline'
                      className='bg-green-50 text-green-700'
                    >
                      <CheckCircle className='mr-1 h-3 w-3' />
                      Valid: {validFiles.length}
                    </Badge>
                    <Badge
                      variant='outline'
                      className='bg-yellow-50 text-yellow-700'
                    >
                      <AlertCircle className='mr-1 h-3 w-3' />
                      Matched: {matchedFiles.length}
                    </Badge>
                    <Badge variant='outline' className='bg-red-50 text-red-700'>
                      <XCircle className='mr-1 h-3 w-3' />
                      Unmatched: {unmatchedFiles.length}
                    </Badge>
                    <Badge variant='outline' className='bg-red-50 text-red-700'>
                      <XCircle className='mr-1 h-3 w-3' />
                      Errors: {files.filter((f) => f.detailed_error).length}
                    </Badge>
                  </div>
                  <Button variant='outline' size='sm' onClick={clearFiles}>
                    Clear All
                  </Button>
                </div>

                <ScrollArea className='h-[400px]'>
                  <div className='space-y-3'>
                    {files.map((file, index) => (
                      <Card key={index} className='relative'>
                        <CardContent className='p-4'>
                          <div className='flex items-start gap-4'>
                            <div className='w-16 h-16 relative flex-shrink-0'>
                              <Image
                                src={file.preview_url}
                                alt={file.file.name}
                                className='w-full h-full object-cover rounded'
                                width={100}
                                height={100}
                              />
                              <Button
                                variant='destructive'
                                size='icon'
                                className='absolute -top-2 -right-2 h-6 w-6'
                                onClick={() => removeFile(index)}
                              >
                                <XCircle className='h-3 w-3' />
                              </Button>
                            </div>

                            <div className='flex-1 space-y-2'>
                              <div className='flex items-start justify-between'>
                                <div>
                                  <p
                                    className='font-medium text-sm'
                                    title={file.file.name}
                                  >
                                    {file.file.name}
                                  </p>
                                  <p className='text-xs text-muted-foreground'>
                                    {(file.file.size / 1024 / 1024).toFixed(2)}{' '}
                                    MB
                                  </p>
                                </div>

                                <div className='flex gap-1'>
                                  {file.roll_number ? (
                                    <Badge
                                      variant='outline'
                                      className='text-xs bg-green-50 text-green-700'
                                    >
                                      {file.roll_number}
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant='outline'
                                      className='text-xs bg-red-50 text-red-700'
                                    >
                                      No match
                                    </Badge>
                                  )}

                                  {file.detailed_error && (
                                    <Badge
                                      variant='destructive'
                                      className='text-xs'
                                    >
                                      Error
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              {file.detailed_error && (
                                <Alert className='py-2'>
                                  <AlertCircle className='h-3 w-3' />
                                  <AlertDescription className='text-xs'>
                                    {file.detailed_error}
                                  </AlertDescription>
                                </Alert>
                              )}

                              {file.validation_details && (
                                <div className='grid grid-cols-2 gap-1 text-xs'>
                                  <div
                                    className={`flex items-center gap-1 ${
                                      file.validation_details.file_type_valid
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {file.validation_details.file_type_valid ? (
                                      <CheckCircle className='h-3 w-3' />
                                    ) : (
                                      <XCircle className='h-3 w-3' />
                                    )}
                                    File Type
                                  </div>
                                  <div
                                    className={`flex items-center gap-1 ${
                                      file.validation_details.file_size_valid
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {file.validation_details.file_size_valid ? (
                                      <CheckCircle className='h-3 w-3' />
                                    ) : (
                                      <XCircle className='h-3 w-3' />
                                    )}
                                    File Size
                                  </div>
                                  <div
                                    className={`flex items-center gap-1 ${
                                      file.validation_details
                                        .roll_number_extracted
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {file.validation_details
                                      .roll_number_extracted ? (
                                      <CheckCircle className='h-3 w-3' />
                                    ) : (
                                      <XCircle className='h-3 w-3' />
                                    )}
                                    Roll Number
                                  </div>
                                  <div
                                    className={`flex items-center gap-1 ${
                                      file.validation_details.student_found
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {file.validation_details.student_found ? (
                                      <CheckCircle className='h-3 w-3' />
                                    ) : (
                                      <XCircle className='h-3 w-3' />
                                    )}
                                    Student Found
                                  </div>
                                  <div
                                    className={`flex items-center gap-1 ${
                                      file.validation_details.auth_valid
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {file.validation_details.auth_valid ? (
                                      <CheckCircle className='h-3 w-3' />
                                    ) : (
                                      <XCircle className='h-3 w-3' />
                                    )}
                                    Authentication
                                  </div>
                                  <div
                                    className={`flex items-center gap-1 ${
                                      file.validation_details.institution_found
                                        ? 'text-green-600'
                                        : 'text-red-600'
                                    }`}
                                  >
                                    {file.validation_details
                                      .institution_found ? (
                                      <CheckCircle className='h-3 w-3' />
                                    ) : (
                                      <XCircle className='h-3 w-3' />
                                    )}
                                    Institution
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value='diagnostics' className='h-full space-y-4'>
                <div className='flex justify-between items-center'>
                  <h3 className='text-lg font-medium'>System Diagnostics</h3>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={runDiagnostics}
                    disabled={isRunningDiagnostics}
                  >
                    {isRunningDiagnostics ? (
                      <>
                        <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                        Running...
                      </>
                    ) : (
                      <>
                        <Search className='mr-2 h-4 w-4' />
                        Run Diagnostics
                      </>
                    )}
                  </Button>
                </div>

                <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                  <Card>
                    <CardContent className='p-4 text-center'>
                      <Database className='mx-auto h-8 w-8 text-blue-500 mb-2' />
                      <h4 className='font-medium mb-1'>Database</h4>
                      <p className='text-sm text-muted-foreground'>
                        Connection & queries
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className='p-4 text-center'>
                      <Shield className='mx-auto h-8 w-8 text-green-500 mb-2' />
                      <h4 className='font-medium mb-1'>Authentication</h4>
                      <p className='text-sm text-muted-foreground'>
                        User permissions
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className='p-4 text-center'>
                      <Upload className='mx-auto h-8 w-8 text-purple-500 mb-2' />
                      <h4 className='font-medium mb-1'>Storage</h4>
                      <p className='text-sm text-muted-foreground'>
                        Bucket access
                      </p>
                    </CardContent>
                  </Card>
                </div>

                <ScrollArea className='h-[300px]'>
                  <div className='space-y-2'>
                    {diagnosticLogs.map((log, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded border ${
                          log.level === 'error'
                            ? 'bg-red-50 border-red-200'
                            : log.level === 'warn'
                            ? 'bg-yellow-50 border-yellow-200'
                            : 'bg-blue-50 border-blue-200'
                        }`}
                      >
                        <div className='flex items-start justify-between'>
                          <div className='flex-1'>
                            <p
                              className={`text-sm font-medium ${
                                log.level === 'error'
                                  ? 'text-red-800'
                                  : log.level === 'warn'
                                  ? 'text-yellow-800'
                                  : 'text-blue-800'
                              }`}
                            >
                              {log.message}
                            </p>
                            <p className='text-xs text-muted-foreground mt-1'>
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                          <Badge
                            variant={
                              log.level === 'error' ? 'destructive' : 'outline'
                            }
                            className='text-xs'
                          >
                            {log.level.toUpperCase()}
                          </Badge>
                        </div>
                        {log.data && (
                          <pre className='text-xs mt-2 bg-gray-100 p-2 rounded overflow-x-auto'>
                            {JSON.stringify(log.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>

              <TabsContent value='results' className='h-full space-y-4'>
                {uploadResult && (
                  <div className='space-y-4'>
                    <div className='flex gap-4'>
                      <Card className='flex-1'>
                        <CardContent className='p-4 text-center'>
                          <div className='flex items-center justify-center gap-2 mb-2'>
                            <CheckCircle className='h-5 w-5 text-green-600' />
                            <span className='font-medium'>Successful</span>
                          </div>
                          <div className='text-2xl font-bold text-green-600'>
                            {uploadResult.success.length}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className='flex-1'>
                        <CardContent className='p-4 text-center'>
                          <div className='flex items-center justify-center gap-2 mb-2'>
                            <XCircle className='h-5 w-5 text-red-600' />
                            <span className='font-medium'>Failed</span>
                          </div>
                          <div className='text-2xl font-bold text-red-600'>
                            {uploadResult.failed.length}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    <ScrollArea className='h-[300px]'>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Status</TableHead>
                            <TableHead>Roll Number</TableHead>
                            <TableHead>Student Name</TableHead>
                            <TableHead>Details</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {uploadResult.success.map((item, index) => (
                            <TableRow key={`success-${index}`}>
                              <TableCell>
                                <Badge className='bg-green-50 text-green-700'>
                                  <CheckCircle className='mr-1 h-3 w-3' />
                                  Success
                                </Badge>
                              </TableCell>
                              <TableCell className='font-mono'>
                                {item.roll_number}
                              </TableCell>
                              <TableCell>{item.student_name}</TableCell>
                              <TableCell className='text-sm text-muted-foreground'>
                                Photo uploaded successfully
                              </TableCell>
                            </TableRow>
                          ))}
                          {uploadResult.failed.map((item, index) => (
                            <TableRow key={`failed-${index}`}>
                              <TableCell>
                                <Badge variant='destructive'>
                                  <XCircle className='mr-1 h-3 w-3' />
                                  Failed
                                </Badge>
                              </TableCell>
                              <TableCell className='font-mono'>
                                {item.roll_number || 'Unknown'}
                              </TableCell>
                              <TableCell>-</TableCell>
                              <TableCell className='text-sm'>
                                <div className='text-red-600'>{item.error}</div>
                                {item.detailed_error && (
                                  <div className='text-xs text-muted-foreground mt-1'>
                                    {item.detailed_error}
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
              </TabsContent>

              <TabsContent value='logs' className='h-full space-y-4'>
                <div className='flex justify-between items-center'>
                  <h3 className='text-lg font-medium'>Activity Logs</h3>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => setDiagnosticLogs([])}
                    disabled={diagnosticLogs.length === 0}
                  >
                    Clear Logs
                  </Button>
                </div>

                <ScrollArea className='h-[400px]'>
                  <div className='space-y-1'>
                    {diagnosticLogs.map((log, index) => (
                      <div
                        key={index}
                        className={`p-2 rounded text-sm ${
                          log.level === 'error'
                            ? 'bg-red-50 text-red-800'
                            : log.level === 'warn'
                            ? 'bg-yellow-50 text-yellow-800'
                            : 'bg-gray-50 text-gray-800'
                        }`}
                      >
                        <div className='flex items-start justify-between'>
                          <span className='font-mono text-xs'>
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>
                          <Badge variant='outline' className='text-xs'>
                            {log.level}
                          </Badge>
                        </div>
                        <p className='mt-1'>{log.message}</p>
                        {log.data && (
                          <details className='mt-2'>
                            <summary className='cursor-pointer text-xs text-muted-foreground'>
                              Show data
                            </summary>
                            <pre className='text-xs mt-1 bg-white p-2 rounded border overflow-x-auto'>
                              {JSON.stringify(log.data, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <DialogFooter className='mt-4'>
          <div className='flex justify-between items-center w-full'>
            <div className='flex items-center gap-2'>
              {isUploading && (
                <>
                  <Loader2 className='h-4 w-4 animate-spin' />
                  <span className='text-sm'>
                    Uploading {uploadProgress.completed} of{' '}
                    {uploadProgress.total}...
                  </span>
                  <Progress
                    value={
                      (uploadProgress.completed / uploadProgress.total) * 100
                    }
                    className='w-32'
                  />
                </>
              )}
            </div>
            <div className='flex gap-2'>
              <Button variant='outline' onClick={() => setIsOpen(false)}>
                Close
              </Button>
              {activeTab === 'preview' && validFiles.length > 0 && (
                <Button onClick={handleUpload} disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className='mr-2 h-4 w-4' />
                      Upload {validFiles.length} Valid Photos
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
