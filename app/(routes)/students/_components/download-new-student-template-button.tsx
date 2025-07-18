'use client';

import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import * as XLSX from 'xlsx';
import { toast } from 'react-hot-toast';

// Define field categories for ID-based template
// ALL FIELDS ARE NOW OPTIONAL - NO REQUIRED FIELDS
const ID_BASED_FIELD_CATEGORIES = {
  // OPTIONAL FIELDS - Section 1: Personal Information
  personal_optional: [
    'first_name',
    'last_name',
    'father_name',
    'mother_name',
    'mother_mobile',
    'date_of_birth',
    'gender',
    'religion',
    'community',
    'father_occupation',
    'father_mobile',
    'mother_occupation',
    'caste',
    'annual_income'
  ],

  // OPTIONAL FIELDS - Section 2: Academic Information
  academic_optional: [
    'last_school',
    'board_of_study',
    'tenth_marks_max_marks',
    'tenth_marks_obtained_marks',
    'tenth_marks_percentage',
    'twelfth_marks_group',
    'twelfth_marks_max_marks',
    'twelfth_marks_obtained_marks',
    'twelfth_marks_percentage',
    'twelfth_marks_physics',
    'twelfth_marks_chemistry',
    'twelfth_marks_mathematics',
    'twelfth_marks_biology',
    'twelfth_marks_computer_science',
    'twelfth_marks_other_subject',
    'medical_cutoff_marks',
    'engineering_cutoff_marks',
    'neet_roll_number',
    'counseling_applied',
    'counseling_number',
    'first_graduate'
  ],

  // OPTIONAL FIELDS - Section 3: Course Information (ID-based)
  course_optional: [
    'institution_id',
    'department_id',
    'program_id',
    'degree_id',
    'academic_year_id',
    'semester_id',
    'section_id',
    'entry_type',
    'quota',
    'category'
  ],

  // OPTIONAL FIELDS - Section 4: Contact Information
  contact_optional: [
    'permanent_address_street',
    'permanent_address_district',
    'permanent_address_pin_code',
    'permanent_address_state',
    'student_mobile',
    'student_email',
    'accommodation_type',
    'permanent_address_taluk',
    'hostel_type',
    'bus_required',
    'bus_route',
    'bus_pickup_location'
  ],

  // OPTIONAL FIELDS - Section 5: Reference & Onboarding
  reference_optional: [
    'reference_type',
    'reference_name',
    'reference_contact',
    'roll_number',
    'college_email'
  ]
};

// Define field categories for name-based template
// ALL FIELDS ARE NOW OPTIONAL - NO REQUIRED FIELDS
const NAME_BASED_FIELD_CATEGORIES = {
  // Same personal and academic fields
  personal_optional: [...ID_BASED_FIELD_CATEGORIES.personal_optional],
  academic_optional: [...ID_BASED_FIELD_CATEGORIES.academic_optional],

  // OPTIONAL FIELDS - Section 3: Course Information (Name-based)
  course_optional: [
    'institution_name',
    'department_name',
    'program_name',
    'degree_name',
    'academic_year_name',
    'semester_name',
    'section_name',
    'entry_type',
    'quota',
    'category'
  ],

  // Same contact and reference fields
  contact_optional: [...ID_BASED_FIELD_CATEGORIES.contact_optional],
  reference_optional: [...ID_BASED_FIELD_CATEGORIES.reference_optional]
};

