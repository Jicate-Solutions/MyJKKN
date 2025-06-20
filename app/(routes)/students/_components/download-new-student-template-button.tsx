'use client';

import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

// Define field categories and requirements based on the validation schema
const FIELD_CATEGORIES = {
  // REQUIRED FIELDS - Section 1: Personal Information
  personal_required: [
    'student_name', // Required
    'father_name', // Required
    'mother_name', // Required
    'mother_mobile', // Required
    'date_of_birth', // Required (Format: YYYY-MM-DD)
    'gender', // Required
    'religion', // Required
    'community' // Required
  ],

  // OPTIONAL FIELDS - Section 1: Personal Information
  personal_optional: [
    'father_occupation',
    'father_mobile',
    'mother_occupation',
    'caste',
    'annual_income'
  ],

  // REQUIRED FIELDS - Section 2: Academic Information (none - all moved to optional)
  academic_required: [],

  // OPTIONAL FIELDS - Section 2: Academic Information
  academic_optional: [
    'last_school', // Now optional
    'board_of_study', // Now optional
    'tenth_marks_max_marks', // Now optional - Will be combined into tenth_marks_json
    'tenth_marks_obtained_marks', // Now optional - Will be combined into tenth_marks_json
    'tenth_marks_percentage', // Now optional - Will be combined into tenth_marks_json
    'twelfth_marks_group', // Now optional - Will be combined into twelfth_marks_json
    'twelfth_marks_max_marks', // Now optional - Will be combined into twelfth_marks_json
    'twelfth_marks_obtained_marks', // Now optional - Will be combined into twelfth_marks_json
    'twelfth_marks_percentage', // Now optional - Will be combined into twelfth_marks_json
    'twelfth_marks_physics', // Subject marks
    'twelfth_marks_chemistry',
    'twelfth_marks_mathematics',
    'twelfth_marks_biology',
    'twelfth_marks_computer_science',
    'twelfth_marks_other_subject',
    'medical_cutoff_marks',
    'engineering_cutoff_marks',
    'neet_roll_number',
    'counseling_applied', // true/false
    'counseling_number',
    'first_graduate' // true/false
  ],

  // REQUIRED FIELDS - Section 3: Course Information
  course_required: [
    'institution_id', // Required (UUID)
    'department_id', // Required (UUID)
    'program_id' // Required (UUID)
  ],

  // OPTIONAL FIELDS - Section 3: Course Information
  course_optional: [
    'degree_id', // Now optional (UUID)
    'entry_type', // Now optional (e.g., FIRST YEAR, LATERAL ENTRY)
    'quota',
    'category',
    'semester_id', // UUID (Required for profile completion)
    'section_id' // UUID (Required for profile completion)
  ],

  // REQUIRED FIELDS - Section 4: Contact Information
  contact_required: [
    'permanent_address_street', // Required
    'permanent_address_district', // Required
    'permanent_address_pin_code', // Required (6 digits)
    'permanent_address_state', // Required
    'student_mobile', // Required
    'student_email', // Required (Personal Email)
    'accommodation_type' // Required (e.g., DAY SCHOLAR, HOSTEL)
  ],

  // OPTIONAL FIELDS - Section 4: Contact Information
  contact_optional: [
    'permanent_address_taluk',
    'hostel_type',
    'bus_required', // true/false
    'bus_route',
    'bus_pickup_location'
  ],

  // OPTIONAL FIELDS - Section 5: Reference & Onboarding
  reference_optional: [
    'reference_type',
    'reference_name',
    'reference_contact',
    'roll_number', // Required for profile completion
    'college_email' // Required for profile completion and user account creation
  ]
};

// All headers in organized order
const ALL_HEADERS = [
  // Personal Information (Required)
  ...FIELD_CATEGORIES.personal_required,
  ...FIELD_CATEGORIES.personal_optional,

  // Academic Information (Required + Optional)
  ...FIELD_CATEGORIES.academic_required,
  ...FIELD_CATEGORIES.academic_optional,

  // Course Information (Required + Optional)
  ...FIELD_CATEGORIES.course_required,
  ...FIELD_CATEGORIES.course_optional,

  // Contact Information (Required + Optional)
  ...FIELD_CATEGORIES.contact_required,
  ...FIELD_CATEGORIES.contact_optional,

  // Reference & Onboarding (Optional)
  ...FIELD_CATEGORIES.reference_optional
];

