'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import { StudentsSearchParams } from './data-table-schema';
import { usePermissions } from '@/hooks/use-permissions';
import { ExportStudents } from './export-students';
import { BulkCreateStudents } from './bulk-create-students';
import { DownloadNewStudentTemplateButton } from './download-new-student-template-button';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';

interface StudentFiltersProps {
  searchParams: StudentsSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function StudentFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: StudentFiltersProps) {
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();
  const router = useRouter();
  const currentSearchParams = useSearchParams();

  // State for dropdown options
  const [institutions, setInstitutions] = useState<any[]>([]);
  const [degrees, setDegrees] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [programs, setPrograms] = useState<any[]>([]);
  const [semesters, setSemesters] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);

  // Loading states
  const [loadingDegrees, setLoadingDegrees] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingPrograms, setLoadingPrograms] = useState(false);
  const [loadingSemesters, setLoadingSemesters] = useState(false);
  const [loadingSections, setLoadingSections] = useState(false);

  // Helper function to handle multiple filter changes
  const handleMultipleFilterChanges = (
    changes: Record<string, string | undefined>
  ) => {
    const params = new URLSearchParams(currentSearchParams);

    // Apply all changes
    Object.entries(changes).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    });

    // Reset to page 1
    params.set('page', '1');

    // Navigate with client-side routing
    router.push(`/students?${params.toString()}`);
  };

  // Fetch institutions on component mount
  useEffect(() => {
    const fetchInstitutions = async () => {
      try {
        const response = await OrganizationService.getInstitutions({
          page: 1,
          limit: 1000,
          isActive: true
        });
        setInstitutions(response.data || []);
      } catch (error) {
        console.error('Error fetching institutions:', error);
        setInstitutions([]);
      }
    };

    fetchInstitutions();
  }, []);

  // Fetch degrees when institution changes
  useEffect(() => {
    const fetchDegrees = async () => {
      if (!searchParams.institution_id) {
        setDegrees([]);
        return;
      }

      try {
        setLoadingDegrees(true);
        const response = await DegreeService.getDegrees({
          institution_id: searchParams.institution_id,
          page: 1,
          limit: 1000,
          isActive: true
        });
        setDegrees(response.data || []);
      } catch (error) {
        console.error('Error fetching degrees:', error);
        setDegrees([]);
      } finally {
        setLoadingDegrees(false);
      }
    };

    fetchDegrees();
  }, [searchParams.institution_id]);

  // Fetch departments when institution changes
  useEffect(() => {
    const fetchDepartments = async () => {
      if (!searchParams.institution_id) {
        setDepartments([]);
        return;
      }

      try {
        setLoadingDepartments(true);
        const response = await DepartmentService.getDepartments({
          institution_id: searchParams.institution_id,
          page: 1,
          limit: 1000,
          isActive: true
        });
        setDepartments(response.data || []);
      } catch (error) {
        console.error('Error fetching departments:', error);
        setDepartments([]);
      } finally {
        setLoadingDepartments(false);
      }
    };

    fetchDepartments();
  }, [searchParams.institution_id]);

  // Fetch programs when degree or department changes
  useEffect(() => {
    const fetchPrograms = async () => {
      if (!searchParams.degree_id && !searchParams.department_id) {
        setPrograms([]);
        return;
      }

      try {
        setLoadingPrograms(true);
        const filters: any = {
          page: 1,
          limit: 1000
        };

        if (searchParams.degree_id) {
          filters.degree_id = searchParams.degree_id;
        }
        if (searchParams.department_id) {
          filters.department_id = searchParams.department_id;
        }

        const response = await ProgramService.getPrograms({
          ...filters,
          isActive: true
        });
        setPrograms(response.data || []);
      } catch (error) {
        console.error('Error fetching programs:', error);
        setPrograms([]);
      } finally {
        setLoadingPrograms(false);
      }
    };

    fetchPrograms();
  }, [searchParams.degree_id, searchParams.department_id]);

  // Fetch semesters when program changes
  useEffect(() => {
    const fetchSemesters = async () => {
      if (!searchParams.program_id) {
        setSemesters([]);
        return;
      }

      try {
        setLoadingSemesters(true);
        // Fetch semesters that actually have students in the selected program
        // This works around data inconsistency where students are assigned to semesters from different programs
        const semesterData =
          await SemesterService.getSemestersByProgramWithStudents(
            searchParams.program_id
          );
        setSemesters(semesterData || []);
      } catch (error) {
        console.error('Error fetching semesters:', error);
        setSemesters([]);
      } finally {
        setLoadingSemesters(false);
      }
    };

    fetchSemesters();
  }, [searchParams.program_id]);

  // Fetch sections when semester changes
  useEffect(() => {
    const fetchSections = async () => {
      if (!searchParams.semester_id) {
        setSections([]);
        return;
      }

      try {
        setLoadingSections(true);
        const response = await SectionService.getSections({
          semester_id: searchParams.semester_id,
          page: 1,
          limit: 1000,
          isActive: true
        });
        setSections(response.data || []);
      } catch (error) {
        console.error('Error fetching sections:', error);
        setSections([]);
      } finally {
        setLoadingSections(false);
      }
    };

    fetchSections();
  }, [searchParams.semester_id]);

  // Hierarchical filter change handlers that reset child filters
  const handleInstitutionChange = (value: string) => {
    const institutionId = value === 'all' ? undefined : value;

    handleMultipleFilterChanges({
      institution_id: institutionId,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    });
  };

  const handleDegreeChange = (value: string) => {
    const degreeId = value === 'all' ? undefined : value;

    handleMultipleFilterChanges({
      degree_id: degreeId,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    });
  };

  const handleDepartmentChange = (value: string) => {
    const departmentId = value === 'all' ? undefined : value;

    handleMultipleFilterChanges({
      department_id: departmentId,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    });
  };

  const handleProgramChange = (value: string) => {
    const programId = value === 'all' ? undefined : value;

    handleMultipleFilterChanges({
      program_id: programId,
      semester_id: undefined,
      section_id: undefined
    });
  };

  const handleSemesterChange = (value: string) => {
    const semesterId = value === 'all' ? undefined : value;

    handleMultipleFilterChanges({
      semester_id: semesterId,
      section_id: undefined
    });
  };

  const handleSectionChange = (value: string) => {
    const sectionId = value === 'all' ? undefined : value;
    onFilterChange('section_id', sectionId);
  };

  return (
    <div className='space-y-4'>
      {/* Advanced Filters Toggle and Clear Button */}
      <div className='flex flex-col sm:flex-row gap-4 justify-between items-start'>
        <Collapsible
          open={showAdvancedFilters}
          onOpenChange={setShowAdvancedFilters}
          className='flex-1'
        >
          <CollapsibleTrigger asChild>
            <Button variant='outline' className='w-full justify-between'>
              Advanced Filters
              {showAdvancedFilters ? (
                <ChevronUp className='h-4 w-4' />
              ) : (
                <ChevronDown className='h-4 w-4' />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className='space-y-4 pt-4'>
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
              {/* Institution Filter */}
              <Select
                value={searchParams.institution_id || ''}
                onValueChange={handleInstitutionChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select Institution' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Institutions</SelectItem>
                  {institutions.map((institution) => (
                    <SelectItem key={institution.id} value={institution.id}>
                      {institution.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Degree Filter */}
              <Select
                value={searchParams.degree_id || ''}
                onValueChange={handleDegreeChange}
                disabled={!searchParams.institution_id || loadingDegrees}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingDegrees ? 'Loading...' : 'Select Degree'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Degrees</SelectItem>
                  {degrees.map((degree) => (
                    <SelectItem key={degree.id} value={degree.id}>
                      {degree.degree_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Department Filter */}
              <Select
                value={searchParams.department_id || ''}
                onValueChange={handleDepartmentChange}
                disabled={!searchParams.institution_id || loadingDepartments}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingDepartments ? 'Loading...' : 'Select Department'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Departments</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Program Filter */}
              <Select
                value={searchParams.program_id || ''}
                onValueChange={handleProgramChange}
                disabled={
                  (!searchParams.degree_id && !searchParams.department_id) ||
                  loadingPrograms
                }
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingPrograms ? 'Loading...' : 'Select Program'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Programs</SelectItem>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.program_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Semester Filter */}
              <Select
                value={searchParams.semester_id || ''}
                onValueChange={handleSemesterChange}
                disabled={!searchParams.program_id || loadingSemesters}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingSemesters ? 'Loading...' : 'Select Semester'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Semesters</SelectItem>
                  {semesters.map((semester) => (
                    <SelectItem key={semester.id} value={semester.id}>
                      {semester.semester_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Section Filter */}
              <Select
                value={searchParams.section_id || ''}
                onValueChange={handleSectionChange}
                disabled={!searchParams.semester_id || loadingSections}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      loadingSections ? 'Loading...' : 'Select Section'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Sections</SelectItem>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.section_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Status Filter */}
              <Select
                value={searchParams.status || ''}
                onValueChange={(value) =>
                  onFilterChange('status', value === 'all' ? undefined : value)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='All Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Status</SelectItem>
                  <SelectItem value='active'>Active</SelectItem>
                  <SelectItem value='inactive'>Inactive</SelectItem>
                  <SelectItem value='pending'>Pending</SelectItem>
                  <SelectItem value='exited'>Exited</SelectItem>
                  <SelectItem value='graduated'>Graduated</SelectItem>
                </SelectContent>
              </Select>

              {/* Profile Status Filter */}
              <Select
                value={
                  searchParams.is_profile_complete === undefined
                    ? ''
                    : searchParams.is_profile_complete.toString()
                }
                onValueChange={(value) =>
                  onFilterChange(
                    'is_profile_complete',
                    value === 'all' ? undefined : value
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Profile Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Profiles</SelectItem>
                  <SelectItem value='true'>Complete</SelectItem>
                  <SelectItem value='false'>Incomplete</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Clear Filters Button inside Advanced Filters */}
            <div className='flex justify-start pt-2'>
              <Button variant='outline' onClick={onClearFilters}>
                <RotateCcw className='mr-2 h-4 w-4' />
                Clear All Filters
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Action Buttons */}
      <div className='flex flex-col sm:flex-row gap-2'>
        {isSuperAdmin && <ExportStudents />}
        {isSuperAdmin && <BulkCreateStudents />}
        {isSuperAdmin && <DownloadNewStudentTemplateButton />}
      </div>
    </div>
  );
}