// ID-based sample data
const ID_BASED_SAMPLE_DATA = {
  // Personal Information - All Optional
  first_name: 'John',
  last_name: 'Doe',
  father_name: 'Robert Doe',
  mother_name: 'Mary Doe',
  mother_mobile: '9876543210',
  date_of_birth: '2005-05-15',
  gender: 'Male',
  religion: 'Hindu',
  community: 'BC',
  father_occupation: 'Business',
  father_mobile: '9876543211',
  mother_occupation: 'Teacher',
  caste: 'Some Caste',
  annual_income: '500000',

  // Academic Information - All Optional
  last_school: 'ABC Higher Secondary School',
  board_of_study: 'State Board',
  tenth_marks_max_marks: '500',
  tenth_marks_obtained_marks: '450',
  tenth_marks_percentage: '90.0',
  twelfth_marks_group: 'Bio-Maths',
  twelfth_marks_max_marks: '600',
  twelfth_marks_obtained_marks: '550',
  twelfth_marks_percentage: '91.67',
  twelfth_marks_physics: '95',
  twelfth_marks_chemistry: '92',
  twelfth_marks_mathematics: '98',
  twelfth_marks_biology: '88',
  twelfth_marks_computer_science: '94',
  twelfth_marks_other_subject: '',
  medical_cutoff_marks: '195.5',
  engineering_cutoff_marks: '198.0',
  neet_roll_number: '12345678',
  counseling_applied: 'true',
  counseling_number: 'C12345',
  first_graduate: 'false',

  // Course Information - All Optional
  institution_id: '9c1554e8-12a2-4b76-a9d6-8242bb05eba1',
  degree_id: '28827de0-70ad-4082-8320-d9f0ae6920c5',
  department_id: '7646521a-a252-4756-bd8f-ba7c1d36ff56',
  program_id: 'd6662299-c40a-4da2-9099-2a2f7739f80b',
  academic_year_id: '',
  semester_id: '',
  section_id: '',
  entry_type: 'FIRST YEAR',
  quota: 'General',
  category: 'OC',

  // Contact Information - All Optional
  permanent_address_street: '123 Main Street, Gandhi Nagar',
  permanent_address_district: 'Namakkal',
  permanent_address_pin_code: '637001',
  permanent_address_state: 'Tamil Nadu',
  student_mobile: '9988776655',
  student_email: 'john.doe@personal.com',
  accommodation_type: 'HOSTEL',
  permanent_address_taluk: 'Namakkal',
  hostel_type: 'Boys Hostel A',
  bus_required: 'false',
  bus_route: '',
  bus_pickup_location: '',

  // Reference & Onboarding - All Optional
  reference_type: 'Educational Consultant',
  reference_name: 'ABC Consultancy',
  reference_contact: '9001122334',
  roll_number: '',
  college_email: ''
};

// Name-based sample data
const NAME_BASED_SAMPLE_DATA = {
  // Personal Information - All Optional
  first_name: 'John',
  last_name: 'Doe',
  father_name: 'Robert Doe',
  mother_name: 'Mary Doe',
  mother_mobile: '9876543210',
  date_of_birth: '2005-05-15',
  gender: 'Male',
  religion: 'Hindu',
  community: 'BC',
  father_occupation: 'Business',
  father_mobile: '9876543211',
  mother_occupation: 'Teacher',
  caste: 'Some Caste',
  annual_income: '500000',

  // Academic Information - All Optional
  last_school: 'ABC Higher Secondary School',
  board_of_study: 'State Board',
  tenth_marks_max_marks: '500',
  tenth_marks_obtained_marks: '450',
  tenth_marks_percentage: '90.0',
  twelfth_marks_group: 'Bio-Maths',
  twelfth_marks_max_marks: '600',
  twelfth_marks_obtained_marks: '550',
  twelfth_marks_percentage: '91.67',
  twelfth_marks_physics: '95',
  twelfth_marks_chemistry: '92',
  twelfth_marks_mathematics: '98',
  twelfth_marks_biology: '88',
  twelfth_marks_computer_science: '94',
  twelfth_marks_other_subject: '',
  medical_cutoff_marks: '195.5',
  engineering_cutoff_marks: '198.0',
  neet_roll_number: '12345678',
  counseling_applied: 'true',
  counseling_number: 'C12345',
  first_graduate: 'false',

  // Course Information - All Optional
  institution_name: 'JKKN College of Allied Health Sciences',
  degree_name: 'Undergraduate',
  department_name: 'Department of AHS',
  program_name: '(BSC) Accident and Emergency Care Technology',
  academic_year_name: '2024-2025',
  semester_name: 'Semester 1',
  section_name: 'Section A',
  entry_type: 'FIRST YEAR',
  quota: 'General',
  category: 'OC',

  // Contact Information - All Optional
  permanent_address_street: '123 Main Street, Gandhi Nagar',
  permanent_address_district: 'Namakkal',
  permanent_address_pin_code: '637001',
  permanent_address_state: 'Tamil Nadu',
  student_mobile: '9988776655',
  student_email: 'john.doe@personal.com',
  accommodation_type: 'HOSTEL',
  permanent_address_taluk: 'Namakkal',
  hostel_type: 'Boys Hostel A',
  bus_required: 'false',
  bus_route: '',
  bus_pickup_location: '',

  // Reference & Onboarding - All Optional
  reference_type: 'Educational Consultant',
  reference_name: 'ABC Consultancy',
  reference_contact: '9001122334',
  roll_number: '',
  college_email: ''
};