// Sample data with comprehensive examples
const SAMPLE_DATA = {
  // Personal Information - Required
  student_name: 'John Doe',
  father_name: 'Robert Doe',
  mother_name: 'Mary Doe',
  mother_mobile: '9876543210',
  date_of_birth: '2005-05-15',
  gender: 'Male',
  religion: 'Hindu',
  community: 'BC',

  // Personal Information - Optional
  father_occupation: 'Business',
  father_mobile: '9876543211',
  mother_occupation: 'Teacher',
  caste: 'Some Caste',
  annual_income: '500000',

  // Academic Information - Optional (now all optional - can be left empty)
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

  // Course Information - Required
  institution_id: '9c1554e8-12a2-4b76-a9d6-8242bb05eba1',
  department_id: '7646521a-a252-4756-bd8f-ba7c1d36ff56',
  program_id: 'd6662299-c40a-4da2-9099-2a2f7739f80b',

  // Course Information - Optional
  degree_id: '28827de0-70ad-4082-8320-d9f0ae6920c5',
  entry_type: 'FIRST YEAR',

  // Course Information - Optional
  quota: 'General',
  category: 'OC',
  semester_id: '', // Leave empty if not assigning semester yet
  section_id: '', // Leave empty if not assigning section yet

  // Contact Information - Required
  permanent_address_street: '123 Main Street, Gandhi Nagar',
  permanent_address_district: 'Namakkal',
  permanent_address_pin_code: '637001',
  permanent_address_state: 'Tamil Nadu',
  student_mobile: '9988776655',
  student_email: 'john.doe@personal.com',
  accommodation_type: 'HOSTEL',

  // Contact Information - Optional
  permanent_address_taluk: 'Namakkal',
  hostel_type: 'Boys Hostel A',
  bus_required: 'false',
  bus_route: '',
  bus_pickup_location: '',

  // Reference & Onboarding - Optional
  reference_type: 'Educational Consultant',
  reference_name: 'ABC Consultancy',
  reference_contact: '9001122334',
  roll_number: '', // Leave empty for bulk creation, will be assigned later
  college_email: '' // Leave empty for bulk creation, will be assigned later
};

