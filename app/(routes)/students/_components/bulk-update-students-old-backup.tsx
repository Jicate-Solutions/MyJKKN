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
  UserCheck,
  Loader2,
  AlertTriangle,
  Info
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

interface BulkUpdateStudentsProps {
  onSuccess?: () => void;
}

export function BulkUpdateStudents({ onSuccess }: BulkUpdateStudentsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<BulkUpdateResult | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setResult(null);
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

  const handleUpload = async () => {
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Simulate progress for UX
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
        throw new Error(error.error || 'Upload failed');
      }

      const data: BulkUpdateResult = await response.json();
      setResult(data);

      // Show summary toast
      if (data.summary.updated > 0) {
        toast.success(
          `Successfully updated ${data.summary.updated} student(s)! ${
            data.summary.usersCreated > 0
              ? `Created ${data.summary.usersCreated} user account(s).`
              : ''
          }`
        );
      } else {
        toast('No students were updated. Check the results for details.');
      }

      // Call success callback
      if (onSuccess) {
        onSuccess();
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to upload file'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setFile(null);
    setResult(null);
    setUploadProgress(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant='default' className='w-full sm:w-auto'>
          <Upload className='mr-2 h-4 w-4' />
          Bulk Update Students
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>Bulk Update Student Onboarding</DialogTitle>
        </DialogHeader>

        {!result ? (
          <>
            {/* Upload Section */}
            <div className='space-y-4'>
              <Alert>
                <Info className='h-4 w-4' />
                <AlertTitle>How Bulk Update Works</AlertTitle>
                <AlertDescription>
                  <ul className='list-disc list-inside mt-2 space-y-1 text-sm'>
                    <li>Only EMPTY fields will be updated</li>
                    <li>Existing data will NOT be overwritten</li>
                    <li>
                      When all required fields are filled, user accounts are
                      created automatically
                    </li>
                    <li>You'll see a detailed report after upload</li>
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

              {isUploading && (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span>Processing updates...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} />
                </div>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button variant='outline' disabled={isUploading}>
                  Cancel
                </Button>
              </DialogClose>
              <Button
                onClick={handleUpload}
                disabled={!file || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Processing...
                  </>
                ) : (
                  'Update Students'
                )}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {/* Results Section */}
            <div className='space-y-4'>
              {/* Summary Cards */}
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

              {/* Detailed Results Tabs */}
              <Tabs defaultValue='updated' className='w-full'>
                <TabsList className='grid w-full grid-cols-4'>
                  <TabsTrigger value='updated'>
                    Updated ({result.success.length})
                  </TabsTrigger>
                  <TabsTrigger value='users'>
                    Users ({result.summary.usersCreated})
                  </TabsTrigger>
                  <TabsTrigger value='skipped'>
                    Skipped ({result.skipped.length})
                  </TabsTrigger>
                  <TabsTrigger value='failed'>
                    Failed ({result.failed.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value='updated' className='mt-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle>Successfully Updated Students</CardTitle>
                      <CardDescription>
                        {result.success.length} student(s) were updated
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className='h-[300px]'>
                        <div className='space-y-2'>
                          {result.success.map((id) => (
                            <div
                              key={id}
                              className='flex items-center p-2 border rounded'
                            >
                              <CheckCircle className='h-4 w-4 text-green-600 mr-2' />
                              <span className='text-sm font-mono'>{id}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value='users' className='mt-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle>User Accounts Created</CardTitle>
                      <CardDescription>
                        {result.userCreation.successful.length} user account(s)
                        were created
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className='h-[300px]'>
                        {result.userCreation.successful.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Student Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Status</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {result.userCreation.successful.map((user) => (
                                <TableRow key={user.studentId}>
                                  <TableCell>{user.studentName}</TableCell>
                                  <TableCell className='font-mono text-sm'>
                                    {user.email}
                                  </TableCell>
                                  <TableCell>
                                    <Badge variant='default'>
                                      <UserCheck className='h-3 w-3 mr-1' />
                                      Created
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className='text-center py-8 text-gray-500'>
                            No user accounts were created
                          </div>
                        )}

                        {result.userCreation.failed.length > 0 && (
                          <>
                            <div className='mt-4 mb-2 font-semibold text-sm text-red-600'>
                              User Creation Failures:
                            </div>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Student Name</TableHead>
                                  <TableHead>Email</TableHead>
                                  <TableHead>Error</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {result.userCreation.failed.map((user) => (
                                  <TableRow key={user.studentId}>
                                    <TableCell>{user.studentName}</TableCell>
                                    <TableCell className='font-mono text-sm'>
                                      {user.email}
                                    </TableCell>
                                    <TableCell className='text-red-600 text-sm'>
                                      {user.error}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value='skipped' className='mt-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle>Skipped Updates</CardTitle>
                      <CardDescription>
                        {result.skipped.length} field(s) were skipped (already
                        had values)
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className='h-[300px]'>
                        {result.skipped.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Student</TableHead>
                                <TableHead>Field</TableHead>
                                <TableHead>Current Value</TableHead>
                                <TableHead>Reason</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {result.skipped.map((skip, index) => (
                                <TableRow key={index}>
                                  <TableCell>{skip.studentName}</TableCell>
                                  <TableCell className='font-mono text-sm'>
                                    {skip.field}
                                  </TableCell>
                                  <TableCell className='text-sm'>
                                    {skip.currentValue || '(empty)'}
                                  </TableCell>
                                  <TableCell className='text-sm text-yellow-600'>
                                    {skip.reason}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className='text-center py-8 text-gray-500'>
                            No fields were skipped
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value='failed' className='mt-4'>
                  <Card>
                    <CardHeader>
                      <CardTitle>Failed Updates</CardTitle>
                      <CardDescription>
                        {result.failed.length} student(s) failed to update
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <ScrollArea className='h-[300px]'>
                        {result.failed.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Student ID</TableHead>
                                <TableHead>Student Name</TableHead>
                                <TableHead>Error</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {result.failed.map((fail) => (
                                <TableRow key={fail.id}>
                                  <TableCell className='font-mono text-sm'>
                                    {fail.id}
                                  </TableCell>
                                  <TableCell>{fail.studentName}</TableCell>
                                  <TableCell className='text-red-600 text-sm'>
                                    {fail.error}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className='text-center py-8 text-gray-500'>
                            No failures
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
