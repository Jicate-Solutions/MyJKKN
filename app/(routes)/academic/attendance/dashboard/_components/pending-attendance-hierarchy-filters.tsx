'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useAcademicYearsByInstitution } from '@/hooks/academic/use-academic-years';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RotateCcw, CalendarIcon, X, ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface PendingAttendanceHierarchyFiltersProps {
  filters: {
    institutionId?: string;
    academicYearId?: string;
    degreeId?: string;
    departmentId?: string;
    programId?: string;
    semesterId?: string;
    sectionId?: string;
    attendanceDate?: string;
  };
  onFiltersChange: (filters: any) => void;
  onReset: () => void;
  canViewAllInstitutions: boolean;
  userInstitutionId?: string;
  dashboardInstitutionId?: string;
  dashboardAcademicYearId?: string;
}

export function PendingAttendanceHierarchyFilters({
  filters,
  onFiltersChange,
  onReset,
  canViewAllInstitutions,
  userInstitutionId,
  dashboardInstitutionId,
  dashboardAcademicYearId
}: PendingAttendanceHierarchyFiltersProps) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  // Use dashboard filters as defaults
  const effectiveInstitutionId = dashboardInstitutionId || filters.institutionId || userInstitutionId;
  const effectiveAcademicYearId = dashboardAcademicYearId || filters.academicYearId;

  // Fetch data hooks
  const { institutions } = useInstitutionsWithAccess({});

  const { academicYears } = useAcademicYearsByInstitution(
    effectiveInstitutionId || undefined
  );

  const { data: degreesData } = useDegrees({
    institution_id: effectiveInstitutionId || undefined
  });
  const degrees = degreesData?.data ?? [];

  const { data: programsData } = usePrograms({
    institution_id: effectiveInstitutionId || undefined,
    degree_id: filters.degreeId || undefined,
    department_id: filters.departmentId || undefined
  });
  const programs = programsData?.data ?? [];

  const { data: departmentsData } = useDepartments({
    institution_id: effectiveInstitutionId || undefined,
    degree_id: filters.degreeId || undefined
  });
  const departments = departmentsData?.data ?? [];

  const { data: semestersData } = useSemesters({
    institution_id: effectiveInstitutionId || undefined,
    degree_id: filters.degreeId || undefined,
    program_id: filters.programId || undefined,
    department_id: filters.departmentId || undefined
  });
  const semesters = semestersData?.data ?? [];

  const { data: sectionsData } = useSections({
    institution_id: effectiveInstitutionId || undefined,
    degree_id: filters.degreeId || undefined,
    program_id: filters.programId || undefined,
    department_id: filters.departmentId || undefined,
    semester_id: filters.semesterId || undefined
  });
  const sections = sectionsData?.data ?? [];

  // Date handling functions
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      try {
        // Create date string in local timezone to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        onFiltersChange({ attendanceDate: dateString });
        setCalendarOpen(false);
      } catch (error) {
        console.error('Error formatting date:', error);
      }
    }
  };

  const handleClearDate = () => {
    onFiltersChange({ attendanceDate: undefined });
    setCalendarOpen(false);
  };

  const setToday = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateString = `${year}-${month}-${day}`;
    onFiltersChange({ attendanceDate: dateString });
  };

  // Count active filters (excluding dashboard controlled ones)
  const activeFiltersCount = [
    filters.degreeId,
    filters.departmentId,
    filters.programId,
    filters.semesterId,
    filters.sectionId,
    filters.attendanceDate
  ].filter(Boolean).length;

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <Button
            variant='ghost'
            className='h-auto p-0 hover:bg-transparent'
            onClick={() => setFiltersExpanded(!filtersExpanded)}
          >
            <div className='flex items-center gap-2'>
              <Filter className='h-5 w-5 text-blue-600' />
              <CardTitle className='text-lg font-medium'>Filter Criteria</CardTitle>
              {filtersExpanded ? (
                <ChevronUp className='h-4 w-4 text-muted-foreground' />
              ) : (
                <ChevronDown className='h-4 w-4 text-muted-foreground' />
              )}
            </div>
          </Button>
          <div className='flex items-center gap-2'>
            {activeFiltersCount > 0 && (
              <span className='text-sm text-muted-foreground'>
                {activeFiltersCount} filter{activeFiltersCount > 1 ? 's' : ''} active
              </span>
            )}
            {activeFiltersCount > 0 && (
              <Button
                variant='outline'
                size='sm'
                onClick={onReset}
                className='h-8 px-2'
              >
                <RotateCcw className='h-3 w-3 mr-1' />
                Reset
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      {filtersExpanded && (
        <CardContent>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          {/* Attendance Date */}
          <div className='space-y-2'>
            <Label htmlFor='attendance-date'>Attendance Date</Label>
            <div className='flex gap-2'>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'flex-1 justify-start text-left font-normal',
                      !filters.attendanceDate && 'text-muted-foreground'
                    )}
                    onClick={() => setCalendarOpen(true)}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {filters.attendanceDate ? (
                      format(
                        new Date(filters.attendanceDate + 'T00:00:00'),
                        'MMM dd, yyyy'
                      )
                    ) : (
                      <span>Today</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={
                      filters.attendanceDate
                        ? new Date(filters.attendanceDate + 'T00:00:00')
                        : new Date()
                    }
                    onSelect={handleDateSelect}
                    initialFocus
                    disabled={(date) => {
                      // Disable future dates (only allow present and past dates)
                      const today = new Date();
                      today.setHours(23, 59, 59, 999); // Set to end of today
                      return date > today;
                    }}
                  />
                </PopoverContent>
              </Popover>
              {filters.attendanceDate && (
                <Button
                  variant='outline'
                  size='icon'
                  onClick={handleClearDate}
                  title='Clear date'
                  className='shrink-0'
                >
                  <X className='h-4 w-4' />
                </Button>
              )}
            </div>
            <Button
              variant='ghost'
              size='sm'
              onClick={setToday}
              title='Set to today'
              className='text-xs w-full border border-primary hover:bg-primary/30'
            >
              Today
            </Button>
          </div>

          {/* Institution - Show for super admin or as read-only */}
          <div className='space-y-2'>
            <Label htmlFor='institution'>Institution</Label>
            {canViewAllInstitutions ? (
              <Select
                value={effectiveInstitutionId || undefined}
                onValueChange={(value) => {
                  onFiltersChange({
                    institutionId: value,
                    academicYearId: undefined,
                    degreeId: undefined,
                    departmentId: undefined,
                    programId: undefined,
                    semesterId: undefined,
                    sectionId: undefined
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select institution' />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map((institution: any) => (
                    <SelectItem key={institution.id} value={institution.id}>
                      {institution.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className='flex items-center h-10 px-3 py-2 text-sm border border-input bg-muted text-muted-foreground rounded-md'>
                {institutions.find((inst: any) => inst.id === effectiveInstitutionId)?.name || 'Current Institution'}
              </div>
            )}
          </div>

          {/* Academic Year */}
          <div className='space-y-2'>
            <Label htmlFor='academic-year'>Academic Year</Label>
            {dashboardAcademicYearId ? (
              <div className='flex items-center h-10 px-3 py-2 text-sm border border-input bg-muted text-muted-foreground rounded-md'>
                {academicYears.find(year => year.id === effectiveAcademicYearId)?.academic_year_name || 'From Dashboard'}
              </div>
            ) : (
              <Select
                value={filters.academicYearId || undefined}
                onValueChange={(value) =>
                  onFiltersChange({ academicYearId: value })
                }
                disabled={!effectiveInstitutionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select academic year' />
                </SelectTrigger>
                <SelectContent>
                  {academicYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.academic_year_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Degree */}
          <div className='space-y-2'>
            <Label htmlFor='degree'>Degree</Label>
            <Select
              value={filters.degreeId || undefined}
              onValueChange={(value) => {
                onFiltersChange({
                  degreeId: value,
                  departmentId: undefined,
                  programId: undefined,
                  semesterId: undefined,
                  sectionId: undefined
                });
              }}
              disabled={!effectiveInstitutionId}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select degree' />
              </SelectTrigger>
              <SelectContent>
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
              value={filters.departmentId || undefined}
              onValueChange={(value) => {
                onFiltersChange({
                  departmentId: value,
                  programId: undefined,
                  semesterId: undefined,
                  sectionId: undefined
                });
              }}
              disabled={!filters.degreeId}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select department' />
              </SelectTrigger>
              <SelectContent>
                {Array.from(
                  new Map(
                    departments.map((department: any) => [
                      department.department_name,
                      department
                    ])
                  ).values()
                ).map((department: any) => (
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
              value={filters.programId || undefined}
              onValueChange={(value) => {
                onFiltersChange({
                  programId: value,
                  semesterId: undefined,
                  sectionId: undefined
                });
              }}
              disabled={!filters.departmentId}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select program' />
              </SelectTrigger>
              <SelectContent>
                {Array.from(
                  new Map(
                    programs.map((program: any) => [program.program_name, program])
                  ).values()
                ).map((program: any) => (
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
              value={filters.semesterId || undefined}
              onValueChange={(value) => {
                onFiltersChange({
                  semesterId: value,
                  sectionId: undefined
                });
              }}
              disabled={!filters.departmentId}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select semester' />
              </SelectTrigger>
              <SelectContent>
                {Array.from(
                  new Map(
                    semesters.map((semester: any) => [
                      semester.semester_name,
                      semester
                    ])
                  ).values()
                ).map((semester: any) => (
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
              value={filters.sectionId || undefined}
              onValueChange={(value) =>
                onFiltersChange({
                  sectionId: value === 'all_sections' ? undefined : value
                })
              }
              disabled={!filters.semesterId}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select section' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all_sections'>All Sections</SelectItem>
                {Array.from(
                  new Map(
                    sections.map((section: any) => [section.section_name, section])
                  ).values()
                ).map((section: any) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.section_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        </CardContent>
      )}
    </Card>
  );
}