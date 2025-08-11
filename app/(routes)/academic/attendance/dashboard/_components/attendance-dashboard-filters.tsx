'use client';

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  useInstitutions,
  useDegrees,
  useDepartments,
  usePrograms,
  useSemesters,
  useSections
} from '@/hooks/academic/use-attendance-analytics';

interface AnalyticsFilters {
  institution_id: string;
  start_date: string;
  end_date: string;
  degree_id?: string;
  program_id?: string;
  department_id?: string;
  semester_id?: string;
  section_id?: string;
}

interface AttendanceDashboardFiltersProps {
  filters: AnalyticsFilters;
  onFilterChange: (filters: Partial<AnalyticsFilters>) => void;
}

export function AttendanceDashboardFilters({
  filters,
  onFilterChange
}: AttendanceDashboardFiltersProps) {

  // Data fetching hooks with dependency chain
  const { data: institutions, isLoading: institutionsLoading } =
    useInstitutions();
  const { data: degrees, isLoading: degreesLoading } = useDegrees(
    filters.institution_id,
    !!filters.institution_id
  );
  const { data: departments, isLoading: departmentsLoading } = useDepartments(
    filters.degree_id || '',
    !!filters.degree_id
  );
  const { data: programs, isLoading: programsLoading } = usePrograms(
    filters.department_id || '',
    !!filters.department_id
  );
  const { data: semesters, isLoading: semestersLoading } = useSemesters(
    filters.program_id || '',
    !!filters.program_id
  );
  const { data: sections, isLoading: sectionsLoading } = useSections(
    filters.semester_id || '',
    !!filters.semester_id
  );

  // Reset child filters when parent changes
  const handleDegreeChange = (degree_id: string) => {
    onFilterChange({
      degree_id,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    });
  };

  const handleDepartmentChange = (department_id: string) => {
    onFilterChange({
      department_id,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined
    });
  };

  const handleProgramChange = (program_id: string) => {
    onFilterChange({
      program_id,
      semester_id: undefined,
      section_id: undefined
    });
  };

  const handleSemesterChange = (semester_id: string) => {
    onFilterChange({
      semester_id,
      section_id: undefined
    });
  };

  return (
    <div className='space-y-4'>
      {/* Academic Hierarchy Filters */}
      <div className='space-y-4'>
        <h4 className='text-sm font-medium'>Academic Filters</h4>

        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          {/* Institution Filter - Only for super admin */}
          <div className='space-y-2'>
            <Label>Institution</Label>
            <Select
              value={filters.institution_id}
              onValueChange={(value) =>
                onFilterChange({
                  institution_id: value,
                  degree_id: undefined,
                  department_id: undefined,
                  program_id: undefined,
                  semester_id: undefined,
                  section_id: undefined
                })
              }
              disabled={institutionsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select institution' />
              </SelectTrigger>
              <SelectContent>
                {institutionsLoading ? (
                  <SelectItem value='loading' disabled>
                    Loading institutions...
                  </SelectItem>
                ) : institutions && institutions.length > 0 ? (
                  institutions.map((institution) => (
                    <SelectItem key={institution.id} value={institution.id}>
                      {institution.name}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value='no-data' disabled>
                    No institutions found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Degree Filter */}
          <div className='space-y-2'>
            <Label>Degree</Label>
            <Select
              value={filters.degree_id || ''}
              onValueChange={handleDegreeChange}
              disabled={!filters.institution_id || degreesLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select degree' />
              </SelectTrigger>
              <SelectContent>
                {!filters.institution_id ? (
                  <SelectItem value='no-institution' disabled>
                    Select institution first
                  </SelectItem>
                ) : degreesLoading ? (
                  <SelectItem value='loading' disabled>
                    Loading degrees...
                  </SelectItem>
                ) : degrees && degrees.length > 0 ? (
                  degrees.map((degree) => (
                    <SelectItem key={degree.id} value={degree.id}>
                      {degree.name} ({degree.short_name})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value='no-data' disabled>
                    No degrees found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Department Filter */}
          <div className='space-y-2'>
            <Label>Department</Label>
            <Select
              value={filters.department_id || ''}
              onValueChange={handleDepartmentChange}
              disabled={!filters.degree_id || departmentsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select department' />
              </SelectTrigger>
              <SelectContent>
                {!filters.degree_id ? (
                  <SelectItem value='no-degree' disabled>
                    Select degree first
                  </SelectItem>
                ) : departmentsLoading ? (
                  <SelectItem value='loading' disabled>
                    Loading departments...
                  </SelectItem>
                ) : departments && departments.length > 0 ? (
                  departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name} ({department.code})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value='no-data' disabled>
                    No departments found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Program Filter */}
          <div className='space-y-2'>
            <Label>Program</Label>
            <Select
              value={filters.program_id || ''}
              onValueChange={handleProgramChange}
              disabled={!filters.department_id || programsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select program' />
              </SelectTrigger>
              <SelectContent>
                {!filters.department_id ? (
                  <SelectItem value='no-department' disabled>
                    Select department first
                  </SelectItem>
                ) : programsLoading ? (
                  <SelectItem value='loading' disabled>
                    Loading programs...
                  </SelectItem>
                ) : programs && programs.length > 0 ? (
                  programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name} ({program.code})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value='no-data' disabled>
                    No programs found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Semester Filter */}
          <div className='space-y-2'>
            <Label>Semester</Label>
            <Select
              value={filters.semester_id || ''}
              onValueChange={handleSemesterChange}
              disabled={!filters.program_id || semestersLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select semester' />
              </SelectTrigger>
              <SelectContent>
                {!filters.program_id ? (
                  <SelectItem value='no-program' disabled>
                    Select program first
                  </SelectItem>
                ) : semestersLoading ? (
                  <SelectItem value='loading' disabled>
                    Loading semesters...
                  </SelectItem>
                ) : semesters && semesters.length > 0 ? (
                  semesters.map((semester) => (
                    <SelectItem key={semester.id} value={semester.id}>
                      {semester.name} (Semester {semester.number})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value='no-data' disabled>
                    No semesters found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Section Filter */}
          <div className='space-y-2'>
            <Label>Section</Label>
            <Select
              value={filters.section_id || ''}
              onValueChange={(value) => onFilterChange({ section_id: value })}
              disabled={!filters.semester_id || sectionsLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select section' />
              </SelectTrigger>
              <SelectContent>
                {!filters.semester_id ? (
                  <SelectItem value='no-semester' disabled>
                    Select semester first
                  </SelectItem>
                ) : sectionsLoading ? (
                  <SelectItem value='loading' disabled>
                    Loading sections...
                  </SelectItem>
                ) : sections && sections.length > 0 ? (
                  sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name} ({section.code})
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value='no-data' disabled>
                    No sections found
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
