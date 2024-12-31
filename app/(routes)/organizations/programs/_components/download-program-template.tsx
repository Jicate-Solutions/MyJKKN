import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

const SAMPLE_DATA = [
  {
    institution_code: 'JKKN_ENG',
    degree_code: 'BE_CSE',
    department_code: 'CSE',
    program_id: 'CSE_BE_REG',
    program_name: 'B.E Computer Science and Engineering (Regular)'
  },
  {
    institution_code: 'JKKN_ENG',
    degree_code: 'ME_CSE',
    department_code: 'CSE',
    program_id: 'CSE_ME_REG',
    program_name: 'M.E Computer Science and Engineering (Regular)'
  }
];

const COLUMN_WIDTHS = {
  A: 20, // institution_code
  B: 15, // degree_code
  C: 15, // department_code
  D: 20, // program_id
  E: 50 // program_name
};

const INSTRUCTIONS = [
  ['Instructions for filling the template:'],
  [''],
  ['1. Institution Code:'],
  ['   - Must match an existing institution code'],
  ['   - Example: JKKN_ENG'],
  [''],
  ['2. Degree Code:'],
  ['   - Must match a degree that exists in the specified institution'],
  ['   - Example: BE_CSE, ME_CSE'],
  [''],
  ['3. Department Code:'],
  ['   - Must match a department that exists in the specified degree'],
  ['   - Example: CSE, ECE'],
  [''],
  ['4. Program ID:'],
  ['   - Must be unique'],
  ['   - Use only uppercase letters, numbers, underscores, and hyphens'],
  ['   - Example: CSE_BE_REG'],
  [''],
  ['5. Program Name:'],
  ['   - Full name of the program'],
  ['   - Example: B.E Computer Science and Engineering (Regular)'],
  [''],
  ['Note:'],
  ['- All fields are required'],
  [
    '- The relationships between institution, degree, and department must be valid'
  ],
  ['- Institution must exist and be active'],
  ['- Degree must exist in the specified institution and be active'],
  ['- Department must exist in the specified degree and be active']
];

export default function DownloadProgramTemplateButton() {
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
          t: 'Department code from existing departments in the degree'
        }
      ];
      ws['D1'].c = [
        {
          a: 'Author',
          t: 'Unique program ID (uppercase letters, numbers, underscores, hyphens only)'
        }
      ];
      ws['E1'].c = [{ a: 'Author', t: 'Full program name' }];

      // Add sheet protection
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

      // Create instructions sheet
      const instructionsWs = XLSX.utils.aoa_to_sheet(INSTRUCTIONS);

      // Set column width for instructions
      instructionsWs['!cols'] = [{ wch: 80 }];

      // Add sheets to workbook
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `program_upload_template_${timestamp}.xlsx`;

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
