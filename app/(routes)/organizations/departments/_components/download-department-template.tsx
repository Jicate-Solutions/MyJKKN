import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

const SAMPLE_DATA = [
  {
    institution_code: 'JKKN_ENG',
    degree_code: 'BE_CSE',
    department_code: 'CSE',
    department_name: 'Computer Science and Engineering'
  },
  {
    institution_code: 'JKKN_ENG',
    degree_code: 'BE_ECE',
    department_code: 'ECE',
    department_name: 'Electronics and Communication Engineering'
  }
];

const COLUMN_WIDTHS = {
  A: 20, // institution_code
  B: 15, // degree_code
  C: 15, // department_code
  D: 40 // department_name
};

export default function DownloadDepartmentTemplateButton() {
  const handleDownload = () => {
    try {
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(SAMPLE_DATA);

      // Set column widths
      ws['!cols'] = Object.entries(COLUMN_WIDTHS).map(([_, width]) => ({
        wch: width
      }));

      // Add notes/comments to explain fields
      ws['A1'].c = [
        { a: 'Author', t: 'Institution code from existing institutions' }
      ];
      ws['B1'].c = [
        {
          a: 'Author',
          t: 'Degree code from existing degrees in the institution'
        }
      ];
      ws['C1'].c = [
        {
          a: 'Author',
          t: 'Unique department code (uppercase letters, numbers, underscores, hyphens only)'
        }
      ];
      ws['D1'].c = [{ a: 'Author', t: 'Full department name' }];

      // Add sheet protection to prevent modification of validation rules
      ws['!protect'] = {
        password: '',
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        insertHyperlinks: false,
        deleteColumns: false,
        deleteRows: false,
        sort: false,
        autoFilter: false,
        pivotTables: false
      };

      // Add the worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `department_upload_template_${timestamp}.xlsx`;

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
