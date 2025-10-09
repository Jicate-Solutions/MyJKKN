'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
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
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import type { AttendanceSearchContext } from '@/types/attendance';
import { cn } from '@/lib/utils';
import { AttendanceService } from '@/lib/services/academic/attendance-service';

interface AttendanceFiltersProps {
  searchContext: AttendanceSearchContext;
  onContextChange: (context: Partial<AttendanceSearchContext>) => void;
  loading: boolean;
  // Updated: 2025-10-09 - Expose section requirement status to parent
  onSectionRequirementChange?: (isRequired: boolean) => void;
}

export function AttendanceFilters({
  searchContext,
  onContextChange,
  loading,
  onSectionRequirementChange
}: AttendanceFiltersProps) {
  const { isSuperAdmin } = usePermissions();
  const { profile } = useAuth();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);
  // Updated: 2025-10-09 - Track timetable type to conditionally require section field
  const [timetableType, setTimetableType] = useState<'semester' | 'section' | null>(null);
  const [isSectionRequired, setIsSectionRequired] = useState(false);

  // Prevent hydration mismatch for date operations
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Fetch data hooks
  const { institutions, refetch: fetchInstitutions } =
    useInstitutionsWithAccess({});

  const { academicYears } = useAcademicYearsByInstitution(
    searchContext.institution_id || undefined
  );

  const { data: degreesData, refetch: fetchDegrees } = useDegrees({
    institution_id: searchContext.institution_id || undefined
  });
  const degrees = degreesData?.data ?? [];

  const { data: programsData, refetch: fetchPrograms } = usePrograms({
    institution_id: searchContext.institution_id || undefined,
    degree_id: searchContext.degree_id || undefined,
    department_id: searchContext.department_id || undefined
  });
  const programs = programsData?.data ?? [];

  const { data: departmentsData, refetch: fetchDepartments } = useDepartments({
    institution_id: searchContext.institution_id || undefined,
    degree_id: searchContext.degree_id || undefined
  });
  const departments = departmentsData?.data ?? [];

  const { data: semestersData, refetch: fetchSemesters } = useSemesters({
    institution_id: searchContext.institution_id || undefined,
    degree_id: searchContext.degree_id || undefined,
    program_id: searchContext.program_id || undefined,
    department_id: searchContext.department_id || undefined
  });
  const semesters = semestersData?.data ?? [];

  const { data: sectionsData, refetch: fetchSections } = useSections({
    institution_id: searchContext.institution_id || undefined,
    degree_id: searchContext.degree_id || undefined,
    program_id: searchContext.program_id || undefined,
    department_id: searchContext.department_id || undefined,
    semester_id: searchContext.semester_id || undefined
  });
  const sections = sectionsData?.data ?? [];

  // Load initial data
  useEffect(() => {
    fetchInstitutions();
  }, [fetchInstitutions]);

  // Academic years are now auto-fetched by the hook when institution_id changes

  // Load degrees when institution changes
  useEffect(() => {
    if (searchContext.institution_id) {
      fetchDegrees();
    }
  }, [searchContext.institution_id, fetchDegrees]);

  // Load departments when degree changes (correct hierarchy)
  useEffect(() => {
    if (searchContext.institution_id && searchContext.degree_id) {
      fetchDepartments();
    }
  }, [searchContext.institution_id, searchContext.degree_id, fetchDepartments]);

  // Load programs when department changes (correct hierarchy)
  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.degree_id &&
      searchContext.department_id
    ) {
      fetchPrograms();
    }
  }, [
    searchContext.institution_id,
    searchContext.degree_id,
    searchContext.department_id,
    fetchPrograms
  ]);

  // Load semesters when program changes (correct hierarchy)
  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.degree_id &&
      searchContext.department_id &&
      searchContext.program_id
    ) {
      fetchSemesters();
    }
  }, [
    searchContext.institution_id,
    searchContext.degree_id,
    searchContext.department_id,
    searchContext.program_id,
    fetchSemesters
  ]);

  // Load sections when semester changes
  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.degree_id &&
      searchContext.program_id &&
      searchContext.department_id &&
      searchContext.semester_id
    ) {
      fetchSections();
    }
  }, [
    searchContext.institution_id,
    searchContext.degree_id,
    searchContext.program_id,
    searchContext.department_id,
    searchContext.semester_id,
    fetchSections
  ]);

  // Auto-select department for HOD users
  useEffect(() => {
    if (profile?.role === 'hod' && profile?.department_id && !isSuperAdmin) {
      // Only auto-select if department is not already set
      if (!searchContext.department_id) {
        onContextChange({ department_id: profile.department_id });
      }
    }
  }, [profile?.role, profile?.department_id, searchContext.department_id, onContextChange, isSuperAdmin]);

  // Updated: 2025-10-09 - Detect timetable type when semester changes
  useEffect(() => {
    const detectTimetableType = async () => {
      if (
        searchContext.institution_id &&
        searchContext.academic_year_id &&
        searchContext.degree_id &&
        searchContext.program_id &&
        searchContext.department_id &&
        searchContext.semester_id
      ) {
        console.log('🔍 Detecting timetable type for semester...');

        const type = await AttendanceService.getTimetableTypeForSemester(
          searchContext.institution_id,
          searchContext.academic_year_id,
          searchContext.degree_id,
          searchContext.program_id,
          searchContext.department_id,
          searchContext.semester_id
        );

        console.log('📊 Timetable type detected:', type);
        setTimetableType(type);
        const isRequired = type === 'section';
        setIsSectionRequired(isRequired);

        // Notify parent component about section requirement change
        if (onSectionRequirementChange) {
          onSectionRequirementChange(isRequired);
        }

        // If section is now required and was previously set to null, clear it
        if (type === 'section' && !searchContext.section_id) {
          console.log('⚠️ Section is required for section-level timetables');
        }
      } else {
        // Reset if semester is not selected
        setTimetableType(null);
        setIsSectionRequired(false);

        // Notify parent that section is no longer required
        if (onSectionRequirementChange) {
          onSectionRequirementChange(false);
        }
      }
    };

    detectTimetableType();
  }, [
    searchContext.institution_id,
    searchContext.academic_year_id,
    searchContext.degree_id,
    searchContext.program_id,
    searchContext.department_id,
    searchContext.semester_id,
    searchContext.section_id
  ]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      try {
        // Create date string in local timezone to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        onContextChange({ attendance_date: dateString });
        setCalendarOpen(false);
      } catch (error) {
        console.error('Error formatting date:', error);
      }
    }
  };

  const handleClearDate = () => {
    onContextChange({ attendance_date: null });
    setCalendarOpen(false);
  };

  return (
    <div className='space-y-6'>
      <div>
        <h3 className='text-lg font-medium mb-4'>Search Criteria</h3>

        <div className='flex flex-col gap-4'>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
            {/* Institution */}
            <div className='space-y-2'>
              <Label htmlFor='institution'>Institution</Label>
              <Select
                value={searchContext.institution_id || undefined}
                onValueChange={(value) => {
                  onContextChange({
                    institution_id: value,
                    academic_year_id: null,
                    degree_id: null,
                    program_id: null,
                    department_id: null,
                    semester_id: null,
                    section_id: null
                  });
                }}
                disabled={!isSuperAdmin}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select institution' />
                </SelectTrigger>
                <SelectContent>
                  {institutions.map(
                    (institution: {
                      id: string;
                      name: import('react').ReactNode;
                    }) => (
                      <SelectItem key={institution.id} value={institution.id}>
                        {institution.name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Academic Year */}
            <div className='space-y-2'>
              <Label htmlFor='academic-year'>Academic Year</Label>
              <Select
                value={searchContext.academic_year_id || undefined}
                onValueChange={(value) =>
                  onContextChange({ academic_year_id: value })
                }
                disabled={!searchContext.institution_id}
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
            </div>

            {/* Degree */}
            <div className='space-y-2'>
              <Label htmlFor='degree'>Degree</Label>
              <Select
                value={searchContext.degree_id || undefined}
                onValueChange={(value) => {
                  onContextChange({
                    degree_id: value,
                    department_id: null,
                    program_id: null,
                    semester_id: null,
                    section_id: null
                  });
                }}
                disabled={!searchContext.institution_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select degree' />
                </SelectTrigger>
                <SelectContent>
                  {degrees.map(
                    (degree: {
                      id: string;
                      degree_name: import('react').ReactNode;
                    }) => (
                      <SelectItem key={degree.id} value={degree.id}>
                        {degree.degree_name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Department */}
            <div className='space-y-2'>
              <Label htmlFor='department'>Department</Label>
              <Select
                value={searchContext.department_id || undefined}
                onValueChange={(value) => {
                  onContextChange({
                    department_id: value,
                    program_id: null,
                    semester_id: null,
                    section_id: null
                  });
                }}
                disabled={!searchContext.degree_id || (profile?.role === 'hod' && !isSuperAdmin)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      profile?.role === 'hod' && !isSuperAdmin
                        ? 'Your department will be auto-selected'
                        : 'Select department'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {/* Remove duplicates by department name */}
                  {Array.from(
                    new Map(
                      departments.map(
                        (department: {
                          id: string;
                          department_name: import('react').ReactNode;
                        }) => [department.department_name, department]
                      )
                    ).values()
                  ).map(
                    (department: {
                      id: string;
                      department_name: import('react').ReactNode;
                    }) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.department_name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Program */}
            <div className='space-y-2'>
              <Label htmlFor='program'>Program</Label>
              <Select
                value={searchContext.program_id || undefined}
                onValueChange={(value) => {
                  onContextChange({
                    program_id: value,
                    semester_id: null,
                    section_id: null
                  });
                }}
                disabled={!searchContext.department_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select program' />
                </SelectTrigger>
                <SelectContent>
                  {/* Remove duplicates by program name for super admin */}
                  {Array.from(
                    new Map(
                      programs.map(
                        (program: {
                          id: string;
                          program_name: import('react').ReactNode;
                        }) => [program.program_name, program]
                      )
                    ).values()
                  ).map(
                    (program: {
                      id: string;
                      program_name: import('react').ReactNode;
                    }) => (
                      <SelectItem key={program.id} value={program.id}>
                        {program.program_name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Semester */}
            <div className='space-y-2'>
              <Label htmlFor='semester'>Semester</Label>
              <Select
                value={searchContext.semester_id || undefined}
                onValueChange={(value) => {
                  onContextChange({
                    semester_id: value,
                    section_id: null
                  });
                }}
                disabled={!searchContext.department_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select semester' />
                </SelectTrigger>
                <SelectContent>
                  {/* Remove duplicates by semester name */}
                  {Array.from(
                    new Map(
                      semesters.map(
                        (semester: {
                          id: string;
                          semester_name: import('react').ReactNode;
                        }) => [semester.semester_name, semester]
                      )
                    ).values()
                  ).map(
                    (semester: {
                      id: string;
                      semester_name: import('react').ReactNode;
                    }) => (
                      <SelectItem key={semester.id} value={semester.id}>
                        {semester.semester_name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Section */}
            <div className='space-y-2'>
              <Label htmlFor='section'>
                Section
                {isSectionRequired && (
                  <span className='text-red-500 ml-1'>*</span>
                )}
              </Label>
              <Select
                value={searchContext.section_id || undefined}
                onValueChange={(value) =>
                  onContextChange({
                    section_id: value === 'all_sections' ? null : value
                  })
                }
                disabled={!searchContext.semester_id}
              >
                <SelectTrigger className={cn(
                  isSectionRequired && !searchContext.section_id && 'border-red-500'
                )}>
                  <SelectValue placeholder={
                    isSectionRequired
                      ? 'Select section (required)'
                      : 'Select section'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {/* Updated: 2025-10-09 - Only show "All Sections" for semester-level timetables */}
                  {!isSectionRequired && (
                    <SelectItem value='all_sections'>All Sections</SelectItem>
                  )}
                  {/* Remove duplicates by section name */}
                  {Array.from(
                    new Map(
                      sections.map(
                        (section: {
                          id: string;
                          section_name: import('react').ReactNode;
                        }) => [section.section_name, section]
                      )
                    ).values()
                  ).map(
                    (section: {
                      id: string;
                      section_name: import('react').ReactNode;
                    }) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.section_name}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
              {isSectionRequired && (
                <p className='text-xs text-amber-600'>
                  This semester uses section-level timetables. Please select a specific section.
                </p>
              )}
            </div>

            {/* Attendance Date */}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='date'>Attendance Date</Label>
            <div className='flex gap-4 w-[280px]'>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'flex-1 justify-start w-full text-left font-normal',
                      !searchContext.attendance_date && 'text-muted-foreground'
                    )}
                    onClick={() => setCalendarOpen(true)}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {searchContext.attendance_date && isClient ? (
                      format(
                        new Date(searchContext.attendance_date + 'T00:00:00'),
                        'PPP'
                      )
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={
                      searchContext.attendance_date && isClient
                        ? new Date(searchContext.attendance_date + 'T00:00:00')
                        : undefined
                    }
                    onSelect={handleDateSelect}
                    initialFocus
                    disabled={
                      isClient
                        ? (date) => {
                            // Disable future dates (only allow present and past dates)
                            const today = new Date();
                            today.setHours(23, 59, 59, 999); // Set to end of today
                            return date > today;
                          }
                        : undefined
                    }
                  />
                </PopoverContent>
              </Popover>
              {searchContext.attendance_date && (
                <Button
                  variant='outline'
                  size='icon'
                  onClick={handleClearDate}
                  title='Clear date'
                >
                  <X className='h-4 w-4' />
                </Button>
              )}
              <Button
                variant='ghost'
                size='sm'
                onClick={() => {
                  if (isClient) {
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    const day = String(today.getDate()).padStart(2, '0');
                    const dateString = `${year}-${month}-${day}`;
                    onContextChange({ attendance_date: dateString });
                  }
                }}
                title='Set to today'
                className='text-xs w-[100px] border border-primary hover:bg-primary/30'
                disabled={!isClient}
              >
                Today
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
