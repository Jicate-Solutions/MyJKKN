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
            <p>Note: The file should contain the following columns (all fields are optional):</p>
            <div className='mt-2 max-h-48 overflow-y-auto'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
                <div>
                  <p className='font-semibold text-blue-600 mb-1'>Basic Details:</p>
                  <ul className='list-disc pl-4 space-y-1'>
                    <li>Enquiry Date</li>
                    <li>First Name</li>
                    <li>Last Name</li>
                    <li>Father Name</li>
                    <li>Father Occupation</li>
                    <li>Father Mobile</li>
                    <li>Mother Name</li>
                    <li>Mother Occupation</li>
                    <li>Mother Mobile</li>
                    <li>Date of Birth (YYYY-MM-DD)</li>
                    <li>Gender</li>
                    <li>Religion</li>
                    <li>Community</li>
                    <li>Caste</li>
                    <li>Annual Income</li>
                  </ul>
                  
                  <p className='font-semibold text-green-600 mb-1 mt-3'>Academic Info:</p>
                  <ul className='list-disc pl-4 space-y-1'>
                    <li>Last School</li>
                    <li>Board of Study</li>
                    <li>10th Max Marks</li>
                    <li>10th Obtained Marks</li>
                    <li>10th Percentage</li>
                    <li>12th Group</li>
                    <li>12th Max Marks</li>
                    <li>12th Obtained Marks</li>
                    <li>12th Percentage</li>
                    <li>12th Subject 1-4 Names & Marks</li>
                    <li>NEET Roll Number</li>
                    <li>Medical Cutoff Marks</li>
                    <li>Engineering Cutoff Marks</li>
                    <li>Counseling Applied</li>
                    <li>Counseling Number</li>
                    <li>First Graduate</li>
                  </ul>
                </div>
                
                <div>
                  <p className='font-semibold text-purple-600 mb-1'>Course Selection:</p>
                  <ul className='list-disc pl-4 space-y-1'>
                    <li>Quota</li>
                    <li>Category</li>
                    <li>Institution</li>
                    <li>Degree</li>
                    <li>Department</li>
                    <li>Program</li>
                    <li>Entry Type</li>
                  </ul>
                  
                  <p className='font-semibold text-orange-600 mb-1 mt-3'>Contact Details:</p>
                  <ul className='list-disc pl-4 space-y-1'>
                    <li>Permanent Address Street</li>
                    <li>Permanent Address Taluk</li>
                    <li>Permanent Address District</li>
                    <li>Permanent Address Pin Code</li>
                    <li>Permanent Address State</li>
                    <li>Student Mobile</li>
                    <li>Student Email</li>
                  </ul>
                  
                  <p className='font-semibold text-teal-600 mb-1 mt-3'>Accommodation:</p>
                  <ul className='list-disc pl-4 space-y-1'>
                    <li>Accommodation Type</li>
                    <li>Hostel Type</li>
                    <li>Bus Required</li>
                    <li>Bus Route</li>
                    <li>Bus Pickup Location</li>
                    <li>Reference Type</li>
                    <li>Reference Name</li>
                    <li>Reference Contact</li>
                  </ul>
                </div>
              </div>
            </div>
            <p className='mt-3 text-green-600 font-medium'>
              💡 Use &quot;Download Template&quot; button to get the exact format with all available columns.
            </p>
            <p className='mt-1 text-green-600 text-xs'>
              ✅ All fields are optional - you can fill only the available information.
            </p>
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
