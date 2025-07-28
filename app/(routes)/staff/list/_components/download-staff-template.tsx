'use client';

import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { CategoryService } from '@/lib/services/staff/category-service';
import { useEffect, useState } from 'react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDepartments } from '@/hooks/organization/use-departments';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { toast } from 'react-hot-toast';

// ID-based sample data (with UUIDs that need to be replaced with real IDs)
const ID_BASED_SAMPLE_DATA = [
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
    profile_picture: '',
    address: '123 Main St',
    state: 'Karnataka',
    district: 'Bangalore',
    pincode: '560001',
    date_of_joining: '2024-01-01',
    designation: 'Assistant Professor',
    institution_email: 'john.doe@institution.edu',
    category_id: '[Enter Category ID]',
    institution_id: '[Enter Institution ID]',
    department_id: '[Enter Department ID]',
    is_active: 'true'
  }
];

// Name-based sample data (with names that need to be exact matches)
const NAME_BASED_SAMPLE_DATA = [
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
    profile_picture: '',
    address: '123 Main St',
    state: 'Karnataka',
    district: 'Bangalore',
    pincode: '560001',
    date_of_joining: '2024-01-01',
    designation: 'Assistant Professor',
    institution_email: 'john.doe@institution.edu',
    category_name: '[Enter exact Category Name]',
    institution_name: '[Enter exact Institution Name]',
    department_name: '[Enter exact Department Name]',
    is_active: 'true'
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
  J: 30, // profile_picture
  K: 30, // address
  L: 20, // state
  M: 20, // district
  N: 10, // pincode
  O: 15, // date_of_joining
  P: 25, // designation
  Q: 30, // institution_email
  R: 40, // category_id or category_name
  S: 40, // institution_id or institution_name
  T: 40, // department_id or department_name
  U: 10 // is_active
};

const ID_BASED_INSTRUCTIONS = [
  ['Instructions for ID-BASED Template:'],
  [''],
  ['Required Fields:'],
  ['1. First Name (Required)'],
  ['2. Last Name (Required)'],
  ['3. Gender (Required) - Values: male, female, bigender'],
  ['4. Date of Birth (Required) - Multiple formats accepted:'],
  ['   • YYYY-MM-DD (e.g., 1990-01-01) - Preferred'],
  ['   • DD/MM/YYYY (e.g., 01/01/1990)'],
  ['   • DD-MM-YYYY (e.g., 01-01-1990)'],
  ['   • MM/DD/YYYY (e.g., 01/01/1990)'],
  ['   • MM-DD-YYYY (e.g., 01-01-1990)'],
  ['   • DD.MM.YYYY (e.g., 01.01.1990)'],
  ['   • YYYY/MM/DD (e.g., 1990/01/01)'],
  ['5. Email (Required)'],
  ['6. Phone (Required) - Format: 10 digits'],
  ['7. Date of Joining (Required) - Same formats as Date of Birth'],
  ['8. Designation (Required)'],
  ['9. Category ID (Required) - Must be a valid UUID from the list below'],
  ['10. Institution ID (Required) - Must be a valid UUID from the list below'],
  ['11. Department ID (Required) - Must be a valid UUID from the list below'],
  [''],
  ['Optional Fields:'],
  ['1. Staff ID - Must be unique if provided'],
  ['2. Profile Picture - URL to profile image (leave empty if none)'],
  ['3. Marital Status - Values: single, married, divorced, widow'],
  ['4. Blood Group - Values: A+, A-, B+, B-, AB+, AB-, O+, O-'],
  ['5. Address'],
  ['6. State'],
  ['7. District'],
  ['8. Pincode'],
  ['9. Institution Email - Email address provided by the institution'],
  ['10. Is Active - Values: true, false (default is true)'],
  [''],
  ['Date Format Notes:'],
  ['- Multiple date formats are accepted and automatically converted'],
  ['- Year must be between 1900 and current year + 1'],
  ['- Date validation ensures the date actually exists (no Feb 30th, etc.)'],
  ['- If you get date errors, try using YYYY-MM-DD format'],
  [''],
  ['Important Notes:'],
  [
    '- The IDs (category_id, institution_id, department_id) must be exact UUIDs from the database'
  ],
  ['- COPY THE IDs exactly from the lists below'],
  ['- Email must be unique'],
  ['- Staff ID must be unique (if provided)'],
  ['- Each row will be validated before import'],
  ['- Invalid rows will be skipped during import']
];