// Field descriptions and validation requirements
const FIELD_DESCRIPTIONS = {
  // Personal Information
  student_name: 'Full name of the student (Required)',
  father_name: "Father's full name (Required)",
  mother_name: "Mother's full name (Required)",
  mother_mobile: "Mother's mobile number (Required)",
  date_of_birth:
    'Date of birth - Multiple formats accepted: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (Required)',
  gender: 'Gender: Male, Female, Other (Required)',
  religion: 'Religion (Required)',
  community: 'Community category (Required)',
  father_occupation: "Father's occupation (Optional)",
  father_mobile: "Father's mobile number (Optional)",
  mother_occupation: "Mother's occupation (Optional)",
  caste: 'Caste details (Optional)',
  annual_income: 'Family annual income (Optional)',

  // Academic Information (all now optional)
  last_school: 'Name of the last school attended (Optional)',
  board_of_study: 'Board of study for 12th grade (Optional)',
  tenth_marks_max_marks: '10th grade maximum marks (Optional)',
  tenth_marks_obtained_marks: '10th grade obtained marks (Optional)',
  tenth_marks_percentage: '10th grade percentage (Optional)',
  twelfth_marks_group: '12th grade group/stream (Optional)',
  twelfth_marks_max_marks: '12th grade maximum marks (Optional)',
  twelfth_marks_obtained_marks: '12th grade obtained marks (Optional)',
  twelfth_marks_percentage: '12th grade percentage (Optional)',
  twelfth_marks_physics: 'Physics marks (Optional)',
  twelfth_marks_chemistry: 'Chemistry marks (Optional)',
  twelfth_marks_mathematics: 'Mathematics marks (Optional)',
  twelfth_marks_biology: 'Biology marks (Optional)',
  twelfth_marks_computer_science: 'Computer Science marks (Optional)',
  twelfth_marks_other_subject: 'Other subject marks (Optional)',
  medical_cutoff_marks: 'Medical cutoff marks (Optional)',
  engineering_cutoff_marks: 'Engineering cutoff marks (Optional)',
  neet_roll_number: 'NEET roll number (Optional)',
  counseling_applied: 'Counseling applied: true or false (Optional)',
  counseling_number: 'Counseling number (Optional)',
  first_graduate: 'First graduate in family: true or false (Optional)',

  // Course Information
  institution_id: 'Institution UUID - see Reference Data sheet (Required)',
  degree_id: 'Degree UUID - see Reference Data sheet (Optional)',
  department_id: 'Department UUID - see Reference Data sheet (Required)',
  program_id: 'Program UUID - see Reference Data sheet (Required)',
  entry_type: 'Entry type: FIRST YEAR, LATERAL ENTRY, etc. (Optional)',
  quota: 'Admission quota (Optional)',
  category: 'Admission category (Optional)',
  semester_id:
    'Semester UUID - see Reference Data sheet (Optional, but required for profile completion)',
  section_id:
    'Section UUID - see Reference Data sheet (Optional, but required for profile completion)',

  // Contact Information
  permanent_address_street: 'Street address (Required)',
  permanent_address_district: 'District name (Required)',
  permanent_address_pin_code: 'PIN code - exactly 6 digits (Required)',
  permanent_address_state: 'State name (Required)',
  student_mobile: "Student's mobile number (Required)",
  student_email: "Student's personal email address (Required)",
  accommodation_type: 'Accommodation: DAY SCHOLAR, HOSTEL, etc. (Required)',
  permanent_address_taluk: 'Taluk name (Optional)',
  hostel_type: 'Type of hostel accommodation (Optional)',
  bus_required: 'Bus facility required: true or false (Optional)',
  bus_route: 'Bus route details (Optional)',
  bus_pickup_location: 'Bus pickup location (Optional)',

  // Reference & Onboarding
  reference_type: 'Reference type (Optional)',
  reference_name: 'Reference person/organization name (Optional)',
  reference_contact: 'Reference contact details (Optional)',
  roll_number:
    'Student roll number (Optional - usually assigned later, required for profile completion)',
  college_email:
    'College email address (Optional - usually assigned later, required for profile completion and user account creation)'
};

// Reference data for common values
const REFERENCE_VALUES = {
  gender: ['Male', 'Female', 'Other'],
  religion: [
    'Hindu',
    'Muslim',
    'Christian',
    'Sikh',
    'Buddhist',
    'Jain',
    'Other'
  ],
  community: ['OC', 'BC', 'MBC', 'SC', 'ST', 'DNC'],
  board_of_study: ['State Board', 'CBSE', 'ICSE', 'Matriculation', 'Other'],
  entry_type: ['FIRST YEAR', 'LATERAL ENTRY', 'TRANSFER'],
  accommodation_type: ['DAY SCHOLAR', 'HOSTEL'],
  counseling_applied: ['true', 'false'],
  first_graduate: ['true', 'false'],
  bus_required: ['true', 'false']
};

