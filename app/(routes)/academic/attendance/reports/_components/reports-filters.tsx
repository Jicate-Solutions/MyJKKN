'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Filter, X } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { AttendanceReportsSearchParams } from './data-table-schema';
import { useDepartments } from '@/hooks/organization/use-departments';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '@/components/ui/collapsible';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAcademicYearsByInstitution } from '@/hooks/academic/use-academic-years';

interface ReportsFiltersProps {
  searchParams: AttendanceReportsSearchParams;
  onFilterChange: (key: string, value: string | undefined) => void;
  onClearFilters: () => void;
}

export function ReportsFilters({
  searchParams,
  onFilterChange,
  onClearFilters
}: ReportsFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Organization data hooks with refetch capabilities (matching attendance filter pattern)
  const { institutions: institutionsData, refetch: fetchInstitutions } =
    useInstitutionsWithAccess({});

  // Academic years filtered by institution - using the proper hook pattern
  const {
    academicYears: academicYearsData,
    error: academicYearsError,
    loading: academicYearsLoading
  } = useAcademicYearsByInstitution(searchParams.institution_id || undefined);

  // Degrees filtered by institution only
  const { data: degreesData, refetch: fetchDegrees } = useDegrees({
    institution_id: searchParams.institution_id || undefined
  });

  // Departments filtered by institution and degree
  const { data: departmentsData, refetch: fetchDepartments } = useDepartments({
    institution_id: searchParams.institution_id || undefined,
    degree_id: searchParams.degree_id || undefined
  });

  // Programs filtered by institution, department, and degree
  const { data: programsData, refetch: fetchPrograms } = usePrograms({
    institution_id: searchParams.institution_id || undefined,
    department_id: searchParams.department_id || undefined,
    degree_id: searchParams.degree_id || undefined
  });

  // Semesters filtered by institution, degree, department, and program
  const { data: semestersData, refetch: fetchSemesters } = useSemesters({
    institution_id: searchParams.institution_id || undefined,
    degree_id: searchParams.degree_id || undefined,
    department_id: searchParams.department_id || undefined,
    program_id: searchParams.program_id || undefined
  });

  // Sections filtered by all parent fields
  const { data: sectionsData, refetch: fetchSections } = useSections({
    institution_id: searchParams.institution_id || undefined,
    degree_id: searchParams.degree_id || undefined,
    department_id: searchParams.department_id || undefined,
    program_id: searchParams.program_id || undefined,
    semester_id: searchParams.semester_id || undefined
  });

  // Load initial data
  useEffect(() => {
    fetchInstitutions();
  }, [fetchInstitutions]);

  // Academic years are now auto-fetched by the hook when institution_id changes

  // Load degrees when institution changes
  useEffect(() => {
    if (searchParams.institution_id) {
      fetchDegrees();
    }
  }, [searchParams.institution_id, fetchDegrees]);

  // Load departments when degree changes
  useEffect(() => {
    if (searchParams.institution_id && searchParams.degree_id) {
      fetchDepartments();
    }
  }, [searchParams.institution_id, searchParams.degree_id, fetchDepartments]);

  // Load programs when department changes
  useEffect(() => {
    if (
      searchParams.institution_id &&
      searchParams.degree_id &&
      searchParams.department_id
    ) {
      fetchPrograms();
    }
  }, [
    searchParams.institution_id,
    searchParams.degree_id,
    searchParams.department_id,
    fetchPrograms
  ]);

  // Load semesters when program changes
  useEffect(() => {
    if (
      searchParams.institution_id &&
      searchParams.degree_id &&
      searchParams.department_id &&
      searchParams.program_id
    ) {
      fetchSemesters();
    }
  }, [
    searchParams.institution_id,
    searchParams.degree_id,
    searchParams.department_id,
    searchParams.program_id,
    fetchSemesters
  ]);

  // Load sections when semester changes
  useEffect(() => {
    if (
      searchParams.institution_id &&
      searchParams.degree_id &&
      searchParams.program_id &&
      searchParams.department_id &&
      searchParams.semester_id
    ) {
      fetchSections();
    }
  }, [
    searchParams.institution_id,
    searchParams.degree_id,
    searchParams.program_id,
    searchParams.department_id,
    searchParams.semester_id,
    fetchSections
  ]);

  // Handle data extraction with proper fallbacks
  const institutions = institutionsData || [];
  const academicYears = academicYearsData || []; // academicYearsData is already an array
  const degrees = degreesData?.data || [];
  const departments = departmentsData?.data || [];
  const programs = programsData?.data || [];
  const semesters = semestersData?.data || [];
  const sections = sectionsData?.data || [];

  const handleDateRangeChange = (range: any) => {
    if (range && range.from && range.to) {
      onFilterChange(
        'dateRange',
        JSON.stringify({
          from: range.from.toISOString(),
          to: range.to.toISOString()
        })
      );
    } else {
      onFilterChange('dateRange', undefined);
    }
  };

  // Handle hierarchical field changes with child field resets (matching attendance filter pattern)
  const handleHierarchicalChange = (
    field: string,
    value: string | undefined
  ) => {
    const finalValue = value === 'all' ? undefined : value;

    // Handle specific field changes with proper child reset
    switch (field) {
      case 'institution_id':
        onFilterChange('institution_id', finalValue);
        onFilterChange('academic_year_id', undefined);
        onFilterChange('degree_id', undefined);
        onFilterChange('department_id', undefined);
        onFilterChange('program_id', undefined);
        onFilterChange('semester_id', undefined);
        onFilterChange('section_id', undefined);
        break;
      case 'academic_year_id':
        onFilterChange('academic_year_id', finalValue);
        break;
      case 'degree_id':
        onFilterChange('degree_id', finalValue);
        onFilterChange('department_id', undefined);
        onFilterChange('program_id', undefined);
        onFilterChange('semester_id', undefined);
        onFilterChange('section_id', undefined);
        break;
      case 'department_id':
        onFilterChange('department_id', finalValue);
        onFilterChange('program_id', undefined);
        onFilterChange('semester_id', undefined);
        onFilterChange('section_id', undefined);
        break;
      case 'program_id':
        onFilterChange('program_id', finalValue);
        onFilterChange('semester_id', undefined);
        onFilterChange('section_id', undefined);
        break;
      case 'semester_id':
        onFilterChange('semester_id', finalValue);
        onFilterChange('section_id', undefined);
        break;
      case 'section_id':
        onFilterChange('section_id', finalValue);
        break;
      default:
        onFilterChange(field, finalValue);
        break;
    }
  };

  const hasActiveFilters =
    searchParams.institution_id ||
    searchParams.academic_year_id ||
    searchParams.degree_id ||
    searchParams.department_id ||
    searchParams.program_id ||
    searchParams.semester_id ||
    searchParams.section_id ||
    searchParams.faculty_id ||
    searchParams.attendance_status ||
    searchParams.attendance_threshold ||
    searchParams.dateRange;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className='flex items-center justify-between'>
        <CollapsibleTrigger asChild>
          <Button variant='outline' className='flex items-center gap-2'>
            <Filter className='h-4 w-4' />
            Filters
            {hasActiveFilters && (
              <span className='ml-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground'>
                {Object.values(searchParams).filter(Boolean).length}
              </span>
            )}
          </Button>
        </CollapsibleTrigger>

        {hasActiveFilters && (
          <Button
            variant='ghost'
            size='sm'
            onClick={onClearFilters}
            className='h-8 px-2 lg:px-3'
          >
            <X className='h-4 w-4 mr-1' />
            Clear
          </Button>
        )}
      </div>

      <CollapsibleContent className='space-y-2'>
        <Card className='mt-4'>
          <CardHeader>
            <CardTitle>Filter Options</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {/* Date Range */}
              <div className='space-y-2'>
                <Label>Date Range</Label>
                <DatePickerWithRange
                  value={searchParams.dateRange}
                  onChange={handleDateRangeChange}
                />
              </div>

              {/* Institution */}
              <div className='space-y-2'>
                <Label htmlFor='institution'>Institution</Label>
                <Select
                  value={searchParams.institution_id || 'all'}
                  onValueChange={(value) =>
                    handleHierarchicalChange('institution_id', value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select institution' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Institutions</SelectItem>
                    {institutions.map((institution: any) => (
                      <SelectItem key={institution.id} value={institution.id}>
                        {institution.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Academic Year */}
              <div className='space-y-2'>
                <Label htmlFor='academic_year'>Academic Year</Label>
                <Select
                  value={searchParams.academic_year_id || 'all'}
                  onValueChange={(value) =>
                    handleHierarchicalChange('academic_year_id', value)
                  }
                  disabled={
                    !searchParams.institution_id || academicYearsLoading
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        academicYearsLoading
                          ? 'Loading academic years...'
                          : academicYearsError
                          ? 'Error loading academic years'
                          : 'Select academic year'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Academic Years</SelectItem>
                    {academicYearsError ? (
                      <SelectItem value='error' disabled>
                        Error loading academic years
                      </SelectItem>
                    ) : (
                      academicYearsData.map((year: any) => (
                        <SelectItem key={year.id} value={year.id}>
                          {year.academic_year_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {academicYearsError && (
                  <p className='text-sm text-red-600'>{academicYearsError}</p>
                )}
              </div>

              {/* Degree */}
              <div className='space-y-2'>
                <Label htmlFor='degree'>Degree</Label>
                <Select
                  value={searchParams.degree_id || 'all'}
                  onValueChange={(value) =>
                    handleHierarchicalChange('degree_id', value)
                  }
                  disabled={!searchParams.institution_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select degree' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Degrees</SelectItem>
                    {degrees.map((degree: any) => (
                      <SelectItem key={degree.id} value={degree.id}>
                        {degree.degree_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Department */}
              <div className='space-y-2'>
                <Label htmlFor='department'>Department</Label>
                <Select
                  value={searchParams.department_id || 'all'}
                  onValueChange={(value) =>
                    handleHierarchicalChange('department_id', value)
                  }
                  disabled={!searchParams.degree_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select department' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Departments</SelectItem>
                    {departments.map((department: any) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.department_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Program */}
              <div className='space-y-2'>
                <Label htmlFor='program'>Program</Label>
                <Select
                  value={searchParams.program_id || 'all'}
                  onValueChange={(value) =>
                    handleHierarchicalChange('program_id', value)
                  }
                  disabled={!searchParams.department_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select program' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Programs</SelectItem>
                    {programs.map((program: any) => (
                      <SelectItem key={program.id} value={program.id}>
                        {program.program_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Semester */}
              <div className='space-y-2'>
                <Label htmlFor='semester'>Semester</Label>
                <Select
                  value={searchParams.semester_id || 'all'}
                  onValueChange={(value) =>
                    handleHierarchicalChange('semester_id', value)
                  }
                  disabled={!searchParams.program_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select semester' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Semesters</SelectItem>
                    {semesters.map((semester: any) => (
                      <SelectItem key={semester.id} value={semester.id}>
                        {semester.semester_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Section */}
              <div className='space-y-2'>
                <Label htmlFor='section'>Section</Label>
                <Select
                  value={searchParams.section_id || 'all'}
                  onValueChange={(value) =>
                    handleHierarchicalChange('section_id', value)
                  }
                  disabled={!searchParams.semester_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select section' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Sections</SelectItem>
                    {sections.map((section: any) => (
                      <SelectItem key={section.id} value={section.id}>
                        Section {section.section_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Attendance Status */}
              <div className='space-y-2'>
                <Label htmlFor='status'>Status</Label>
                <Select
                  value={searchParams.attendance_status || 'all'}
                  onValueChange={(value) =>
                    onFilterChange(
                      'attendance_status',
                      value === 'all' ? undefined : value
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select status' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Status</SelectItem>
                    <SelectItem value='completed'>Completed</SelectItem>
                    <SelectItem value='pending'>Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Attendance Threshold */}
              <div className='space-y-2'>
                <Label htmlFor='threshold'>Min. Attendance (%)</Label>
                <Input
                  id='threshold'
                  type='number'
                  min='0'
                  max='100'
                  placeholder='e.g. 75'
                  value={searchParams.attendance_threshold || ''}
                  onChange={(e) =>
                    onFilterChange(
                      'attendance_threshold',
                      e.target.value || undefined
                    )
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}
