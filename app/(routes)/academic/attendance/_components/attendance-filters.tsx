'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon } from 'lucide-react';
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
import { useInstitutions } from '@/hooks/organization/use-institutions';
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

  // Fetch data hooks
  const { institutions, fetchInstitutions } = useInstitutions({});
  const { academicYears, fetchAcademicYears } = useAcademicYears({});
  const { degrees, fetchDegrees } = useDegrees({});
  const { programs, fetchPrograms } = usePrograms({});
  const { departments, fetchDepartments } = useDepartments({});
  const { semesters, fetchSemesters } = useSemesters({});
  const { sections, fetchSections } = useSections({});

  // Load initial data
  useEffect(() => {
    fetchInstitutions();
  }, [fetchInstitutions]);

  // Load academic years when institution changes
  useEffect(() => {
    if (searchContext.institution_id) {
      fetchAcademicYears({
        institution_id: searchContext.institution_id,
        isActive: true
      });
    }
  }, [searchContext.institution_id, fetchAcademicYears]);

  // Load degrees when institution changes
  useEffect(() => {
    if (searchContext.institution_id) {
      fetchDegrees({
        institution_id: searchContext.institution_id,
        isActive: true
      });
    }
  }, [searchContext.institution_id, fetchDegrees]);

  // Load programs when degree changes
  useEffect(() => {
    if (searchContext.institution_id && searchContext.degree_id) {
      fetchPrograms({
        institution_id: searchContext.institution_id,
        degree_id: searchContext.degree_id,
        isActive: true
      });
    }
  }, [searchContext.institution_id, searchContext.degree_id, fetchPrograms]);

  // Load departments when program changes
  useEffect(() => {
    if (
      searchContext.institution_id &&
      searchContext.degree_id &&
      searchContext.program_id
    ) {
      fetchDepartments({
        institution_id: searchContext.institution_id,
        degree_id: searchContext.degree_id,
        isActive: true
      });
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
      fetchSemesters({
        institution_id: searchContext.institution_id,
        degree_id: searchContext.degree_id,
        program_id: searchContext.program_id,
        department_id: searchContext.department_id,
        isActive: true
      });
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
      fetchSections({
        institution_id: searchContext.institution_id,
        degree_id: searchContext.degree_id,
        program_id: searchContext.program_id,
        department_id: searchContext.department_id,
        semester_id: searchContext.semester_id,
        isActive: true
      });
    }
  }, [
    searchContext.institution_id,
    searchContext.degree_id,
    searchContext.program_id,
    searchContext.department_id,
    searchContext.semester_id,
    fetchSections
  ]);

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const dateString = date.toISOString().split('T')[0];
      onContextChange({ attendance_date: dateString });
      setCalendarOpen(false);
    }
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
                {institutions.map((institution) => (
                  <SelectItem key={institution.id} value={institution.id}>
                    {institution.name}
                  </SelectItem>
                ))}
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
                {degrees.map((degree) => (
                  <SelectItem key={degree.id} value={degree.id}>
                    {degree.degree_name}
                  </SelectItem>
                ))}
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
                {programs.map((program) => (
                  <SelectItem key={program.id} value={program.id}>
                    {program.program_name}
                  </SelectItem>
                ))}
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
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.department_name}
                  </SelectItem>
                ))}
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
                {semesters.map((semester) => (
                  <SelectItem key={semester.id} value={semester.id}>
                    {semester.semester_name}
                  </SelectItem>
                ))}
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
                {sections.map((section) => (
                  <SelectItem key={section.id} value={section.id}>
                    {section.section_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Attendance Date */}
          <div className='space-y-2'>
            <Label htmlFor='date'>Attendance Date</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !searchContext.attendance_date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className='mr-2 h-4 w-4' />
                  {searchContext.attendance_date ? (
                    format(new Date(searchContext.attendance_date), 'PPP')
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-auto p-0'>
                <Calendar
                  mode='single'
                  selected={
                    searchContext.attendance_date
                      ? new Date(searchContext.attendance_date)
                      : undefined
                  }
                  onSelect={handleDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Period Selection */}
      {availablePeriods.length > 0 && (
        <div>
          <h3 className='text-lg font-medium mb-4'>Select Period</h3>
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {availablePeriods.map((period) => (
              <Button
                key={period.timetable_slot_id}
                variant={
                  selectedPeriod === period.timetable_slot_id
                    ? 'default'
                    : 'outline'
                }
                className='h-auto p-4 flex flex-col items-start'
                onClick={() => onPeriodSelect(period)}
                disabled={loading}
              >
                <div className='font-medium'>{period.period_name}</div>
                <div className='text-sm text-muted-foreground'>
                  {period.start_time} - {period.end_time}
                </div>
                {period.course && (
                  <div className='text-sm font-medium mt-1'>
                    {period.course.course_code} - {period.course.course_name}
                  </div>
                )}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
