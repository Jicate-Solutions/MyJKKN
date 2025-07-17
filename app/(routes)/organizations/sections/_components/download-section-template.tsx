import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

const SAMPLE_DATA = [
  {
    institution_name: 'JKKN College of Engineering and Technology',
    degree_name: 'Postgraduate',
    department_name: 'Master of Business Administration',
    program_name: 'MBA',
    semester_name: 'Semester 1',
    section_name: 'Section A',
    is_active: 'Yes'
  },
  {
    institution_name: 'JKKN College of Engineering and Technology',
    degree_name: 'Postgraduate',
    department_name: 'Master of Business Administration',
    program_name: 'MBA',
    semester_name: 'Semester 1',
    section_name: 'Section B',
    is_active: 'Yes'
  },
  {
    institution_name: 'JKKN College of Engineering and Technology',
    degree_name: 'Undergraduate',
    department_name: 'Computer Science and Engineering',
    program_name: 'B.Tech CSE',
    semester_name: 'Semester 1',
    section_name: 'Section A',
    is_active: 'Yes'
  }
];

const COLUMN_WIDTHS = {
  A: 40, // institution_name
  B: 25, // degree_name
  C: 35, // department_name
  D: 25, // program_name
  E: 20, // semester_name
  F: 20, // section_name
  G: 15 // is_active
};

export default function DownloadSectionTemplateButton() {
  const handleDownload = () => {
    try {
      // Create workbook
      const wb = XLSX.utils.book_new();

      // Create main template sheet
      const ws = XLSX.utils.json_to_sheet(SAMPLE_DATA);

      // Set column widths
      ws['!cols'] = Object.entries(COLUMN_WIDTHS).map(([_, width]) => ({
        wch: width
      }));

      // Add to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Section Template');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `section_upload_template_${timestamp}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('Error creating template:', error);
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
