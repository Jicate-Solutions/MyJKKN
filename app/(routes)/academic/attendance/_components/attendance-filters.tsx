'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, Lock, Check, X } from 'lucide-react';
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
import { useAcademicYears } from '@/hooks/academic/use-academic-years';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  AttendanceSearchContext,
  AttendancePeriodOption
} from '@/types/attendance';
import { cn } from '@/lib/utils';

interface AttendanceFiltersProps {
  searchContext: AttendanceSearchContext;
  onContextChange: (context: Partial<AttendanceSearchContext>) => void;
  availablePeriods: AttendancePeriodOption[];
  selectedPeriod: string | null;
  onPeriodSelect: (period: AttendancePeriodOption) => void;
  loading: boolean;
}

export function AttendanceFilters({
  searchContext,
  onContextChange,
  availablePeriods,
  selectedPeriod,
  onPeriodSelect,
  loading
}: AttendanceFiltersProps) {
  const { isSuperAdmin } = usePermissions();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [periodPermissions, setPeriodPermissions] = useState<
    Record<string, boolean>
  >({});
  const [checkingPermissions, setCheckingPermissions] = useState(false);

  // Fetch data hooks
  const { institutions, refetch: fetchInstitutions } =
    useInstitutionsWithAccess({});

  const { academicYears, fetchAcademicYears } = useAcademicYears({
    institution_id: searchContext.institution_id || undefined
  });

  const { data: degreesData, refetch: fetchDegrees } = useDegrees({
    institution_id: searchContext.institution_id || undefined
  });
  const degrees = degreesData?.data ?? [];

  const { data: programsData, refetch: fetchPrograms } = usePrograms({
    institution_id: searchContext.institution_id || undefined,
    degree_id: searchContext.degree_id || undefined
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

  // Load academic years when institution changes
  useEffect(() => {
    if (searchContext.institution_id) {
      fetchAcademicYears();
    }
  }, [searchContext.institution_id, fetchAcademicYears]);

  // Load degrees when institution changes
  useEffect(() => {
    if (searchContext.institution_id) {
      fetchDegrees();
    }
  }, [searchContext.institution_id, fetchDegrees]);

  // Load programs when degree changes
  useEffect(() => {
    if (searchContext.institution_id && searchContext.degree_id) {
      fetchPrograms();
    }
  }, [searchContext.institution_id, searchContext.degree_id, fetchPrograms]);

  // Load departments when program changes
  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.degree_id &&
      searchContext.program_id
    ) {
      fetchDepartments();
    }
  }, [
    searchContext.institution_id,
    searchContext.degree_id,
    searchContext.program_id,
    fetchDepartments
  ]);

  // Load semesters when department changes
  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.degree_id &&
      searchContext.program_id &&
      searchContext.department_id
    ) {
      fetchSemesters();
    }
  }, [
    searchContext.institution_id,
    searchContext.degree_id,
    searchContext.program_id,
    searchContext.department_id,
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

  // Check permissions for all periods when they change
  useEffect(() => {
    const checkPeriodsPermissions = async () => {
      if (availablePeriods.length === 0 || isSuperAdmin) {
        // Super admins can access all periods
        const permissions = availablePeriods.reduce((acc, period) => {
          acc[period.timetable_slot_id] = true;
          return acc;
        }, {} as Record<string, boolean>);
        setPeriodPermissions(permissions);
        return;
      }

      setCheckingPermissions(true);
      try {
        const { AttendanceService } = await import(
          '@/lib/services/academic/attendance-service'
        );

        const permissionChecks = await Promise.all(
          availablePeriods.map(async (period) => {
            const canMark = await AttendanceService.canMarkAttendanceForSlot(
              period.timetable_slot_id,
              isSuperAdmin
            );
            return { slotId: period.timetable_slot_id, canMark };
          })
        );

        const permissions = permissionChecks.reduce((acc, check) => {
          acc[check.slotId] = check.canMark;
          return acc;
        }, {} as Record<string, boolean>);

        setPeriodPermissions(permissions);
      } catch (error) {
        console.error('Error checking period permissions:', error);
        // Set all to false on error (except for super admin)
        const permissions = availablePeriods.reduce((acc, period) => {
          acc[period.timetable_slot_id] = false;
          return acc;
        }, {} as Record<string, boolean>);
        setPeriodPermissions(permissions);
      } finally {
        setCheckingPermissions(false);
      }
    };

    checkPeriodsPermissions();
  }, [availablePeriods, isSuperAdmin]);

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
                  program_id: null,
                  department_id: null,
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

          {/* Program */}
          <div className='space-y-2'>
            <Label htmlFor='program'>Program</Label>
            <Select
              value={searchContext.program_id || undefined}
              onValueChange={(value) => {
                onContextChange({
                  program_id: value,
                  department_id: null,
                  semester_id: null,
                  section_id: null
                });
              }}
              disabled={!searchContext.degree_id}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select program' />
              </SelectTrigger>
              <SelectContent>
                {programs.map(
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

          {/* Department */}
          <div className='space-y-2'>
            <Label htmlFor='department'>Department</Label>
            <Select
              value={searchContext.department_id || undefined}
              onValueChange={(value) => {
                onContextChange({
                  department_id: value,
                  semester_id: null,
                  section_id: null
                });
              }}
              disabled={!searchContext.program_id}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select department' />
              </SelectTrigger>
              <SelectContent>
                {departments.map(
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
                {semesters.map(
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
            <Label htmlFor='section'>Section (Optional)</Label>
            <Select
              value={searchContext.section_id || undefined}
              onValueChange={(value) =>
                onContextChange({
                  section_id: value === 'all_sections' ? null : value
                })
              }
              disabled={!searchContext.semester_id}
            >
              <SelectTrigger>
                <SelectValue placeholder='Select section' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all_sections'>All Sections</SelectItem>
                {sections.map(
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
          </div>

          {/* Attendance Date */}
          <div className='space-y-2'>
            <Label htmlFor='date'>Attendance Date</Label>
            <div className='flex gap-2'>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'flex-1 justify-start text-left font-normal',
                      !searchContext.attendance_date && 'text-muted-foreground'
                    )}
                    onClick={() => setCalendarOpen(true)}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {searchContext.attendance_date ? (
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
                      searchContext.attendance_date
                        ? new Date(searchContext.attendance_date + 'T00:00:00')
                        : undefined
                    }
                    onSelect={handleDateSelect}
                    initialFocus
                    disabled={(date) => {
                      // Disable dates more than 1 year in the future
                      const oneYearFromNow = new Date();
                      oneYearFromNow.setFullYear(
                        oneYearFromNow.getFullYear() + 1
                      );
                      return date > oneYearFromNow;
                    }}
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
                  const today = new Date();
                  const year = today.getFullYear();
                  const month = String(today.getMonth() + 1).padStart(2, '0');
                  const day = String(today.getDate()).padStart(2, '0');
                  const dateString = `${year}-${month}-${day}`;
                  onContextChange({ attendance_date: dateString });
                }}
                title='Set to today'
                className='text-xs'
              >
                Today
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Period Selection */}
      {availablePeriods.length > 0 && (
        <div>
          <div className='flex items-center justify-between mb-4'>
            <h3 className='text-lg font-medium'>Select Period</h3>
            {checkingPermissions && (
              <div className='flex items-center text-sm text-muted-foreground'>
                <div className='animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full mr-2'></div>
                Checking permissions...
              </div>
            )}
          </div>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {availablePeriods.map((period) => {
              const hasPermission =
                periodPermissions[period.timetable_slot_id] ?? true;
              const isSelected = selectedPeriod === period.timetable_slot_id;

              return (
                <Button
                  key={period.timetable_slot_id}
                  variant={isSelected ? 'default' : 'outline'}
                  className={cn(
                    'h-auto p-4 flex flex-col items-start relative',
                    !hasPermission &&
                      !isSuperAdmin &&
                      'opacity-60 border-dashed'
                  )}
                  onClick={() => onPeriodSelect(period)}
                  disabled={loading || checkingPermissions}
                >
                  {/* Permission indicator */}
                  <div className='absolute top-2 right-2'>
                    {isSuperAdmin ? (
                      <Check className='h-4 w-4 text-green-600' />
                    ) : hasPermission ? (
                      <Check className='h-4 w-4 text-green-600' />
                    ) : (
                      <Lock className='h-4 w-4 text-red-500' />
                    )}
                  </div>

                  <div className='font-medium'>{period.period_name}</div>
                  <div className='text-sm text-muted-foreground'>
                    {period.start_time} - {period.end_time}
                  </div>
                  {period.course && (
                    <div className='text-sm font-medium mt-1'>
                      {period.course.course_code} - {period.course.course_name}
                    </div>
                  )}
                  {period.sections && period.sections.length > 0 && (
                    <div className='text-xs text-muted-foreground mt-1'>
                      Sections: {period.sections.map((s) => s.name).join(', ')}
                    </div>
                  )}

                  {/* Permission status text */}
                  {!isSuperAdmin && (
                    <div
                      className={cn(
                        'text-xs mt-2 font-medium',
                        hasPermission ? 'text-green-600' : 'text-red-500'
                      )}
                    >
                      {hasPermission
                        ? 'You can teach this'
                        : 'Assigned to others'}
                    </div>
                  )}
                </Button>
              );
            })}
          </div>

          {/* Show legend for non-super admins */}
          {!isSuperAdmin && availablePeriods.length > 0 && (
            <div className='mt-4 p-3 bg-gray-50 rounded-lg'>
              <p className='text-sm text-muted-foreground mb-2'>
                <strong>Permission Legend:</strong>
              </p>
              <div className='flex flex-wrap gap-4 text-xs'>
                <div className='flex items-center gap-1'>
                  <Check className='h-3 w-3 text-green-600' />
                  <span>You can mark attendance</span>
                </div>
                <div className='flex items-center gap-1'>
                  <Lock className='h-3 w-3 text-red-500' />
                  <span>Only assigned staff can mark</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
