import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

const SAMPLE_DATA = [
  {
    name: 'JKKN College of Engineering',
    counselling_code: 'JKKN_ENG',
    institution_type: 'autonomous',
    category: 'ug_pg',
    accredited_by: 'NAAC',
    address_line1: '123 College Road',
    address_line2: 'Komarapalayam',
    address_line3: '',
    city: 'Namakkal',
    state: 'Tamil Nadu',
    country: 'India',
    pin_code: '638183',
    email: 'info@jkkn.edu.in',
    phone: '+919876543210',
    website: 'https://www.jkkn.edu.in',
    is_active: true
  }
];

const COLUMN_WIDTHS = {
  A: 40, // name
  B: 20, // counselling_code
  C: 15, // institution_type
  D: 10, // category
  E: 20, // accredited_by
  F: 30, // address_line1
  G: 30, // address_line2
  H: 30, // address_line3
  I: 20, // city
  J: 20, // state
  K: 20, // country
  L: 10, // pin_code
  M: 30, // email
  N: 15, // phone
  O: 30 // website
};

export default function DownloadTemplateButton() {
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
        C2: {
          // institution_type column
          type: 'list',
          operator: 'equal',
          formula1: '"self,autonomous,aided"',
          showErrorMessage: true,
          error: 'Invalid institution type',
          errorTitle: 'Invalid Input'
        },
        D2: {
          // category column
          type: 'list',
          operator: 'equal',
          formula1: '"ug,pg,ug_pg"',
          showErrorMessage: true,
          error: 'Invalid category',
          errorTitle: 'Invalid Input'
        }
      };

      // Add notes/comments to explain fields
      ws['A1'].c = [{ a: 'Author', t: 'Institution full name' }];
      ws['B1'].c = [
        {
          a: 'Author',
          t: 'Unique code (uppercase letters, numbers, underscores, hyphens only)'
        }
      ];
      ws['C1'].c = [
        { a: 'Author', t: 'Must be one of: self, autonomous, aided' }
      ];
      ws['D1'].c = [{ a: 'Author', t: 'Must be one of: ug, pg, ug_pg' }];
      ws['L1'].c = [{ a: 'Author', t: '6-digit PIN code' }];
      ws['M1'].c = [{ a: 'Author', t: 'Valid email address' }];
      ws['N1'].c = [
        {
          a: 'Author',
          t: 'Phone number with country code (e.g., +919876543210)'
        }
      ];

      // Add the worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `institution_upload_template_${timestamp}.xlsx`;

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
