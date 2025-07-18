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
  Users,
  Image as ImageIcon
} from 'lucide-react';
import { StorageService } from '@/lib/storage/storage-service';
import { toast } from 'react-hot-toast';
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
  }>;
}

interface UploadProgress {
  completed: number;
  total: number;
  current?: string;
}

export function BulkUploadStudentImages() {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    completed: 0,
    total: 0
  });
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [activeTab, setActiveTab] = useState('upload');

  // Extract roll number from filename
  const extractRollNumber = (filename: string): string | null => {
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    const rollNumberMatch = nameWithoutExt.match(/^([A-Z]{2,4}\d{2,6})$/i);
    return rollNumberMatch ? rollNumberMatch[1].toUpperCase() : null;
  };

  // Handle file drop
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: FilePreview[] = acceptedFiles.map((file) => {
      const roll_number = extractRollNumber(file.name);
      return {
        file,
        roll_number,
        preview_url: URL.createObjectURL(file),
        status: roll_number ? 'matched' : 'unmatched'
      };
    });

    setFiles((prev) => [...prev, ...newFiles]);
    setActiveTab('preview');
  }, []);

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
  };

  // Handle bulk upload
  const handleUpload = async () => {
    const validFiles = files.filter((f) => f.status === 'matched');

    if (validFiles.length === 0) {
      toast.error('No valid files to upload');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ completed: 0, total: validFiles.length });

    try {
      const result = await StorageService.bulkUploadStudentPhotos(
        validFiles.map((f) => f.file),
        (progress) => {
          setUploadProgress(progress);
        }
      );

      setUploadResult(result);
      setActiveTab('results');

      if (result.success.length > 0) {
        toast.success(`Successfully uploaded ${result.success.length} photos`);
      }

      if (result.failed.length > 0) {
        toast.error(`Failed to upload ${result.failed.length} photos`);
      }
    } catch (error) {
      console.error('Bulk upload error:', error);
      toast.error('Bulk upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Download template
  const downloadTemplate = () => {
    const content = `# Student Photo Upload Template

## File Naming Convention
Name your image files using the student's roll number followed by the file extension.

Examples:
- DB22092.jpg
- CS21001.png
- ME20045.jpeg

## Supported Formats
- JPEG (.jpg, .jpeg)
- PNG (.png)
- GIF (.gif)

## File Size Limit
- Maximum 5MB per image

## Instructions
1. Rename your image files to match the student roll numbers
2. Upload all files at once using the bulk upload tool
3. Review the preview to ensure all files are matched correctly
4. Click "Upload All" to complete the process

## Example File Names
DB22092.jpg - Will be matched to student with roll number DB22092
CS21001.png - Will be matched to student with roll number CS21001
ME20045.jpeg - Will be matched to student with roll number ME20045
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student-photo-upload-template.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const matchedFiles = files.filter((f) => f.status === 'matched');
  const unmatchedFiles = files.filter((f) => f.status === 'unmatched');

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <ImageIcon className='mr-2 h-4 w-4' />
          Bulk Upload Photos
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[80vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Bulk Upload Student Photos</DialogTitle>
          <DialogDescription>
            Upload multiple student photos at once using roll number-based file
            naming
          </DialogDescription>
        </DialogHeader>

        <div className='flex-1 overflow-hidden'>
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className='h-full flex flex-col'
          >
            <TabsList className='grid w-full grid-cols-3'>
              <TabsTrigger value='upload'>Upload Files</TabsTrigger>
              <TabsTrigger value='preview'>
                Preview ({files.length})
              </TabsTrigger>
              <TabsTrigger value='results'>Results</TabsTrigger>
            </TabsList>

            <div className='flex-1 overflow-hidden'>
              <TabsContent value='upload' className='h-full space-y-4'>
                <div className='flex justify-between items-center'>
                  <div>
                    <h3 className='text-lg font-medium'>Upload Instructions</h3>
                    <p className='text-sm text-muted-foreground'>
                      Name files as ROLLNUMBER.extension (e.g., DB22092.jpg)
                    </p>
                  </div>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={downloadTemplate}
                  >
                    <Download className='mr-2 h-4 w-4' />
                    Download Template
                  </Button>
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
                  <AlertTitle>File Naming Convention</AlertTitle>
                  <AlertDescription>
                    Files must be named using the student&apos;s roll number
                    (e.g., DB22092.jpg). Files with invalid names will be shown
                    as unmatched and won&apos;t be uploaded.
                  </AlertDescription>
                </Alert>
              </TabsContent>

              <TabsContent value='preview' className='h-full space-y-4'>
                <div className='flex justify-between items-center'>
                  <div className='flex gap-2'>
                    <Badge
                      variant='outline'
                      className='bg-green-50 text-green-700'
                    >
                      <CheckCircle className='mr-1 h-3 w-3' />
                      Matched: {matchedFiles.length}
                    </Badge>
                    <Badge variant='outline' className='bg-red-50 text-red-700'>
                      <XCircle className='mr-1 h-3 w-3' />
                      Unmatched: {unmatchedFiles.length}
                    </Badge>
                  </div>
                  <Button variant='outline' size='sm' onClick={clearFiles}>
                    Clear All
                  </Button>
                </div>

                <ScrollArea className='h-[400px]'>
                  <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
                    {files.map((file, index) => (
                      <Card key={index} className='relative'>
                        <CardContent className='p-3'>
                          <div className='aspect-square relative mb-2'>
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
                          <div className='space-y-1'>
                            <p
                              className='text-xs font-medium truncate'
                              title={file.file.name}
                            >
                              {file.file.name}
                            </p>
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
                          </div>
                        </CardContent>
                      </Card>
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
                              <TableCell className='text-sm text-red-600'>
                                {item.error}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
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
              {activeTab === 'preview' && matchedFiles.length > 0 && (
                <Button onClick={handleUpload} disabled={isUploading}>
                  {isUploading ? (
                    <>
                      <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className='mr-2 h-4 w-4' />
                      Upload {matchedFiles.length} Photos
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
