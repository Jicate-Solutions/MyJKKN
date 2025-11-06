'use client';

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
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
  Upload,
  X,
  XCircle,
  FileCheck,
  Loader2,
  AlertTriangle,
  Info,
  ArrowRight,
  ArrowLeft
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BulkUpdateResult } from '@/types/student';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';

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
  validationErrors: Array<{
    field: string;
    fieldLabel: string;
    value: any;
    error: string;
  }>;
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

interface BulkUpdateStudentsProps {
  onSuccess?: () => void;
}

type Step = 'upload' | 'preview' | 'results';

export function BulkUpdateStudents({ onSuccess }: BulkUpdateStudentsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewData, setPreviewData] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<BulkUpdateResult | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setPreviewData(null);
      setResult(null);
      setStep('upload');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
        '.xlsx'
      ],
      'application/vnd.ms-excel': ['.xls']
    },
    multiple: false
  });

  // Step 1: Generate Preview
  const handleGeneratePreview = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsProcessing(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch('/api/students/bulk-update/preview', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Preview generation failed');
      }

      const data: PreviewResult = await response.json();
      setPreviewData(data);
      setStep('preview');

      if (data.summary.fieldsWithErrors > 0) {
        toast.error(
          `Found ${data.summary.fieldsWithErrors} field(s) with validation errors. Please review below.`
        );
      } else {
        toast.success(`Preview ready! ${data.summary.validUpdates} students will be updated.`);
      }
    } catch (error) {
      console.error('Error generating preview:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to generate preview'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // Step 2: Apply Updates
  const handleApplyUpdates = async () => {
    if (!file) {
      toast.error('File is missing');
      return;
    }

    setIsProcessing(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch('/api/students/bulk-update', {
        method: 'POST',
        body: formData
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Update failed');
      }

      const data: BulkUpdateResult = await response.json();
      setResult(data);
      setStep('results');

      if (data.summary.updated > 0) {
        toast.success(
          `Successfully updated ${data.summary.updated} student(s)! ${
            data.summary.usersCreated > 0
              ? `Created ${data.summary.usersCreated} user account(s).`
              : ''
          }`
        );
      } else {
        toast('No students were updated. Check the results for details.', { icon: 'ℹ️' });
      }

      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error applying updates:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to apply updates'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setFile(null);
    setPreviewData(null);
    setResult(null);
    setStep('upload');
    setUploadProgress(0);
  };

  const handleBackToUpload = () => {
    setStep('upload');
    setPreviewData(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant='default' className='w-full sm:w-auto'>
          <Upload className='mr-2 h-4 w-4' />
          Bulk Update Students
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-6xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            Bulk Update Student Onboarding
            {step === 'preview' && ' - Review Changes'}
            {step === 'results' && ' - Results'}
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <>
            <div className='space-y-4'>
              <Alert>
                <Info className='h-4 w-4' />
                <AlertTitle>How Bulk Update Works</AlertTitle>
                <AlertDescription>
                  <ul className='list-disc list-inside mt-2 space-y-1 text-sm'>
                    <li>Upload your file to see a preview of all changes</li>
                    <li>Only EMPTY fields will be updated (existing data won't be overwritten)</li>
                    <li>Validation errors will be highlighted in red</li>
                    <li>Review and confirm before applying updates</li>
                  </ul>
                </AlertDescription>
              </Alert>

              <div
                {...getRootProps()}
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                  isDragActive
                    ? 'border-primary bg-primary/10'
                    : 'border-gray-300 hover:border-primary'
                }`}
              >
                <input {...getInputProps()} />
                <Upload className='mx-auto h-12 w-12 text-gray-400 mb-4' />
                {isDragActive ? (
                  <p className='text-lg'>Drop the file here...</p>
                ) : (
                  <>
                    <p className='text-lg mb-2'>
                      Drag & drop a file here, or click to select
                    </p>
                    <p className='text-sm text-gray-500'>
                      Supports: CSV, XLSX, XLS
                    </p>
                  </>
                )}
              </div>

              {file && (
                <Card>
                  <CardHeader>
                    <CardTitle className='text-sm'>Selected File</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='flex items-center justify-between'>
                      <div className='flex items-center'>
                        <FileCheck className='h-4 w-4 mr-2 text-green-600' />
                        <span className='text-sm'>{file.name}</span>
                      </div>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => setFile(null)}
                      >
                        <X className='h-4 w-4' />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {isProcessing && (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span>Generating preview...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant='outline' disabled={isProcessing}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                onClick={handleGeneratePreview}
                disabled={!file || isProcessing}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Processing...
                  </>
                ) : (
                  <>
                    Generate Preview
                    <ArrowRight className='ml-2 h-4 w-4' />
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && previewData && (
          <>
            <div className='space-y-4'>
              {/* Summary Cards */}
              <div className='grid grid-cols-2 md:grid-cols-5 gap-3'>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs font-medium text-gray-500'>
                      Total Students
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-xl font-bold'>
                      {previewData.summary.total}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs font-medium text-green-600'>
                      Valid Updates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-xl font-bold text-green-600'>
                      {previewData.summary.validUpdates}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs font-medium text-red-600'>
                      Invalid Updates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-xl font-bold text-red-600'>
                      {previewData.summary.invalidUpdates}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs font-medium text-blue-600'>
                      Total Fields
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-xl font-bold text-blue-600'>
                      {previewData.summary.totalFields}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-xs font-medium text-orange-600'>
                      Errors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-xl font-bold text-orange-600'>
                      {previewData.summary.fieldsWithErrors}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Error Alert */}
              {previewData.summary.fieldsWithErrors > 0 && (
                <Alert variant='destructive'>
                  <AlertTriangle className='h-4 w-4' />
                  <AlertTitle>Validation Errors Found</AlertTitle>
                  <AlertDescription>
                    {previewData.summary.fieldsWithErrors} field(s) have validation errors.
                    Please fix these in your file before uploading, or the invalid fields will be skipped.
                  </AlertDescription>
                </Alert>
              )}

              {/* Preview Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Preview Changes</CardTitle>
                  <CardDescription>
                    Review all changes before applying updates
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className='h-[400px]'>
                    <Accordion type='multiple' className='w-full'>
                      {previewData.students.map((student, idx) => (
                        <AccordionItem key={idx} value={`student-${idx}`}>
                          <AccordionTrigger>
                            <div className='flex items-center gap-3 w-full'>
                              {student.hasErrors ? (
                                <XCircle className='h-5 w-5 text-red-500 flex-shrink-0' />
                              ) : (
                                <CheckCircle className='h-5 w-5 text-green-500 flex-shrink-0' />
                              )}
                              <div className='flex-1 text-left'>
                                <div className='font-medium'>{student.studentName}</div>
                                <div className='text-xs text-muted-foreground'>
                                  {student.rollNumber || student.id}
                                </div>
                              </div>
                              <Badge variant={student.hasErrors ? 'destructive' : 'default'}>
                                {student.updateCount} updates
                                {student.validationErrors.length > 0 &&
                                  `, ${student.validationErrors.length} errors`}
                              </Badge>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Field</TableHead>
                                  <TableHead>Current Value</TableHead>
                                  <TableHead>→</TableHead>
                                  <TableHead>New Value</TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {student.updates.map((update, updateIdx) => (
                                  <TableRow
                                    key={updateIdx}
                                    className={update.status === 'invalid' ? 'bg-red-50' : ''}
                                  >
                                    <TableCell className='font-medium'>
                                      {update.fieldLabel}
                                    </TableCell>
                                    <TableCell className='text-muted-foreground'>
                                      {update.currentValue || <em>Empty</em>}
                                    </TableCell>
                                    <TableCell>
                                      <ArrowRight className='h-4 w-4' />
                                    </TableCell>
                                    <TableCell className='font-medium'>
                                      {update.newValue}
                                    </TableCell>
                                    <TableCell>
                                      {update.status === 'valid' ? (
                                        <Badge variant='outline' className='bg-green-50 text-green-700 border-green-200'>
                                          ✓ Valid
                                        </Badge>
                                      ) : (
                                        <div className='space-y-1'>
                                          <Badge variant='destructive'>
                                            ✗ Invalid
                                          </Badge>
                                          {update.error && (
                                            <p className='text-xs text-red-600'>{update.error}</p>
                                          )}
                                        </div>
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            <DialogFooter>
              <Button
                variant='outline'
                onClick={handleBackToUpload}
                disabled={isProcessing}
              >
                <ArrowLeft className='mr-2 h-4 w-4' />
                Back
              </Button>
              <Button
                onClick={handleApplyUpdates}
                disabled={isProcessing || previewData.summary.validUpdates === 0}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Applying Updates...
                  </>
                ) : (
                  <>
                    Confirm & Apply Updates
                    <CheckCircle className='ml-2 h-4 w-4' />
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Results - Keep existing results view */}
        {step === 'results' && result && (
          <>
            <div className='space-y-4'>
              {/* Summary Cards - same as before but with modern styling */}
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-medium text-gray-500'>
                      Total
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold'>
                      {result.summary.total}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-medium text-green-600'>
                      Updated
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold text-green-600'>
                      {result.summary.updated}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-medium text-blue-600'>
                      Users Created
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold text-blue-600'>
                      {result.summary.usersCreated}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className='pb-2'>
                    <CardTitle className='text-sm font-medium text-red-600'>
                      Failed
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold text-red-600'>
                      {result.summary.failed}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Alert>
                <CheckCircle className='h-4 w-4' />
                <AlertTitle>Update Complete</AlertTitle>
                <AlertDescription>
                  {result.summary.updated} student(s) updated successfully.
                  {result.summary.usersCreated > 0 &&
                    ` Created ${result.summary.usersCreated} user account(s).`}
                </AlertDescription>
              </Alert>

              {/* Results table - simplified version showing key info */}
              {result.failed.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className='text-red-600'>Failed Updates</CardTitle>
                    <CardDescription>
                      {result.failed.length} student(s) could not be updated
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className='h-[300px]'>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Student</TableHead>
                            <TableHead>Error</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {result.failed.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell>{item.studentName}</TableCell>
                              <TableCell className='text-red-600'>{item.error}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
