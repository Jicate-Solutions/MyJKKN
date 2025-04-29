'use client';

import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

// Define the structure and sample data for the template
const SAMPLE_DATA = [
  {
    student_id: 'uuid-of-student-1', // Replace with actual example if available
    college_email: 'student1@example.com',
    roll_number: 'ENG1001',
    // Add other optional updatable fields here if needed
  },
  {
    student_id: 'uuid-of-student-2',
    college_email: 'student2@example.com',
    roll_number: 'SCI2002',
  }
];

// Define column headers and their desired order
const HEADERS = [
  'student_id',
  'college_email',
  'roll_number',
];

// Optional: Define specific column widths
const COLUMN_WIDTHS = {
  A: 40, // student_id
  B: 30, // college_email
  C: 20, // roll_number
};

export function DownloadStudentTemplateButton() {
  const handleDownload = () => {
    try {
      // Create worksheet
      // Map sample data to match header order
      const dataForSheet = SAMPLE_DATA.map(row => 
         HEADERS.map(header => row[header as keyof typeof row] ?? '')
      );
      // Prepend headers
      dataForSheet.unshift(HEADERS); 

      const ws = XLSX.utils.aoa_to_sheet(dataForSheet);

      // Set column widths if defined
      ws['!cols'] = HEADERS.map((_, index) => {
          const colLetter = String.fromCharCode(65 + index); // A, B, C...
          return { wch: COLUMN_WIDTHS[colLetter as keyof typeof COLUMN_WIDTHS] || 20 }; // Default width 20
      });

      // Add notes/comments for guidance
      ws['A1'].c = [{ a: 'Guide', t: 'Required: The unique UUID of the student.' }];
      ws['B1'].c = [{ a: 'Guide', t: 'Required: The official college email address.' }];
      ws['C1'].c = [{ a: 'Guide', t: 'Required: The student\'s roll number.' }];
      // Add comments for other headers if you include more fields

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Student Update Template');

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `student_promotion_template_${timestamp}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, fileName);

    } catch (error) {
      console.error('Error creating student template:', error);
      // Consider adding a user-facing error message (e.g., using toast)
    }
  };

  return (
    <Button
      variant='outline'
      onClick={handleDownload}
      className='w-full sm:w-auto'
    >
      <FileDown className='mr-2 h-4 w-4' />
      Download Template
    </Button>
  );
} 