// Instructions for ID-based template
const ID_BASED_INSTRUCTIONS = [
  ['ID-BASED STUDENT BULK UPLOAD INSTRUCTIONS'],
  [''],
  ['IMPORTANT NOTES:'],
  ['• ALL FIELDS ARE OPTIONAL - Fill only the data you have available'],
  ['• All UUIDs can be found in the "Reference Data" sheet'],
  ['• Date formats accepted: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY'],
  ['• Boolean fields must be "true" or "false" (lowercase)'],
  ['• PIN codes must be exactly 6 digits if provided'],
  ['• Email addresses must be valid format if provided'],
  ['• System automatically checks for duplicate students before upload'],
  [
    '• Duplicates are detected by: email, college email, roll number, or mobile + first name + last name combination'
  ],
  [''],
  ['FIELD SECTIONS:'],
  [''],
  ['1. PERSONAL INFORMATION - ALL OPTIONAL'],
  ['   - Basic student and family details'],
  ['   - Fill only the data you have available'],
  [''],
  ['2. ACADEMIC INFORMATION (10th and 12th marks breakdown) - ALL OPTIONAL'],
  ['   - Instead of complex JSON, use separate columns for marks'],
  ['   - System will automatically combine them into required format'],
  ['   - All academic fields are optional - can be left empty'],
  ['   - Subject-wise marks are optional but recommended'],
  [''],
  ['3. COURSE INFORMATION - ALL OPTIONAL'],
  ['   - Optional: institution_id, department_id, program_id (UUIDs)'],
  [
    '   - Optional: degree_id, academic_year_id, semester_id, section_id (UUIDs)'
  ],
  ['   - All IDs must be valid UUIDs from Reference Data sheet if provided'],
  ['   - Copy UUIDs exactly from the reference lists'],
  [''],
  ['4. CONTACT INFORMATION - ALL OPTIONAL'],
  ['   - Complete address and contact details'],
  ['   - PIN code must be exactly 6 digits if provided'],
  [''],
  ['5. REFERENCE & ONBOARDING - ALL OPTIONAL'],
  ['   - roll_number and college_email are usually assigned later'],
  ['   - When college_email is provided, user account will be auto-created'],
  [''],
  ['VALIDATION RULES:'],
  ['• All fields are optional - upload with any available data'],
  ['• date_of_birth: Must be valid date format if provided'],
  ['• permanent_address_pin_code: Must be exactly 6 digits if provided'],
  ['• student_email: Must be valid email format if provided'],
  ['• college_email: Must be valid email format if provided'],
  [
    '• institution_id, department_id, program_id, academic_year_id: Must be valid UUIDs if provided'
  ],
  ['• student_mobile: Must contain only digits (10-15 characters) if provided'],
  [''],
  ['DEFAULT VALUES FOR EMPTY FIELDS:'],
  ['• When certain core fields are left empty, the system provides defaults:'],
  ['  - first_name: "Unknown",'],
  ['  - last_name: "Student",'],
  ['  - father_name: "Unknown"'],
  ['  - mother_name: "Unknown"'],
  ['  - mother_mobile: "0000000000"'],
  ['  - gender: "Not Specified"'],
  ['  - religion: "Not Specified"'],
  ['  - community: "Not Specified"'],
  ['  - last_school: "Unknown School"'],
  ['  - board_of_study: "Not Specified"'],
  ['  - entry_type: "FIRST YEAR"'],
  ['  - date_of_birth: "1900-01-01" (placeholder date)'],
  ['• You can update these values later through individual student records'],
  [''],
  ['COMMON VALUES:'],
  ['gender: Male, Female, Other'],
  ['religion: Hindu, Muslim, Christian, Sikh, Buddhist, Jain, Other'],
  ['community: OC, BC, MBC, SC, ST, DNC'],
  ['accommodation_type: DAY SCHOLAR, HOSTEL'],
  ['counseling_applied: true, false'],
  ['first_graduate: true, false'],
  ['bus_required: true, false']
];

