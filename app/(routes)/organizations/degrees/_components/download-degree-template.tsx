import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

const SAMPLE_DATA = [
  {
    institution_code: 'JKKN_ENG',
    degree_id: 'BE_CSE',
    degree_name: 'Bachelor of Engineering in Computer Science',
    degree_type: 'ug'
  },
  {
    institution_code: 'JKKN_ENG',
    degree_id: 'ME_CSE',
    degree_name: 'Master of Engineering in Computer Science',
    degree_type: 'pg'
  }
];

const COLUMN_WIDTHS = {
  A: 20, // institution_code
  B: 15, // degree_id
  C: 40, // degree_name
  D: 12 // degree_type
};

export default function DownloadDegreeTemplateButton() {
  const handleDownload = () => {
    try {
      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(SAMPLE_DATA);

      // Set column widths
      ws['!cols'] = Object.entries(COLUMN_WIDTHS).map(([_, width]) => ({
        wch: width
      }));

      // Add validation rules
      ws['!datavalidation'] = {
        D2: {
          // degree_type column
          type: 'list',
          operator: 'equal',
          formula1: '"ug,pg"',
          showErrorMessage: true,
          error: 'Invalid degree type',
          errorTitle: 'Invalid Input'
        }
      };

      // Add notes/comments to explain fields
      ws['A1'].c = [
        { a: 'Author', t: 'Institution code from existing institutions' }
      ];
      ws['B1'].c = [
        {
          a: 'Author',
          t: 'Unique degree code (uppercase letters, numbers, underscores, hyphens only)'
        }
      ];
      ws['C1'].c = [{ a: 'Author', t: 'Full degree name' }];
      ws['D1'].c = [{ a: 'Author', t: 'Must be one of: ug, pg' }];

      // Add the worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `degree_upload_template_${timestamp}.xlsx`;

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
