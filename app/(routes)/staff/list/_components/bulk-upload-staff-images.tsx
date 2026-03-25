'use client';

import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
  Loader2
} from 'lucide-react';
import { StorageService } from '@/lib/storage/storage-service';
import { toast } from 'react-hot-toast';
import Image from 'next/image';

interface FilePreview {
  file: File;
  preview_url: string;
}

interface UploadResult {
  success: Array<{
    staff_id: string;
    staff_name: string;
    image_url: string;
  }>;
  failed: Array<{ filename: string; staff_id?: string; error: string }>;
}

interface UploadProgress {
  completed: number;
  total: number;
  current?: string;
}

export function BulkUploadStaffImages() {
  const [isOpen, setIsOpen] = useState(false);
  const [files, setFiles] = useState<FilePreview[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    completed: 0,
    total: 0
  });
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const onDrop = (acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      file,
      preview_url: URL.createObjectURL(file)
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif']
    },
    multiple: true
  });

  const removeFile = (index: number) => {
    setFiles((prev) => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].preview_url);
      newFiles.splice(index, 1);
      return newFiles;
    });
  };

  const clearFiles = () => {
    files.forEach((file) => URL.revokeObjectURL(file.preview_url));
    setFiles([]);
    setUploadResult(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error('No files to upload');
      return;
    }

    setIsUploading(true);
    setUploadProgress({ completed: 0, total: files.length });

    try {
      const result = await StorageService.bulkUploadStaffPhotos(
        files.map((f) => f.file),
        (progress) => setUploadProgress(progress)
      );

      setUploadResult(result);

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

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <Upload className='mr-2 h-4 w-4' />
          Bulk Upload Photos
        </Button>
      </DialogTrigger>
      <DialogContent className='max-w-4xl max-h-[80vh] flex flex-col'>
        <DialogHeader>
          <DialogTitle>Bulk Upload Staff Photos</DialogTitle>
          <DialogDescription>
            Upload photos for multiple staff members at once. Name files as
            STAFF_ID.extension (e.g., EMP123.jpg).
          </DialogDescription>
        </DialogHeader>

        <div className='flex-1 overflow-y-auto p-1 space-y-4'>
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
              <p>Drag & drop image files here, or click to select</p>
            )}
          </div>

          {files.length > 0 && (
            <div className='space-y-4'>
              <h3 className='text-lg font-medium'>
                Files to Upload ({files.length})
              </h3>
              <div className='max-h-60 overflow-y-auto space-y-2 pr-2'>
                {files.map((file, index) => (
                  <div
                    key={index}
                    className='flex items-center justify-between p-2 border rounded-md'
                  >
                    <div className='flex items-center gap-2'>
                      <Image
                        src={file.preview_url}
                        alt={file.file.name}
                        width={40}
                        height={40}
                        unoptimized={true}
                        className='h-10 w-10 object-cover rounded'
                      />
                      <span className='text-sm font-medium'>
                        {file.file.name}
                      </span>
                    </div>
                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => removeFile(index)}
                    >
                      <XCircle className='h-4 w-4' />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isUploading && (
            <div className='space-y-2'>
              <Progress
                value={(uploadProgress.completed / uploadProgress.total) * 100}
              />
              <p className='text-sm text-muted-foreground'>
                Uploading {uploadProgress.completed} of {uploadProgress.total}
                ... {uploadProgress.current}
              </p>
            </div>
          )}

          {uploadResult && (
            <div>
              <h3 className='text-lg font-medium mb-2'>Upload Results</h3>
              <div className='max-h-60 overflow-y-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>File/Staff ID</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uploadResult.success.map((item, index) => (
                      <TableRow key={`success-${index}`}>
                        <TableCell>
                          <Badge variant='success'>Success</Badge>
                        </TableCell>
                        <TableCell>{item.staff_id}</TableCell>
                        <TableCell>{item.staff_name}</TableCell>
                      </TableRow>
                    ))}
                    {uploadResult.failed.map((item, index) => (
                      <TableRow key={`failed-${index}`}>
                        <TableCell>
                          <Badge variant='destructive'>Failed</Badge>
                        </TableCell>
                        <TableCell>{item.filename}</TableCell>
                        <TableCell>{item.error}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => {
              setIsOpen(false);
              clearFiles();
            }}
            disabled={isUploading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleUpload}
            disabled={isUploading || files.length === 0}
          >
            {isUploading ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Uploading...
              </>
            ) : (
              'Upload'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