const NAME_BASED_INSTRUCTIONS = [
  ['Instructions for NAME-BASED Template:'],
  [''],
  ['Required Fields:'],
  ['1. First Name (Required)'],
  ['2. Last Name (Required)'],
  ['3. Gender (Required) - Values: male, female, bigender'],
  ['4. Date of Birth (Required) - Multiple formats accepted:'],
  ['   • YYYY-MM-DD (e.g., 1990-01-01) - Preferred'],
  ['   • DD/MM/YYYY (e.g., 01/01/1990)'],
  ['   • DD-MM-YYYY (e.g., 01-01-1990)'],
  ['   • MM/DD/YYYY (e.g., 01/01/1990)'],
  ['   • MM-DD-YYYY (e.g., 01-01-1990)'],
  ['   • DD.MM.YYYY (e.g., 01.01.1990)'],
  ['   • YYYY/MM/DD (e.g., 1990/01/01)'],
  ['5. Email (Required)'],
  ['6. Phone (Required) - Format: 10 digits'],
  ['7. Date of Joining (Required) - Same formats as Date of Birth'],
  ['8. Designation (Required)'],
  [
    '9. Category Name (Required) - Must match exactly a category name from the list below'
  ],
  [
    '10. Institution Name (Required) - Must match exactly an institution name from the list below'
  ],
  [
    '11. Department Name (Required) - Must match exactly a department name from the list below'
  ],
  [''],
  ['Optional Fields:'],
  ['1. Staff ID - Must be unique if provided'],
  ['2. Profile Picture - URL to profile image (leave empty if none)'],
  ['3. Marital Status - Values: single, married, divorced, widow'],
  ['4. Blood Group - Values: A+, A-, B+, B-, AB+, AB-, O+, O-'],
  ['5. Address'],
  ['6. State'],
  ['7. District'],
  ['8. Pincode'],
  ['9. Institution Email - Email address provided by the institution'],
  ['10. Is Active - Values: true, false (default is true)'],
  [''],
  ['Date Format Notes:'],
  ['- Multiple date formats are accepted and automatically converted'],
  ['- Year must be between 1900 and current year + 1'],
  ['- Date validation ensures the date actually exists (no Feb 30th, etc.)'],
  ['- If you get date errors, try using YYYY-MM-DD format'],
  [''],
  ['Important Notes:'],
  [
    '- The names (category_name, institution_name, department_name) must match EXACTLY what is in the database'
  ],
  ['- COPY THE NAMES exactly from the lists below'],
  ['- Department names must belong to the specified institution'],
  ['- Email must be unique'],
  ['- Staff ID must be unique (if provided)'],
  ['- Each row will be validated before import'],
  ['- Invalid rows will be skipped during import']
];

