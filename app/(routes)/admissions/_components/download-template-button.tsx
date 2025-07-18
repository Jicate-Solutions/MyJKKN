import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export default function DownloadTemplateButton() {
  const { toast } = useToast();
  const [downloading, setDownloading] = useState(false);

  const generateCSV = () => {
    // Define headers based on the required fields for an admission
    const headers = [
      'First Name',
      'Last Name',
      'Father Name',
      'Father Occupation',
      'Father Mobile',
      'Mother Name',
      'Mother Occupation',
      'Mother Mobile',
      'Date of Birth (YYYY-MM-DD)',
      'Gender',
      'Religion',
      'Community',
      'Caste',
      'Annual Income',
      'Last School',
      'Board of Study',
      '10th Max Marks',
      '10th Obtained Marks',
      '12th Group',
      '12th Max Marks',
      '12th Obtained Marks',
      '12th Subject 1 Name',
      '12th Subject 1 Marks',
      '12th Subject 2 Name',
      '12th Subject 2 Marks',
      '12th Subject 3 Name',
      '12th Subject 3 Marks',
      '12th Subject 4 Name',
      '12th Subject 4 Marks',
      'NEET Roll Number',
      'Counseling Applied',
      'Counseling Number',
      'First Graduate',
      'Field of Study',
      'Course Type',
      'Entry Type',
      'Year and Branch',
      'Permanent Address Street',
      'Permanent Address Taluk',
      'Permanent Address District',
      'Permanent Address Pin Code',
      'Permanent Address State',
      'Student Mobile',
      'Student Email',
      'Accommodation Type',
      'Hostel Type',
      'Bus Required',
      'Bus Route',
      'Bus Pickup Location',
      'Reference Type',
      'Reference Name',
      'Reference Contact'
    ];

    // Create a CSV string with the headers
    let csvContent = headers.join(',') + '\n';

    // Add a single empty row as an example
    csvContent += Array(headers.length).fill('').join(',');

    return csvContent;
  };

  const handleDownload = () => {
    try {
      setDownloading(true);

      // Generate the CSV content
      const csvContent = generateCSV();

      // Create a Blob from the CSV content
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

      // Create a temporary URL for the Blob
      const url = URL.createObjectURL(blob);

      // Create a link element and trigger the download
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'admission_template.csv');
      document.body.appendChild(link);
      link.click();

      // Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: 'Download complete',
        description: 'Admission template has been downloaded successfully.'
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Download failed',
        description:
          error instanceof Error ? error.message : 'Failed to download template'
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button variant='outline' onClick={handleDownload} disabled={downloading}>
      <Download className='mr-2 h-4 w-4' />
      {downloading ? 'Downloading...' : 'Download Template'}
    </Button>
  );
}
