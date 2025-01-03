import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

const SAMPLE_DATA = [
  {
    institution_code: 'JKKN_ENG',
    degree_code: 'BE_CSE',
    department_code: 'CSE',
    program_id: 'CSE_BE_REG',
    course_code: 'CS8601',
    semester_code: 'SEM_6',
    section_code: 'SEC_A',
    section_name: 'Section A'
  },
  {
    institution_code: 'JKKN_ENG',
    degree_code: 'BE_CSE',
    department_code: 'CSE',
    program_id: 'CSE_BE_REG',
    course_code: 'CS8601',
    semester_code: 'SEM_6',
    section_code: 'SEC_B',
    section_name: 'Section B'
  }
];

const COLUMN_WIDTHS = {
  A: 20, // institution_code
  B: 15, // degree_code
  C: 15, // department_code
  D: 20, // program_id
  E: 15, // course_code
  F: 15, // semester_code
  G: 15, // section_code
  H: 30 // section_name
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
  ['   - Must match a program that exists in the specified department'],
  ['   - Example: CSE_BE_REG'],
  [''],
  ['5. Course Code:'],
  ['   - Must match a course that exists in the specified program'],
  ['   - Example: CS8601'],
  [''],
  ['6. Semester Code:'],
  ['   - Must match a semester that exists in the specified course'],
  ['   - Example: SEM_6'],
  [''],
  ['7. Section Code:'],
  ['   - Must be unique within the semester'],
  ['   - Use only uppercase letters, numbers, underscores, and hyphens'],
  ['   - Example: SEC_A'],
  [''],
  ['8. Section Name:'],
  ['   - Descriptive name for the section'],
  ['   - Example: Section A'],
  [''],
  ['Note:'],
  ['- All fields are required'],
  ['- The relationships between all entities must be valid:'],
  [
    '  * Institution → Degree → Department → Program → Course → Semester → Section'
  ],
  ['- All referenced entities must exist and be active'],
  [''],
  ['Validation Process:'],
  ['1. Institution code is checked against active institutions'],
  ['2. Degree code is verified for the specified institution'],
  ['3. Department code is verified for the specified degree'],
  ['4. Program ID is verified for the specified department'],
  ['5. Course code is verified for the specified program'],
  ['6. Semester code is verified for the specified course'],
  ['7. Section code format and uniqueness are verified']
];

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
          t: 'Program ID from existing programs in the department'
        }
      ];
      ws['E1'].c = [
        { a: 'Author', t: 'Course code from existing courses in the program' }
      ];
      ws['F1'].c = [
        {
          a: 'Author',
          t: 'Semester code from existing semesters in the course'
        }
      ];
      ws['G1'].c = [
        {
          a: 'Author',
          t: 'Unique section code (uppercase letters, numbers, underscores, hyphens only)'
        }
      ];
      ws['H1'].c = [{ a: 'Author', t: 'Descriptive name for the section' }];

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
      instructionsWs['!cols'] = [{ wch: 100 }];

      // Add sheets to workbook
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

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
