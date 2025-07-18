'use client';

import { useState, useEffect } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { toast } from 'react-hot-toast';

const COLUMN_WIDTHS = {
  A: 40, // institution_name
  B: 15, // course_code
  C: 50 // course_name
};

export default function DownloadCourseTemplateButton() {
  const [isLoading, setIsLoading] = useState(false);
  const [instructions, setInstructions] = useState<string[][]>([]);
  const [sampleData, setSampleData] = useState<any[]>([]);

  useEffect(() => {
    // Fetch real institution data for instructions
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

        // Get the first few institutions for examples
        const firstInstitution = institutions[0];

        // Create instructions with real institution names
        const instructionsWithRealData = [
          ['Instructions for filling the template:'],
          [''],
          ['⚠️ IMPORTANT - READ CAREFULLY ⚠️'],
          ['You MUST use the exact institution names listed below.'],
          ['Institution names are case-insensitive but must match exactly.'],
          ['Using incorrect names will result in validation errors.'],
          [''],
          ['1. Institution Name:'],
          ['   - Must match an existing active institution name exactly'],
          [`   - Example: ${firstInstitution.name}`],
          [
            '   - Case-insensitive matching (e.g., "jkkn college" = "JKKN College")'
          ],
          [''],
          ['2. Course Code:'],
          ['   - Must be unique within the institution'],
          [
            '   - Use only uppercase letters, numbers, underscores, and hyphens'
          ],
          ['   - Example: CS8601, ENG101, MATH-201'],
          [''],
          ['3. Course Name:'],
          ['   - Full name of the course'],
          ['   - Example: Advanced Data Structures and Algorithms'],
          [''],
          ['Note:'],
          ['- All fields are required'],
          ['- Institution must exist and be active'],
          ['- Course codes must be unique within an institution'],
          ['- Institution names will be automatically resolved to IDs'],
          [''],
          ['Available Institution Names:'],
          ...institutions.map((inst) => [
            `${inst.name} (${inst.counselling_code})`
          ])
        ];

        // Create sample data with real institution names
        const realSampleData = [
          {
            institution_name: firstInstitution.name,
            course_code: 'CS8601',
            course_name: 'Advanced Data Structures and Algorithms'
          },
          {
            institution_name: firstInstitution.name,
            course_code: 'CS8602',
            course_name: 'Compiler Design'
          }
        ];

        // Add more samples if we have multiple institutions
        if (institutions.length > 1) {
          const secondInstitution = institutions[1];
          realSampleData.push({
            institution_name: secondInstitution.name,
            course_code: 'BIO101',
            course_name: 'Introduction to Biology'
          });
        }

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
      ['⚠️ WARNING - UNABLE TO FETCH REAL INSTITUTION NAMES ⚠️'],
      ['The system could not fetch real institution names from the database.'],
      ['Please contact your administrator or try again later.'],
      ['DO NOT use the example names below as they may not work!'],
      [''],
      ['1. Institution Name:'],
      ['   - Must match an existing active institution name exactly'],
      ['   - Example: JKKN College of Engineering and Technology'],
      ['   - Case-insensitive matching'],
      [''],
      ['2. Course Code:'],
      ['   - Must be unique within the institution'],
      ['   - Use only uppercase letters, numbers, underscores, and hyphens'],
      ['   - Example: CS8601'],
      [''],
      ['3. Course Name:'],
      ['   - Full name of the course'],
      ['   - Example: Advanced Data Structures and Algorithms'],
      [''],
      ['Note:'],
      ['- All fields are required'],
      ['- Institution must exist and be active'],
      ['- Course codes must be unique within an institution']
    ];
  };

  const getDefaultSampleData = () => {
    return [
      {
        institution_name: 'JKKN College of Engineering and Technology',
        course_code: 'CS8601',
        course_name: 'Advanced Data Structures and Algorithms'
      },
      {
        institution_name: 'JKKN College of Engineering and Technology',
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
        header: ['institution_name', 'course_code', 'course_name']
      });

      // Set column widths
      ws['!cols'] = [
        { wch: COLUMN_WIDTHS.A },
        { wch: COLUMN_WIDTHS.B },
        { wch: COLUMN_WIDTHS.C }
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
