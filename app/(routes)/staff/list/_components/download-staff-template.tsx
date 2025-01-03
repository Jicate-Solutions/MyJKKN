'use client';

import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { CategoryService } from '@/lib/services/staff/category-service';
import { useEffect, useState } from 'react';

const SAMPLE_DATA = [
  {
    first_name: 'John',
    last_name: 'Doe',
    gender: 'male',
    date_of_birth: '1990-01-01',
    marital_status: 'single',
    blood_group: 'O+',
    email: 'john.doe@example.com',
    phone: '1234567890',
    staff_id: 'STAFF001',
    address: '123 Main St',
    state: 'Karnataka',
    district: 'Bangalore',
    pincode: '560001',
    date_of_joining: '2024-01-01',
    designation: 'Assistant Professor',
    category_name: 'Teaching Staff',
    institution_name: 'Sample Institution', // Add this
    department_name: 'Computer Science' // Add this
  }
];

const COLUMN_WIDTHS = {
  A: 20, // first_name
  B: 20, // last_name
  C: 15, // gender
  D: 15, // date_of_birth
  E: 15, // marital_status
  F: 15, // blood_group
  G: 30, // email
  H: 15, // phone
  I: 15, // staff_id
  J: 30, // address
  K: 20, // state
  L: 20, // district
  M: 10, // pincode
  N: 15, // date_of_joining
  O: 25, // designation
  P: 25 // category_name
};

const INSTRUCTIONS = [
  ['Instructions for filling the template:'],
  [''],
  ['Required Fields:'],
  ['1. First Name (Required)'],
  ['2. Last Name (Required)'],
  ['3. Gender (Required) - Values: male, female, bigender'],
  ['4. Date of Birth (Required) - Format: YYYY-MM-DD'],
  ['5. Email (Required)'],
  ['6. Phone (Required)'],
  ['7. Date of Joining (Required) - Format: YYYY-MM-DD'],
  ['8. Designation (Required)'],
  ['9. Category Name (Required) - Must match existing category'],
  [''],
  ['Optional Fields:'],
  ['1. Staff ID'],
  ['2. Marital Status - Values: single, married, divorced, widow'],
  ['3. Blood Group - Values: A+, A-, B+, B-, AB+, AB-, O+, O-'],
  ['4. Address'],
  ['5. State'],
  ['6. District'],
  ['7. Pincode'],
  [''],
  ['Validation Rules:'],
  ['- Email must be unique'],
  ['- Staff ID must be unique (if provided)'],
  ['- Phone number must be valid'],
  ['- Dates must be in YYYY-MM-DD format'],
  ['- Category name must match an existing category'],
  [''],
  ['Notes:'],
  ['- All staff members will be created as active by default'],
  ['- Each row will be validated before import'],
  ['- Invalid rows will be skipped during import']
];

export default function DownloadStaffTemplateButton() {
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    async function loadCategories() {
      try {
        const { data } = await CategoryService.getCategories({
          isActive: true,
          limit: 100
        });
        setCategories(data.map((cat) => cat.category_name));
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    }
    loadCategories();
  }, []);

  const handleDownload = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Create main template sheet
      const ws = XLSX.utils.json_to_sheet(SAMPLE_DATA);

      // Set column widths
      ws['!cols'] = Object.entries(COLUMN_WIDTHS).map(([_, width]) => ({
        wch: width
      }));

      // Create instructions sheet
      const instructionsWs = XLSX.utils.aoa_to_sheet([
        ...INSTRUCTIONS,
        [''],
        ['Available Categories:'],
        ...categories.map((cat) => [`- ${cat}`])
      ]);

      // Set column width for instructions
      instructionsWs['!cols'] = [{ wch: 100 }];

      // Add data validation for specific columns
      const validations: any = {
        C: {
          // Gender
          type: 'list',
          operator: 'equal',
          formula1: '"male,female,bigender"'
        },
        E: {
          // Marital Status
          type: 'list',
          operator: 'equal',
          formula1: '"single,married,divorced,widow"'
        },
        F: {
          // Blood Group
          type: 'list',
          operator: 'equal',
          formula1: '"A+,A-,B+,B-,AB+,AB-,O+,O-"'
        }
      };

      ws['!dataValidation'] = validations;

      // Add sheets to workbook
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `staff_template_${timestamp}.xlsx`;

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