export function DownloadNewStudentTemplateButton() {
  const handleDownload = () => {
    try {
      // Create workbook
      const wb = XLSX.utils.book_new();

      // Sheet 1: Main Template
      const templateHeaders = ALL_HEADERS.map((header) => {
        const isRequired = [
          'student_name',
          'father_name',
          'mother_name',
          'mother_mobile',
          'date_of_birth',
          'gender',
          'religion',
          'community',
          'institution_id',
          'department_id',
          'program_id',
          'permanent_address_street',
          'permanent_address_district',
          'permanent_address_pin_code',
          'permanent_address_state',
          'student_mobile',
          'student_email',
          'accommodation_type'
        ].includes(header);

        return isRequired ? `${header} *` : header;
      });

      const templateData = [
        templateHeaders,
        ALL_HEADERS.map((header) => (SAMPLE_DATA as any)[header] || '')
      ];

      const templateWs = XLSX.utils.aoa_to_sheet(templateData);

      // Set column widths and styles for template
      templateWs['!cols'] = ALL_HEADERS.map(() => ({ wch: 25 }));

      // Field descriptions removed as requested - see Instructions sheet instead

      // Sheet 2: Instructions
      const instructionsData = [
        ['BULK STUDENT UPLOAD INSTRUCTIONS'],
        [''],
        ['IMPORTANT NOTES:'],
        ['• Fields marked with * are REQUIRED'],
        ['• All UUIDs can be found in the "Reference Data" sheet'],
        [
          '• Date formats accepted: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY (e.g., 2005-05-15, 15/05/2005)'
        ],
        ['• Boolean fields must be "true" or "false" (lowercase)'],
        ['• PIN codes must be exactly 6 digits'],
        ['• Email addresses must be valid format'],
        ['• System automatically checks for duplicate students before upload'],
        [
          '• Duplicates are detected by: email, college email, roll number, or mobile+name combination'
        ],
        [''],
        ['FIELD SECTIONS:'],
        [''],
        ['1. PERSONAL INFORMATION (Required fields marked with *)'],
        ['   - Basic student and family details'],
        ['   - All required fields must be filled'],
        [''],
        [
          '2. ACADEMIC INFORMATION (10th and 12th marks breakdown) - ALL OPTIONAL'
        ],
        ['   - Instead of complex JSON, use separate columns for marks'],
        ['   - System will automatically combine them into required format'],
        ['   - All academic fields are now optional - can be left empty'],
        ['   - Subject-wise marks are optional but recommended'],
        [''],
        ['3. COURSE INFORMATION (Institution, Department, Program required)'],
        ['   - Required: institution_id, department_id, program_id'],
        ['   - Optional: degree_id, entry_type'],
        ['   - All IDs must be valid UUIDs from Reference Data sheet'],
        [
          '   - semester_id and section_id are optional but required for profile completion'
        ],
        [''],
        ['4. CONTACT INFORMATION'],
        ['   - Complete address and contact details'],
        ['   - PIN code must be exactly 6 digits'],
        [''],
        ['5. REFERENCE & ONBOARDING (All optional)'],
        ['   - roll_number and college_email are usually assigned later'],
        [
          '   - When college_email is provided, user account will be auto-created'
        ],
        [''],
        ['PROFILE COMPLETION:'],
        [
          'For a student profile to be marked as "complete", these fields are required:'
        ],
        ['• roll_number'],
        ['• college_email'],
        ['• semester_id'],
        ['• section_id'],
        [''],
        ['VALIDATION RULES:'],
        ['• student_name: Minimum 1 character (Required)'],
        ['• father_name: Minimum 1 character (Required)'],
        ['• mother_name: Minimum 1 character (Required)'],
        ['• mother_mobile: Required field'],
        ['• date_of_birth: Must be YYYY-MM-DD format (Required)'],
        ['• gender, religion, community: Required fields'],
        [
          '• institution_id, department_id, program_id: Must be valid UUIDs (Required)'
        ],
        ['• permanent_address_pin_code: Must be exactly 6 digits (Required)'],
        ['• student_email: Must be valid email format (Required)'],
        ['• accommodation_type: Required field'],
        ['• Academic and degree info: All optional now'],
        [''],
        ['COMMON VALUES:'],
        ...Object.entries(REFERENCE_VALUES).map(([field, values]) => [
          `${field}: ${values.join(', ')}`
        ])
      ];

      const instructionsWs = XLSX.utils.aoa_to_sheet(instructionsData);
      instructionsWs['!cols'] = [{ wch: 80 }];

      // Sheet 3: Reference Data (Sample - in real implementation, fetch from database)
      const referenceData = [
        ['INSTITUTION REFERENCE DATA'],
        ['institution_id', 'institution_name'],
        [
          '9c1554e8-12a2-4b76-a9d6-8242bb05eba1',
          'JKKN College of Allied Health Sciences'
        ],
        [
          'a33138b6-4eea-4675-941f-1071bf88b127',
          'JKKN College of Arts and Science (Aided)'
        ],
        [
          'b0b8a724-7c65-4f07-8047-2a38e8100ad5',
          'JKKN College of Arts and Science (Self)'
        ],
        [
          '5de4fba1-4564-41ed-8c73-5d948b74b843',
          'JKKN College of Engineering and Technology'
        ],
        [
          '70e54e51-9b98-4e07-9534-a85310609bfd',
          'JKKN College of Nursing and Research'
        ],
        [''],
        ['DEGREE REFERENCE DATA'],
        ['degree_id', 'degree_name', 'institution_name'],
        [
          '28827de0-70ad-4082-8320-d9f0ae6920c5',
          'Undergraduate',
          'JKKN College of Allied Health Sciences'
        ],
        [
          '193e34f6-dee0-45ad-94eb-ad02dbfdc29a',
          'Postgraduate',
          'JKKN College of Arts and Science (Aided)'
        ],
        [''],
        ['DEPARTMENT REFERENCE DATA'],
        ['department_id', 'department_name', 'institution_name'],
        [
          '7646521a-a252-4756-bd8f-ba7c1d36ff56',
          'Department of AHS',
          'JKKN College of Allied Health Sciences'
        ],
        [
          '6408b43f-448c-4958-9254-6067e71f99bb',
          'Department of Chemistry',
          'JKKN College of Arts and Science (Aided)'
        ],
        [''],
        ['PROGRAM REFERENCE DATA'],
        ['program_id', 'program_name', 'department_name'],
        [
          'd6662299-c40a-4da2-9099-2a2f7739f80b',
          '(BSC) Accident and Emergency Care Technology',
          'Department of AHS'
        ],
        [
          '89bb449f-433d-4b1c-b45b-bafd3e0f4b87',
          '(BSC) Cardiac Technology',
          'Department of AHS'
        ],
        [
          'f36335f6-5b96-4358-956e-981bf8393dff',
          '(BSC) Critical Care Technology',
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

      // Sheet 4: JSON Examples
      const jsonExamples = [
        ['JSON FIELD EXAMPLES'],
        [''],
        [
          'Instead of manually writing JSON, use the separate columns in the template.'
        ],
        [
          'The system will automatically convert them to the required JSON format.'
        ],
        [''],
        ['10TH MARKS - Will be converted to tenth_marks_json:'],
        ['tenth_marks_max_marks: 500'],
        ['tenth_marks_obtained_marks: 450'],
        ['tenth_marks_percentage: 90.0'],
        [''],
        [
          'Results in JSON: {"max_marks":"500","obtained_marks":"450","percentage":"90.0"}'
        ],
        [''],
        ['12TH MARKS - Will be converted to twelfth_marks_json:'],
        ['twelfth_marks_group: Bio-Maths'],
        ['twelfth_marks_max_marks: 600'],
        ['twelfth_marks_obtained_marks: 550'],
        ['twelfth_marks_percentage: 91.67'],
        ['twelfth_marks_physics: 95'],
        ['twelfth_marks_chemistry: 92'],
        ['twelfth_marks_mathematics: 98'],
        ['twelfth_marks_biology: 88'],
        [''],
        ['Results in JSON:'],
        ['{'],
        ['  "group": "Bio-Maths",'],
        ['  "max_marks": "600",'],
        ['  "obtained_marks": "550",'],
        ['  "percentage": "91.67",'],
        ['  "subjects": {'],
        ['    "physics": "95",'],
        ['    "chemistry": "92",'],
        ['    "mathematics": "98",'],
        ['    "biology": "88"'],
        ['  }'],
        ['}']
      ];

      const jsonWs = XLSX.utils.aoa_to_sheet(jsonExamples);
      jsonWs['!cols'] = [{ wch: 60 }];

      // Add sheets to workbook
      XLSX.utils.book_append_sheet(wb, templateWs, 'Student Template');
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');
      XLSX.utils.book_append_sheet(wb, referenceWs, 'Reference Data');
      XLSX.utils.book_append_sheet(wb, jsonWs, 'JSON Examples');

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `student_bulk_upload_template_${timestamp}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('Error creating student template:', error);
      // You can add toast notification here if needed
    }
  };

  return (
    <Button
      variant='outline'
      onClick={handleDownload}
      className='w-full sm:w-auto'
    >
      <FileDown className='mr-2 h-4 w-4' />
      Download Comprehensive Template
    </Button>
  );
}
