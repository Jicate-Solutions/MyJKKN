import { useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';

export default function DownloadTemplateButton() {
  const [downloading, setDownloading] = useState(false);

  const generateExcelTemplate = () => {
    // Create two worksheets - Instructions and Template
    const instructionsData = [
      {
        'REQUIRED FIELDS': 'The following fields are mandatory and must be filled:',
        'FIELD NAME': '',
        'INSTRUCTIONS': ''
      },
      {
        'REQUIRED FIELDS': 'Personal Information',
        'FIELD NAME': 'First Name',
        'INSTRUCTIONS': 'Student\'s first name'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Father Name',
        'INSTRUCTIONS': 'Father\'s full name'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Mother Name',
        'INSTRUCTIONS': 'Mother\'s full name'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Date of Birth',
        'INSTRUCTIONS': 'Format: YYYY-MM-DD (e.g., 2000-01-15)'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Gender',
        'INSTRUCTIONS': 'MALE, FEMALE, or OTHER'
      },
      {
        'REQUIRED FIELDS': 'Contact Information',
        'FIELD NAME': 'Student Mobile',
        'INSTRUCTIONS': '10-digit mobile number'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Student Email',
        'INSTRUCTIONS': 'Valid email address'
      },
      {
        'REQUIRED FIELDS': 'Address Information',
        'FIELD NAME': 'Permanent Address Street',
        'INSTRUCTIONS': 'Street address'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Permanent Address District',
        'INSTRUCTIONS': 'District name'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Permanent Address Pin Code',
        'INSTRUCTIONS': '6-digit pin code'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Permanent Address State',
        'INSTRUCTIONS': 'State name'
      },
      {
        'REQUIRED FIELDS': 'Course Selection',
        'FIELD NAME': 'Institution',
        'INSTRUCTIONS': 'Use exact institution name as it appears in admin panel'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Program',
        'INSTRUCTIONS': 'Use exact program name as it appears in admin panel'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Entry Type',
        'INSTRUCTIONS': 'FIRST YEAR or LATERAL ENTRY'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Accommodation Type',
        'INSTRUCTIONS': 'DAY SCHOLAR or HOSTEL'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': '',
        'INSTRUCTIONS': ''
      },
      {
        'REQUIRED FIELDS': 'HOW TO GET REQUIRED NAMES:',
        'FIELD NAME': '',
        'INSTRUCTIONS': ''
      },
      {
        'REQUIRED FIELDS': '1. Institution Name',
        'FIELD NAME': 'Go to Admin > Institutions',
        'INSTRUCTIONS': 'Copy the exact name from the institution list'
      },
      {
        'REQUIRED FIELDS': '2. Program Name',
        'FIELD NAME': 'Go to Admin > Programs',
        'INSTRUCTIONS': 'Copy the exact program name from the program list'
      },
      {
        'REQUIRED FIELDS': '3. Degree/Department Names',
        'FIELD NAME': 'Go to Admin > Degrees/Departments',
        'INSTRUCTIONS': 'Copy the exact names (optional fields)'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': '',
        'INSTRUCTIONS': ''
      },
      {
        'REQUIRED FIELDS': 'OPTIONAL FIELDS (Academic Information):',
        'FIELD NAME': '',
        'INSTRUCTIONS': ''
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Last School',
        'INSTRUCTIONS': 'Name of last attended school (optional)'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': 'Board of Study',
        'INSTRUCTIONS': 'Board name (e.g., CBSE, State Board) - optional'
      },
      {
        'REQUIRED FIELDS': '',
        'FIELD NAME': '',
        'INSTRUCTIONS': ''
      },
      {
        'REQUIRED FIELDS': 'IMPORTANT NOTES:',
        'FIELD NAME': '',
        'INSTRUCTIONS': ''
      },
      {
        'REQUIRED FIELDS': '• Required fields marked with *',
        'FIELD NAME': '• Use exact names as shown in admin',
        'INSTRUCTIONS': '• Double-check spelling before upload'
      }
    ];

    const templateData = [{
      '* First Name': 'John',
      'Last Name': 'Doe',
      '* Father Name': 'John Father',
      'Father Occupation': 'Engineer',
      'Father Mobile': '9876543210',
      '* Mother Name': 'John Mother',
      'Mother Occupation': 'Teacher',
      'Mother Mobile': '9876543211',
      '* Date of Birth': '2000-01-15',
      '* Gender': 'MALE',
      'Religion': 'Hindu',
      'Community': 'General',
      'Caste': 'General',
      'Annual Income': '500000',
      'Last School': 'ABC Higher Secondary School',
      'Board of Study': 'State Board',
      '10th Max Marks': '500',
      '10th Obtained Marks': '450',
      '10th Percentage': '90',
      '12th Group': 'Science',
      '12th Max Marks': '600',
      '12th Obtained Marks': '540',
      '12th Percentage': '90',
      'NEET Roll Number': '',
      'Medical Cutoff Marks': '',
      'Engineering Cutoff Marks': '180',
      'Counseling Applied': 'TRUE',
      'Counseling Number': 'CNR001',
      'First Graduate': 'FALSE',
      'Quota': 'GOVERNMENT',
      'Category': 'GENERAL',
      '* Institution': 'JKKN College of Engineering and Technology',
      'Degree': 'Bachelor of Engineering',
      'Department': 'Computer Science and Engineering',
      '* Program': 'B.E Computer Science and Engineering',
      '* Entry Type': 'FIRST YEAR',
      '* Permanent Address Street': '123 Main Street',
      'Permanent Address Taluk': 'City Taluk',
      '* Permanent Address District': 'Sample District',
      '* Permanent Address Pin Code': '123456',
      '* Permanent Address State': 'Sample State',
      '* Student Mobile': '9876543212',
      '* Student Email': 'john.doe@email.com',
      '* Accommodation Type': 'DAY SCHOLAR',
      'Hostel Type': '',
      'Bus Required': 'FALSE',
      'Bus Route': '',
      'Bus Pickup Location': '',
      'Reference Type': 'Friend',
      'Reference Name': 'Reference Person',
      'Reference Contact': '9876543213'
    }];

    return { instructionsData, templateData };
  };

  const handleDownload = () => {
    try {
      setDownloading(true);

      // Generate the Excel template data
      const { instructionsData, templateData } = generateExcelTemplate();

      // Create Excel workbook with two worksheets
      const wb = XLSX.utils.book_new();

      // Add Instructions worksheet
      const instructionsWs = XLSX.utils.json_to_sheet(instructionsData);
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

      // Add Template worksheet
      const templateWs = XLSX.utils.json_to_sheet(templateData);
      XLSX.utils.book_append_sheet(wb, templateWs, 'Template');

      // Download the file
      XLSX.writeFile(wb, 'admission-template-with-instructions.xlsx');

      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Failed to download template');
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
