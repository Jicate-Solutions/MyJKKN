import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

const SAMPLE_DATA = [
  {
    category_name: 'Teaching Staff',
    description: 'Faculty members involved in teaching'
  },
  {
    category_name: 'Non-Teaching Staff',
    description: 'Administrative and support staff members'
  }
];

const COLUMN_WIDTHS = {
  A: 30, // category_name
  B: 50 // description
};

const INSTRUCTIONS = [
  ['Instructions for filling the template:'],
  [''],
  ['1. Category Name:'],
  ['   - Required field'],
  ['   - Must be unique'],
  ['   - Must be at least 2 characters long'],
  ['   - Example: Teaching Staff, Administrative Staff'],
  [''],
  ['2. Description:'],
  ['   - Optional field'],
  ['   - Additional details about the category'],
  ['   - Example: Staff members involved in academic activities'],
  [''],
  ['Note:'],
  ['- All categories will be created as active by default'],
  ['- Category names must be unique across the system'],
  ['- Descriptions help in understanding the purpose of each category'],
  [''],
  ['Validation Process:'],
  ['1. Category name uniqueness is verified'],
  ['2. Category name length is checked'],
  ['3. Basic format validation is performed']
];

export default function DownloadCategoryTemplateButton() {
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
        { a: 'Author', t: 'Required: Unique name for the category' }
      ];
      ws['B1'].c = [
        { a: 'Author', t: 'Optional: Description of the category' }
      ];

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
      const fileName = `staff_category_template_${timestamp}.xlsx`;

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
