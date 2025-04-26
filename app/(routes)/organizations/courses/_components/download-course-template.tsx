'use client';

import { useState, useEffect } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { toast } from 'react-hot-toast';

const COLUMN_WIDTHS = {
  A: 40, // institution_id
  B: 40, // department_id
  C: 15, // course_code
  D: 50 // course_name
};

export default function DownloadCourseTemplateButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [instructions, setInstructions] = useState<string[][]>([]);
  const [sampleData, setSampleData] = useState<any[]>([]);

  useEffect(() => {
    // Fetch real institution and department data for instructions
    const fetchData = async () => {
      try {
        const institutions = await OrganizationService.getInstitutionNames(
          true
        );
        if (institutions.length === 0) {
          setInstructions(getDefaultInstructions());
          setSampleData(getDefaultSampleData());
          return;
        }

        // Get the first institution
        const institution = institutions[0];

        // Get departments for this institution
        const departments = await DepartmentService.getDepartmentsByInstitution(
          institution.id
        );

        if (departments.length === 0) {
          setInstructions(getDefaultInstructions());
          setSampleData(getDefaultSampleData());
          return;
        }

        // Create instructions with real IDs
        const instructionsWithRealData = [
          ['Instructions for filling the template:'],
          [''],
          ['⚠️ IMPORTANT - READ CAREFULLY ⚠️'],
          [
            'You MUST use the exact institution and department IDs listed below.'
          ],
          ['Do NOT use any example IDs that are not listed in this template.'],
          ['Using incorrect IDs will result in validation errors.'],
          [''],
          ['1. Institution ID:'],
          ['   - Must be a valid UUID of an existing institution'],
          [`   - Example: ${institution.id} (${institution.name})`],
          [''],
          ['2. Department ID:'],
          [
            '   - Must be a valid UUID of a department that exists in the specified institution'
          ],
          [
            `   - Example: ${departments[0].id} (${departments[0].department_name})`
          ],
          [''],
          ['3. Course Code:'],
          ['   - Must be unique within the department'],
          [
            '   - Use only uppercase letters, numbers, underscores, and hyphens'
          ],
          ['   - Example: CS8601'],
          [''],
          ['4. Course Name:'],
          ['   - Full name of the course'],
          ['   - Example: Advanced Data Structures and Algorithms'],
          [''],
          ['Note:'],
          ['- All fields are required'],
          ['- The department must belong to the specified institution'],
          ['- Institution must exist and be active'],
          ['- Department must exist and be active'],
          ['- Course codes must be unique within a department'],
          [''],
          ['Available Institutions:'],
          ...institutions.map((inst) => [
            `${inst.name} (${inst.counselling_code}): ${inst.id}`
          ]),
          [''],
          ['Available Departments:'],
          ...departments.map((dept) => [
            `${dept.department_name} (${dept.department_code}): ${dept.id} - Institution: ${institution.name}`
          ])
        ];

        // Create sample data with real IDs
        const realSampleData = [
          {
            institution_id: institution.id,
            department_id: departments[0].id,
            course_code: 'CS8601',
            course_name: 'Advanced Data Structures and Algorithms'
          },
          {
            institution_id: institution.id,
            department_id: departments[0].id,
            course_code: 'CS8602',
            course_name: 'Compiler Design'
          }
        ];

        setInstructions(instructionsWithRealData);
        setSampleData(realSampleData);
      } catch (error) {
        console.error('Error fetching data for template:', error);
        setInstructions(getDefaultInstructions());
        setSampleData(getDefaultSampleData());
      }
    };

    fetchData();
  }, []);

  const getDefaultInstructions = () => {
    return [
      ['Instructions for filling the template:'],
      [''],
      ['⚠️ WARNING - UNABLE TO FETCH REAL INSTITUTION IDs ⚠️'],
      ['The system could not fetch real institution IDs from the database.'],
      ['Please contact your administrator or try again later.'],
      ['DO NOT use the example UUIDs below as they will not work!'],
      [''],
      ['1. Institution ID:'],
      ['   - Must be a valid UUID of an existing institution'],
      ['   - Example: 9c1554e8-12a2-4b76-a9d6-8242bb05eba1'],
      [''],
      ['2. Department ID:'],
      [
        '   - Must be a valid UUID of a department that exists in the specified institution'
      ],
      ['   - Example: 7646521a-a252-4756-bd8f-ba7c1d36ff56'],
      [''],
      ['3. Course Code:'],
      ['   - Must be unique within the department'],
      ['   - Use only uppercase letters, numbers, underscores, and hyphens'],
      ['   - Example: CS8601'],
      [''],
      ['4. Course Name:'],
      ['   - Full name of the course'],
      ['   - Example: Advanced Data Structures and Algorithms'],
      [''],
      ['Note:'],
      ['- All fields are required'],
      ['- The department must belong to the specified institution'],
      ['- Institution must exist and be active'],
      ['- Department must exist and be active'],
      ['- Course codes must be unique within a department']
    ];
  };

  const getDefaultSampleData = () => {
    return [
      {
        institution_id: '9c1554e8-12a2-4b76-a9d6-8242bb05eba1',
        department_id: '7646521a-a252-4756-bd8f-ba7c1d36ff56',
        course_code: 'CS8601',
        course_name: 'Advanced Data Structures and Algorithms'
      },
      {
        institution_id: '9c1554e8-12a2-4b76-a9d6-8242bb05eba1',
        department_id: '7646521a-a252-4756-bd8f-ba7c1d36ff56',
        course_code: 'CS8602',
        course_name: 'Compiler Design'
      }
    ];
  };

  const handleDownload = async () => {
    try {
      setIsLoading(true);

      // Create workbook
      const wb = XLSX.utils.book_new();

      // Create instructions sheet
      const instructionsWs = XLSX.utils.aoa_to_sheet(instructions);

      // Set column width for instructions
      instructionsWs['!cols'] = [{ wch: 100 }];

      // Create main template sheet
      const ws = XLSX.utils.json_to_sheet(sampleData, {
        header: [
          'institution_id',
          'department_id',
          'course_code',
          'course_name'
        ]
      });

      // Set column widths
      ws['!cols'] = [
        { wch: COLUMN_WIDTHS.A },
        { wch: COLUMN_WIDTHS.B },
        { wch: COLUMN_WIDTHS.C },
        { wch: COLUMN_WIDTHS.D }
      ];

      // Add sheets to workbook
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `course_upload_template_${timestamp}.xlsx`;

      // Save the file
      XLSX.writeFile(wb, fileName);
      toast.success('Template downloaded successfully');
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Failed to download template');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant='outline'
      onClick={handleDownload}
      className='w-full sm:w-auto'
      disabled={isLoading}
    >
      <FileDown className='mr-2 h-4 w-4' />
      {isLoading ? 'Preparing...' : 'Download Template'}
    </Button>
  );
}
