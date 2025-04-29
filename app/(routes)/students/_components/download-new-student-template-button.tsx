'use client';

import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';

// Define the headers based on the required fields for creating a new student
// Adjust this list based on your CreateStudentDto and database schema requirements
const HEADERS = [
  // Personal Info
  'student_name', // Required
  'father_name', // Required
  'father_occupation',
  'father_mobile',
  'mother_name', // Required
  'mother_occupation',
  'mother_mobile', // Required
  'date_of_birth', // Required (Format: YYYY-MM-DD)
  'gender', // Required (e.g., Male, Female, Other)
  'religion', // Required
  'community', // Required
  'caste',
  'annual_income',

  // Academic Info
  'last_school', // Required
  'board_of_study', // Required
  'tenth_marks_json', // Required (JSON string: {"max_marks":500,"obtained_marks":450,"percentage":90})
  'twelfth_marks_json', // Required (JSON string: {"group":"Bio-Maths","max_marks":600,"obtained_marks":550,"percentage":91.6,"subjects":{}})
  'medical_cutoff_marks',
  'engineering_cutoff_marks',
  'neet_roll_number',
  'counseling_applied', // (true/false)
  'counseling_number',
  'first_graduate', // (true/false)

  // Course Info
  'quota',
  'category',
  'institution_id', // Required (UUID)
  'degree_id', // Required (UUID)
  'department_id', // Required (UUID)
  'program_id', // Required (UUID)
  'entry_type', // Required (e.g., FIRST YEAR, LATERAL ENTRY)

  // Contact Info
  'permanent_address_street', // Required
  'permanent_address_taluk',
  'permanent_address_district', // Required
  'permanent_address_pin_code', // Required (6 digits)
  'permanent_address_state', // Required
  'student_mobile', // Required
  'student_email', // Required (Personal Email)

  // Accommodation Info
  'accommodation_type', // Required (e.g., DAY SCHOLAR, HOSTEL)
  'hostel_type',
  'bus_required', // (true/false)
  'bus_route',
  'bus_pickup_location',

  // Reference Info
  'reference_type',
  'reference_name',
  'reference_contact',

  // Fields often filled during promotion (optional here, but can be included)
  'roll_number', // Optional: If provided, is_profile_complete might be true
  'college_email' // Optional: If provided, user creation might happen
  // 'student_photo_url', // Hard to provide in bulk upload, usually done later
];

// Sample Data Row (adjust values as needed)
const SAMPLE_ROW = {
  student_name: 'Test Student',
  father_name: 'Test Father',
  father_occupation: 'Business',
  father_mobile: '9876543210',
  mother_name: 'Test Mother',
  mother_occupation: 'Homemaker',
  mother_mobile: '9876543211',
  date_of_birth: '2005-05-15',
  gender: 'Male',
  religion: 'Hindu',
  community: 'BC',
  caste: 'Some Caste',
  annual_income: '500000',
  last_school: 'Previous High School',
  board_of_study: 'State Board',
  tenth_marks_json: '{"max_marks":500,"obtained_marks":450,"percentage":90}',
  twelfth_marks_json:
    '{"group":"Bio-Maths","max_marks":600,"obtained_marks":550,"percentage":91.6,"subjects":{"Maths":95,"Physics":92,"Chemistry":93,"Biology":90}}',
  medical_cutoff_marks: '195.5',
  engineering_cutoff_marks: '198.0',
  neet_roll_number: '12345678',
  counseling_applied: true,
  counseling_number: 'C12345',
  first_graduate: false,
  quota: 'General',
  category: 'OC',
  institution_id: 'replace-with-real-institution-uuid',
  degree_id: 'replace-with-real-degree-uuid',
  department_id: 'replace-with-real-dept-uuid',
  program_id: 'replace-with-real-program-uuid',
  entry_type: 'FIRST YEAR',
  permanent_address_street: '123 Main St',
  permanent_address_taluk: 'Some Taluk',
  permanent_address_district: 'Some District',
  permanent_address_pin_code: '600001',
  permanent_address_state: 'Tamil Nadu',
  student_mobile: '9988776655',
  student_email: 'test.student@personal.com',
  accommodation_type: 'HOSTEL',
  hostel_type: 'Boys Hostel A',
  bus_required: false,
  bus_route: '',
  bus_pickup_location: '',
  reference_type: 'Staff',
  reference_name: 'Ref Staff Name',
  reference_contact: '9001122334',
  roll_number: '',
  college_email: ''
};

export function DownloadNewStudentTemplateButton() {
  const handleDownload = () => {
    try {
      // Create worksheet data: Header row + Sample row
      const dataForSheet = [
        HEADERS,
        HEADERS.map(
          (header) => SAMPLE_ROW[header as keyof typeof SAMPLE_ROW] ?? ''
        )
      ];
      const ws = XLSX.utils.aoa_to_sheet(dataForSheet);

      // Optional: Add column widths and comments/guidance
      ws['!cols'] = HEADERS.map(() => ({ wch: 20 })); // Set default width
      // Add comments to headers for guidance
      HEADERS.forEach((header, index) => {
        const cellAddress = XLSX.utils.encode_cell({ c: index, r: 0 });
        if (!ws[cellAddress]) ws[cellAddress] = { t: 's', v: header };
        let commentText = `Field: ${header}`;
        // Add specific guidance
        if (header.endsWith('_json'))
          commentText += '\n(Enter as valid JSON string)';
        if (header.endsWith('_id')) commentText += '\n(Enter valid UUID)';
        if (header === 'date_of_birth') commentText += '\n(Format: YYYY-MM-DD)';
        if (header === 'pin_code') commentText += '\n(6 digits required)';
        if (
          header === 'counseling_applied' ||
          header === 'first_graduate' ||
          header === 'bus_required'
        )
          commentText += '\n(Enter TRUE or FALSE)';

        ws[cellAddress].c = [{ a: 'Guide', t: commentText }];
      });

      // Create workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'New Student Template');

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `new_student_template_${timestamp}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      console.error('Error creating new student template:', error);
      // Add user-facing error toast if desired
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