// Instructions for name-based template
const NAME_BASED_INSTRUCTIONS = [
  ['NAME-BASED STUDENT BULK UPLOAD INSTRUCTIONS'],
  [''],
  ['IMPORTANT NOTES:'],
  ['• ALL FIELDS ARE OPTIONAL - Fill only the data you have available'],
  [
    '• Names must match EXACTLY with database records (case-insensitive) if provided'
  ],
  ['• Date formats accepted: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY'],
  ['• Boolean fields must be "true" or "false" (lowercase)'],
  ['• PIN codes must be exactly 6 digits if provided'],
  ['• Email addresses must be valid format if provided'],
  ['• System automatically checks for duplicate students before upload'],
  [
    '• Duplicates are detected by: email, college email, roll number, or mobile + first name + last name combination'
  ],
  [''],
  ['FIELD SECTIONS:'],
  [''],
  ['1. PERSONAL INFORMATION - ALL OPTIONAL'],
  ['   - Basic student and family details'],
  ['   - Fill only the data you have available'],
  [''],
  ['2. ACADEMIC INFORMATION (10th and 12th marks breakdown) - ALL OPTIONAL'],
  ['   - Instead of complex JSON, use separate columns for marks'],
  ['   - System will automatically combine them into required format'],
  ['   - All academic fields are optional - can be left empty'],
  ['   - Subject-wise marks are optional but recommended'],
  [''],
  ['3. COURSE INFORMATION - ALL OPTIONAL'],
  ['   - Optional: institution_name, department_name, program_name'],
  [
    '   - Optional: degree_name, academic_year_name, semester_name, section_name'
  ],
  ['   - Names must match exactly with database records if provided'],
  ['   - Copy names exactly from the reference lists'],
  ['   - System will automatically resolve names to IDs during upload'],
  [''],
  ['4. CONTACT INFORMATION - ALL OPTIONAL'],
  ['   - Complete address and contact details'],
  ['   - PIN code must be exactly 6 digits if provided'],
  [''],
  ['5. REFERENCE & ONBOARDING - ALL OPTIONAL'],
  ['   - roll_number and college_email are usually assigned later'],
  ['   - When college_email is provided, user account will be auto-created'],
  [''],
  ['VALIDATION RULES:'],
  ['• All fields are optional - upload with any available data'],
  ['• date_of_birth: Must be valid date format if provided'],
  ['• permanent_address_pin_code: Must be exactly 6 digits if provided'],
  ['• student_email: Must be valid email format if provided'],
  ['• college_email: Must be valid email format if provided'],
  [
    '• institution_name, department_name, program_name, academic_year_name: Must match exactly if provided'
  ],
  ['• student_mobile: Must contain only digits (10-15 characters) if provided'],
  [''],
  ['NAME MATCHING RULES:'],
  ['• Names are matched case-insensitively'],
  ['• Extra spaces are automatically trimmed'],
  ['• Names must match exactly as they appear in the reference data'],
  ['• Department names must belong to the specified institution'],
  ['• Program names must belong to the specified department'],
  ['• Semester and section names must belong to the specified institution'],
  [''],
  ['DEFAULT VALUES FOR EMPTY FIELDS:'],
  ['• When certain core fields are left empty, the system provides defaults:'],
  ['  - first_name: "Unknown",'],
  ['  - last_name: "Student",'],
  ['  - father_name: "Unknown"'],
  ['  - mother_name: "Unknown"'],
  ['  - mother_mobile: "0000000000"'],
  ['  - gender: "Not Specified"'],
  ['  - religion: "Not Specified"'],
  ['  - community: "Not Specified"'],
  ['  - last_school: "Unknown School"'],
  ['  - board_of_study: "Not Specified"'],
  ['  - entry_type: "FIRST YEAR"'],
  ['  - date_of_birth: "1900-01-01" (placeholder date)'],
  ['• You can update these values later through individual student records'],
  [''],
  ['COMMON VALUES:'],
  ['gender: Male, Female, Other'],
  ['religion: Hindu, Muslim, Christian, Sikh, Buddhist, Jain, Other'],
  ['community: OC, BC, MBC, SC, ST, DNC'],
  ['accommodation_type: DAY SCHOLAR, HOSTEL'],
  ['counseling_applied: true, false'],
  ['first_graduate: true, false'],
  ['bus_required: true, false']
];

// Get all headers for a specific template type
const getAllHeaders = (templateType: 'id' | 'name') => {
  const fieldCategories =
    templateType === 'id'
      ? ID_BASED_FIELD_CATEGORIES
      : NAME_BASED_FIELD_CATEGORIES;

  return [
    ...fieldCategories.personal_optional,
    ...fieldCategories.academic_optional,
    ...fieldCategories.course_optional,
    ...fieldCategories.contact_optional,
    ...fieldCategories.reference_optional
  ];
};