export default function DownloadStaffTemplateButton() {
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const { institutions } = useInstitutionsWithAccess({});
  const { data: departmentsData } = useDepartments({ limit: 100 });
  const departments = departmentsData?.data || [];

  useEffect(() => {
    async function loadCategories() {
      try {
        const { data } = await CategoryService.getCategories({
          isActive: true,
          limit: 100
        });
        setCategories(
          data.map((cat) => ({ id: cat.id, name: cat.category_name }))
        );
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    }
    loadCategories();
  }, []);

  // Create the correct array for the example worksheet
  const createExampleData = (templateType: 'id' | 'name') => {
    const exampleData = [
      ['Field', 'Example Format', 'Notes'],
      ['first_name', 'John', 'Text only'],
      ['last_name', 'Doe', 'Text only'],
      ['gender', 'male', 'One of: male, female, bigender'],
      ['date_of_birth', '1990-01-01', 'YYYY-MM-DD (preferred)'],
      ['', '01/01/1990', 'DD/MM/YYYY also supported'],
      ['', '01-01-1990', 'DD-MM-YYYY also supported'],
      ['', '01.01.1990', 'DD.MM.YYYY also supported'],
      ['marital_status', 'single', 'One of: single, married, divorced, widow'],
      [
        'blood_group',
        'O+',
        'One of: A+, A-, B+, B-, AB+, AB-, O+, O-, A1+, A1B'
      ],
      ['email', 'john.doe@example.com', 'Must be unique'],
      ['phone', '9876543210', '10 digits'],
      ['staff_id', 'STAFF001', 'Must be unique'],
      ['profile_picture', '', 'URL or leave empty'],
      ['address', '123 Main St, Apt 4B', 'Text'],
      ['state', 'Tamil Nadu', 'Text'],
      ['district', 'Chennai', 'Text'],
      ['pincode', '600001', 'Numbers only'],
      ['date_of_joining', '2023-05-15', 'YYYY-MM-DD (preferred)'],
      ['', '15/05/2023', 'DD/MM/YYYY also supported'],
      ['', '15-05-2023', 'DD-MM-YYYY also supported'],
      ['designation', 'Assistant Professor', 'Text'],
      ['institution_email', 'john.doe@institution.edu', 'Email format']
    ];

    // Add specific fields based on template type
    if (templateType === 'id') {
      exampleData.push([
        'category_id',
        'd53a05b9-8375-49e3-aae5-e6452884cdef',
        'Must be exact UUID'
      ]);
      exampleData.push([
        'institution_id',
        '9c1554e8-12a2-4b76-a9d6-8242bb05eba1',
        'Must be exact UUID'
      ]);
      exampleData.push([
        'department_id',
        '7646521a-a252-4756-bd8f-ba7c1d36ff56',
        'Must be exact UUID'
      ]);
    } else {
      exampleData.push([
        'category_name',
        'Teaching Staff',
        'Must match exactly'
      ]);
      exampleData.push([
        'institution_name',
        'JKKN DENTAL COLLEGE & HOSPITAL',
        'Must match exactly'
      ]);
      exampleData.push([
        'department_name',
        'Computer Science',
        'Must match exactly and belong to institution'
      ]);
    }

    exampleData.push(['is_active', 'true', 'true or false']);

    return exampleData;
  };

  const handleDownload = (templateType: 'id' | 'name') => {
    try {
      const wb = XLSX.utils.book_new();

      // Choose template data based on type
      const sampleData =
        templateType === 'id' ? ID_BASED_SAMPLE_DATA : NAME_BASED_SAMPLE_DATA;

      // Choose instructions based on type
      const instructions =
        templateType === 'id' ? ID_BASED_INSTRUCTIONS : NAME_BASED_INSTRUCTIONS;

      // Create main template sheet
      const ws = XLSX.utils.json_to_sheet(sampleData);

      // Set column widths
      ws['!cols'] = Object.entries(COLUMN_WIDTHS).map(([_, width]) => ({
        wch: width
      }));

      // Create instructions sheet
      const instructionsWs = XLSX.utils.aoa_to_sheet([
        ...instructions,
        [''],
        ['Available Categories:'],
        ['ID', 'Name'],
        ...categories.map((cat) => [cat.id, cat.name]),
        [''],
        ['Available Institutions:'],
        ['ID', 'Name'],
        ...institutions.map((inst: any) => [inst.id, inst.name]),
        [''],
        ['Available Departments:'],
        ['ID', 'Institution ID', 'Name'],
        ...departments.map((dept: any) => [
          dept.id,
          dept.institution_id,
          dept.department_name
        ])
      ]);

      // Set column width for instructions
      instructionsWs['!cols'] = [{ wch: 40 }, { wch: 40 }, { wch: 40 }];

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
          formula1: '"A+,A-,B+,B-,AB+,AB-,O+,O-,A1+,A1B"'
        },
        U: {
          // Is Active
          type: 'list',
          operator: 'equal',
          formula1: '"true,false"'
        }
      };

      ws['!dataValidation'] = validations;

      // Create example formats sheet with all fields included
      const exampleData = createExampleData(templateType);
      const exampleWs = XLSX.utils.aoa_to_sheet(exampleData);

      // Set column width for examples
      exampleWs['!cols'] = [{ wch: 20 }, { wch: 40 }, { wch: 40 }];

      // Add sheets to workbook in the desired order
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');
      XLSX.utils.book_append_sheet(wb, exampleWs, 'Format Examples');
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

      // Create filled example data for the filled example sheet
      const filledExampleData = [
        ['Example of Filled Data'],
        [''],
        ['Here is a fully filled example row:'],
        ['']
      ];

      const filledExampleWs = XLSX.utils.aoa_to_sheet(filledExampleData);

      // Add filled example based on template type
      if (templateType === 'id') {
        if (
          categories.length > 0 &&
          institutions.length > 0 &&
          departments.length > 0
        ) {
          const exampleData = [
            {
              ...ID_BASED_SAMPLE_DATA[0],
              category_id: categories[0].id,
              institution_id: institutions[0].id,
              department_id:
                departments.find(
                  (d: any) => d.institution_id === institutions[0].id
                )?.id || departments[0].id
            }
          ];
          XLSX.utils.sheet_add_json(filledExampleWs, exampleData, {
            origin: 'A5'
          });
        }
      } else {
        if (
          categories.length > 0 &&
          institutions.length > 0 &&
          departments.length > 0
        ) {
          const exampleData = [
            {
              ...NAME_BASED_SAMPLE_DATA[0],
              category_name: categories[0].name,
              institution_name: institutions[0].name,
              department_name:
                departments.find(
                  (d: any) => d.institution_id === institutions[0].id
                )?.department_name || departments[0].department_name
            }
          ];
          XLSX.utils.sheet_add_json(filledExampleWs, exampleData, {
            origin: 'A5'
          });
        }
      }

      XLSX.utils.book_append_sheet(wb, filledExampleWs, 'Filled Example');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `staff_${
        templateType === 'id' ? 'id_based' : 'name_based'
      }_template_${timestamp}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, fileName);

      toast.success(
        `${
          templateType === 'id' ? 'ID-based' : 'Name-based'
        } template downloaded successfully`
      );
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Error creating template');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='outline' className='w-full sm:w-auto'>
          <FileDown className='mr-2 h-4 w-4' />
          Download Template
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuItem onClick={() => handleDownload('id')}>
          ID-Based Template
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload('name')}>
          Name-Based Template
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
