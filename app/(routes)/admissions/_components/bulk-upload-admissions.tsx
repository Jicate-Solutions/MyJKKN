import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UploadCloud } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function BulkUploadAdmissions() {
  const { toast } = useToast();
  const supabase = getSupabaseClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (
        selectedFile.type !==
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' &&
        selectedFile.type !== 'application/vnd.ms-excel' &&
        selectedFile.type !== 'text/csv'
      ) {
        toast({
          variant: 'destructive',
          title: 'Invalid file type',
          description: 'Please upload an Excel or CSV file'
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  const simulateProgress = () => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 10;
      if (progress > 90) {
        clearInterval(interval);
      } else {
        setUploadProgress(Math.min(Math.round(progress), 90));
      }
    }, 300);

    return () => clearInterval(interval);
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        variant: 'destructive',
        title: 'No file selected',
        description: 'Please select a file to upload'
      });
      return;
    }

    setUploading(true);
    const stopProgress = simulateProgress();

    try {
      // Convert file to Base64 for processing
      const reader = new FileReader();

      reader.onload = async (event) => {
        const fileContent = event.target?.result;

        // Normally, here you would send the file to a server endpoint
        // that would process the file and insert the records into the database

        // For this example, we'll just simulate the API call with a timeout
        await new Promise((resolve) => setTimeout(resolve, 3000));

        // In real implementation, here would be the code to call your API:
        // const response = await fetch('/api/admissions/bulk-upload', {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //   },
        //   body: JSON.stringify({
        //     fileContent,
        //     fileName: file.name,
        //   }),
        // });

        // if (!response.ok) {
        //   throw new Error('Failed to upload file');
        // }

        // const data = await response.json();

        stopProgress();
        setUploadProgress(100);

        // Success message
        toast({
          title: 'Upload successful',
          description: `Successfully processed ${file.name}`
        });

        // Close the dialog and reset state
        setTimeout(() => {
          setOpen(false);
          setFile(null);
          setUploading(false);
          setUploadProgress(0);
        }, 1000);
      };

      reader.onerror = () => {
        throw new Error('Failed to read file');
      };

      reader.readAsDataURL(file);
    } catch (error) {
      stopProgress();
      setUploading(false);
      setUploadProgress(0);

      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description:
          error instanceof Error ? error.message : 'An unknown error occurred'
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant='outline'>
          <UploadCloud className='mr-2 h-4 w-4' />
          Bulk Upload
        </Button>
      </DialogTrigger>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Bulk Upload Admissions</DialogTitle>
          <DialogDescription>
            Upload a CSV or Excel file with admission records
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-4 py-4'>
          <div className='flex items-center gap-4'>
            <div className='grid flex-1 gap-2'>
              <Input
                type='file'
                accept='.xlsx,.xls,.csv'
                onChange={handleFileChange}
                disabled={uploading}
              />
              {file && (
                <p className='text-sm text-muted-foreground'>
                  Selected file: {file.name}
                </p>
              )}
            </div>
          </div>

          {uploading && (
            <div className='space-y-2'>
              <div className='h-2 w-full rounded-full bg-secondary'>
                <div
                  className='h-full rounded-full bg-primary transition-all duration-300'
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className='text-xs text-center text-muted-foreground'>
                {uploadProgress < 100
                  ? 'Processing file...'
                  : 'Upload complete!'}
              </p>
            </div>
          )}

          <div className='text-xs text-muted-foreground'>
            <p>Note: The file should contain the following columns:</p>
            <ul className='list-disc pl-4 mt-1 space-y-1'>
              <li>Student Name</li>
              <li>Father Name</li>
              <li>Mother Name</li>
              <li>Date of Birth (YYYY-MM-DD)</li>
              <li>Gender</li>
              <li>Institution</li>
              <li>Course</li>
              <li>Contact Number</li>
              <li>Email</li>
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button
            type='submit'
            onClick={handleUpload}
            disabled={!file || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