export function DownloadNewStudentTemplateButton() {
  const handleDownload = (templateType: 'id' | 'name') => {
    try {
      // Create workbook
      const wb = XLSX.utils.book_new();

      // Get sample data and headers based on template type
      const sampleData =
        templateType === 'id' ? ID_BASED_SAMPLE_DATA : NAME_BASED_SAMPLE_DATA;
      const allHeaders = getAllHeaders(templateType);
      const instructions =
        templateType === 'id' ? ID_BASED_INSTRUCTIONS : NAME_BASED_INSTRUCTIONS;

      // Create template headers - all fields are optional now
      const templateHeaders = allHeaders;

      const templateData = [
        templateHeaders,
        allHeaders.map((header) => (sampleData as any)[header] || '')
      ];

      const templateWs = XLSX.utils.aoa_to_sheet(templateData);

      // Set column widths
      templateWs['!cols'] = allHeaders.map(() => ({ wch: 25 }));

      // Sheet 2: Instructions
      const instructionsWs = XLSX.utils.aoa_to_sheet(instructions);
      instructionsWs['!cols'] = [{ wch: 80 }];

      // Sheet 3: Reference Data
      const referenceData = [
        ['REFERENCE DATA FOR ' + (templateType === 'id' ? 'IDS' : 'NAMES')],
        [''],
        ['INSTITUTION REFERENCE DATA'],
        templateType === 'id'
          ? ['institution_id', 'institution_name']
          : ['institution_name', 'institution_id'],
        [
          templateType === 'id'
            ? '9c1554e8-12a2-4b76-a9d6-8242bb05eba1'
            : 'JKKN College of Allied Health Sciences',
          templateType === 'id'
            ? 'JKKN College of Allied Health Sciences'
            : '9c1554e8-12a2-4b76-a9d6-8242bb05eba1'
        ],
        [
          templateType === 'id'
            ? 'a33138b6-4eea-4675-941f-1071bf88b127'
            : 'JKKN College of Arts and Science (Aided)',
          templateType === 'id'
            ? 'JKKN College of Arts and Science (Aided)'
            : 'a33138b6-4eea-4675-941f-1071bf88b127'
        ],
        [''],
        ['DEGREE REFERENCE DATA'],
        templateType === 'id'
          ? ['degree_id', 'degree_name', 'institution_name']
          : ['degree_name', 'degree_id', 'institution_name'],
        [
          templateType === 'id'
            ? '28827de0-70ad-4082-8320-d9f0ae6920c5'
            : 'Undergraduate',
          templateType === 'id'
            ? 'Undergraduate'
            : '28827de0-70ad-4082-8320-d9f0ae6920c5',
          'JKKN College of Allied Health Sciences'
        ],
        [''],
        ['DEPARTMENT REFERENCE DATA'],
        templateType === 'id'
          ? ['department_id', 'department_name', 'institution_name']
          : ['department_name', 'department_id', 'institution_name'],
        [
          templateType === 'id'
            ? '7646521a-a252-4756-bd8f-ba7c1d36ff56'
            : 'Department of AHS',
          templateType === 'id'
            ? 'Department of AHS'
            : '7646521a-a252-4756-bd8f-ba7c1d36ff56',
          'JKKN College of Allied Health Sciences'
        ],
        [''],
        ['PROGRAM REFERENCE DATA'],
        templateType === 'id'
          ? ['program_id', 'program_name', 'department_name']
          : ['program_name', 'program_id', 'department_name'],
        [
          templateType === 'id'
            ? 'd6662299-c40a-4da2-9099-2a2f7739f80b'
            : '(BSC) Accident and Emergency Care Technology',
          templateType === 'id'
            ? '(BSC) Accident and Emergency Care Technology'
            : 'd6662299-c40a-4da2-9099-2a2f7739f80b',
          'Department of AHS'
        ],
        [''],
        [
          'NOTE: This is sample reference data. For complete and up-to-date lists,'
        ],
        [
          'please contact your system administrator or check the institution portal.'
        ]
      ];

      const referenceWs = XLSX.utils.aoa_to_sheet(referenceData);
      referenceWs['!cols'] = Array(3).fill({ wch: 40 });

      // Add sheets to workbook
      XLSX.utils.book_append_sheet(wb, templateWs, 'Student Template');
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');
      XLSX.utils.book_append_sheet(wb, referenceWs, 'Reference Data');

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `student_${templateType}_based_template_${timestamp}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, fileName);

      toast.success(
        `${
          templateType === 'id' ? 'ID-based' : 'Name-based'
        } student template downloaded successfully`
      );
    } catch (error) {
      console.error('Error creating student template:', error);
      toast.error('Error creating student template');
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
