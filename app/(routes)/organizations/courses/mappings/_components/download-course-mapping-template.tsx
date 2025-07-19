'use client';

import { useState, useEffect } from 'react';
import { FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { CourseService } from '@/lib/services/organization/course-service';
import { toast } from 'react-hot-toast';

const COLUMN_WIDTHS = {
  A: 40, // institution_name
  B: 40, // degree_name
  C: 40, // department_name
  D: 50, // program_name
  E: 20, // semester_name
  F: 20 // course_code
};

export default function DownloadCourseMappingTemplateButton() {
  const [isLoading, setIsLoading] = useState(false);

  const generateInstructions = async (): Promise<string[][]> => {
    try {
      const institutions = await OrganizationService.getInstitutionNames(true);
      if (institutions.length === 0) {
        return [['⚠️ No active institutions found. Please create them first.']];
      }
      const firstInstitution = institutions[0];

      return [
        ['Instructions for filling the template:'],
        [''],
        ['⚠️ IMPORTANT - READ CAREFULLY ⚠️'],
        [
          'You MUST use the exact names for institutions, degrees, departments, etc., as they appear in the system.'
        ],
        ['Using incorrect names will result in validation errors.'],
        [''],
        ['1. institution_name:'],
        ['   - Must match an existing active institution name exactly.'],
        [`   - Example: ${firstInstitution.name}`],
        [''],
        ['2. degree_name:'],
        ['   - Must be a valid degree within the specified institution.'],
        [''],
        ['3. department_name:'],
        ['   - Must be a valid department within the specified degree.'],
        [''],
        ['4. program_name:'],
        ['   - Must be a valid program within the specified department.'],
        [''],
        ['5. semester_name:'],
        ['   - Must be a valid semester within the specified program.'],
        [''],
        ['6. course_code:'],
        [
          '   - Must be a valid, unmapped course code for the specified institution.'
        ],
        [''],
        ['Available Institutions:'],
        ...institutions.map((inst) => [
          `${inst.name} (${inst.counselling_code})`
        ])
      ];
    } catch (error) {
      console.error('Error fetching data for instructions:', error);
      return [
        [
          '⚠️ Error: Could not fetch validation data. Please check your connection and try again.'
        ]
      ];
    }
  };

  const generateSampleData = async (): Promise<any[]> => {
    try {
      const institutions = await OrganizationService.getInstitutionNames(true);
      if (institutions.length === 0) return [];

      const instId = institutions[0].id;
      const degrees = await DegreeService.getDegreesByInstitution(instId);
      if (degrees.length === 0) return [];

      const degId = degrees[0].id;
      const departments =
        await DepartmentService.getDepartmentsByInstitutionAndDegree(
          instId,
          degId
        );
      if (departments.length === 0) return [];

      const deptId = departments[0].id;
      const { data: programs } = await ProgramService.getPrograms({
        department_id: deptId,
        isActive: true
      });
      if (programs.length === 0) return [];

      const progId = programs[0].id;
      const { data: semesters } = await SemesterService.getSemesters({
        program_id: progId,
        isActive: true
      });
      if (semesters.length === 0) return [];

      const semId = semesters[0].id;
      const { data: courses } = await CourseService.getCourses({
        institution_id: instId,
        limit: 3
      });

      return courses.map((course) => ({
        institution_name: institutions[0].name,
        degree_name: degrees[0].degree_name,
        department_name: departments[0].department_name,
        program_name: programs[0].program_name,
        semester_name: semesters[0].semester_name,
        course_code: course.course_code
      }));
    } catch (error) {
      console.error('Error generating sample data:', error);
      return [
        {
          institution_name: 'Sample Institution',
          degree_name: 'Sample Degree',
          department_name: 'Sample Department',
          program_name: 'Sample Program',
          semester_name: 'Sample Semester',
          course_code: 'SAMPLE101'
        }
      ];
    }
  };

  const handleDownload = async () => {
    try {
      setIsLoading(true);

      const [instructions, sampleData] = await Promise.all([
        generateInstructions(),
        generateSampleData()
      ]);

      const wb = XLSX.utils.book_new();

      const instructionsWs = XLSX.utils.aoa_to_sheet(instructions);
      instructionsWs['!cols'] = [{ wch: 100 }];
      XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

      const ws = XLSX.utils.json_to_sheet(sampleData, {
        header: [
          'institution_name',
          'degree_name',
          'department_name',
          'program_name',
          'semester_name',
          'course_code'
        ]
      });
      ws['!cols'] = [
        { wch: COLUMN_WIDTHS.A },
        { wch: COLUMN_WIDTHS.B },
        { wch: COLUMN_WIDTHS.C },
        { wch: COLUMN_WIDTHS.D },
        { wch: COLUMN_WIDTHS.E },
        { wch: COLUMN_WIDTHS.F }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Template');

      const timestamp = new Date().toISOString().split('T')[0];
      const fileName = `course_mapping_template_${timestamp}.xlsx`;

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
