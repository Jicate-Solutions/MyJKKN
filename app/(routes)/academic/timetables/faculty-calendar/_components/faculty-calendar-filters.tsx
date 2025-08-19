'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { DateRange } from 'react-day-picker';
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth
} from 'date-fns';
import {
  Filter,
  Calendar as CalendarIcon,
  X,
  Users,
  Building,
  GraduationCap,
  BookOpen
} from 'lucide-react';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useAcademicYears } from '@/hooks/academic/use-academic-years';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useStaff } from '@/hooks/staff/use-staff';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSections } from '@/hooks/organization/use-sections';
import type { FacultyCalendarFilters } from '@/types/faculty-calendar';

interface FacultyCalendarFiltersProps {
  filters: FacultyCalendarFilters;
  onFiltersChange: (filters: FacultyCalendarFilters) => void;
  viewMode: 'faculty' | 'admin';
  className?: string;
}

export function FacultyCalendarFilters({
  filters,
  onFiltersChange,
  viewMode,
  className
}: FacultyCalendarFiltersProps) {
  // Local state for controlled inputs
  const [localFilters, setLocalFilters] =
    useState<FacultyCalendarFilters>(filters);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: filters.date_range.from,
    to: filters.date_range.to
  });

  // Data hooks
  const { institutions } = useInstitutionsWithAccess();
  const { data: degrees } = useDegrees({
    institution_id: localFilters.institution_id,
    isActive: true
  });
  const { data: departments } = useDepartments({
    institution_id: localFilters.institution_id,
    degree_id: localFilters.degree_id,
    isActive: true
  });
  const { academicYears, fetchAcademicYears } = useAcademicYears({
    institution_id: localFilters.institution_id,
    isActive: true
  });
  const { data: programs } = usePrograms({
    institution_id: localFilters.institution_id,
    department_id: localFilters.department_id,
    isActive: true
  });
  const { data: semesters } = useSemesters({
    institution_id: localFilters.institution_id,
    program_id: localFilters.program_id,
    isActive: true
  });
  const { data: sections } = useSections({
    institution_id: localFilters.institution_id,
    program_id: localFilters.program_id,
    semester_id: localFilters.semester_id,
    isActive: true
  });
  const { data: staffData } = useStaff({
    institution_id: localFilters.institution_id,
    department_id: localFilters.department_id,
    isActive: true
  });

  // Update local filters when props change
  useEffect(() => {
    setLocalFilters(filters);
    setDateRange({
      from: filters.date_range.from,
      to: filters.date_range.to
    });
  }, [filters]);

  // Fetch academic years when institution changes
  useEffect(() => {
    if (localFilters.institution_id) {
      fetchAcademicYears({
        institution_id: localFilters.institution_id,
        isActive: true
      });
    }
  }, [localFilters.institution_id, fetchAcademicYears]);

  // Apply filters
  const applyFilters = () => {
    const updatedFilters: FacultyCalendarFilters = {
      ...localFilters,
      date_range: {
        from: dateRange.from || new Date(),
        to: dateRange.to || new Date()
      }
    };
    onFiltersChange(updatedFilters);
  };

  // Reset filters
  const resetFilters = () => {
    const defaultFilters: FacultyCalendarFilters = {
      date_range: {
        from: new Date(),
        to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      },
      include_break_slots: viewMode === 'faculty'
    };
    setLocalFilters(defaultFilters);
    setDateRange({
      from: defaultFilters.date_range.from,
      to: defaultFilters.date_range.to
    });
    onFiltersChange(defaultFilters);
  };

  // Update local filter helper
  const updateLocalFilter = (key: keyof FacultyCalendarFilters, value: any) => {
    setLocalFilters((prev) => ({
      ...prev,
      [key]: value
    }));
  };

  // Clear specific filter
  const clearFilter = (key: keyof FacultyCalendarFilters) => {
    const { [key]: _, ...rest } = localFilters;
    setLocalFilters(rest as FacultyCalendarFilters);
  };

  // Count active filters
  const activeFiltersCount =
    Object.keys(localFilters).filter((key) => {
      const value = localFilters[key as keyof FacultyCalendarFilters];
      return (
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && value.length === 0)
      );
    }).length - 1; // Subtract 1 for date_range which is always present

  return (
    <Card className={className}>
      <CardHeader className='pb-3'>
        <div className='flex items-center justify-between'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Filter className='h-4 w-4' />
            Filters
            {activeFiltersCount > 0 && (
              <Badge variant='secondary' className='text-xs'>
                {activeFiltersCount}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant='ghost'
            size='sm'
            onClick={resetFilters}
            className='text-xs'
          >
            Reset All
          </Button>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* Date and Hierarchy Filters */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
          {/* Date Range */}
          <div className='space-y-2 md:col-span-2'>
            <Label className='text-sm font-medium'>Date Range</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  className='w-full justify-start text-left font-normal'
                >
                  <CalendarIcon className='mr-2 h-4 w-4' />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'LLL dd, y')} -{' '}
                        {format(dateRange.to, 'LLL dd, y')}
                      </>
                    ) : (
                      format(dateRange.from, 'LLL dd, y')
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-auto p-0' align='start'>
                <Calendar
                  initialFocus
                  mode='range'
                  defaultMonth={dateRange.from}
                  selected={dateRange}
                  onSelect={(range) =>
                    setDateRange(range || { from: undefined, to: undefined })
                  }
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Quick Date Range Buttons */}
          <div className='grid grid-cols-3 gap-2 md:col-span-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => setDateRange({ from: new Date(), to: new Date() })}
            >
              Today
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() =>
                setDateRange({
                  from: startOfWeek(new Date()),
                  to: endOfWeek(new Date())
                })
              }
            >
              This Week
            </Button>
            <Button
              variant='outline'
              size='sm'
              onClick={() =>
                setDateRange({
                  from: startOfMonth(new Date()),
                  to: endOfMonth(new Date())
                })
              }
            >
              This Month
            </Button>
          </div>

          {/* Institution Filter (for super admins) */}
          {viewMode === 'admin' && institutions && institutions.length > 1 && (
            <div className='space-y-2'>
              <Label className='text-sm font-medium flex items-center gap-2'>
                <Building className='h-3 w-3' />
                Institution
                {localFilters.institution_id && (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => clearFilter('institution_id')}
                    className='h-4 w-4 p-0'
                  >
                    <X className='h-3 w-3' />
                  </Button>
                )}
              </Label>
              <Select
                value={localFilters.institution_id || 'all'}
                onValueChange={(value) =>
                  updateLocalFilter(
                    'institution_id',
                    value === 'all' ? undefined : value
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select institution' />
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
            </div>
          )}

          {/* Degree Filter */}
          {viewMode === 'admin' && (
            <div className='space-y-2'>
              <Label className='text-sm font-medium flex items-center gap-2'>
                <GraduationCap className='h-3 w-3' />
                Degree
              </Label>
              <Select
                value={localFilters.degree_id || 'all'}
                onValueChange={(value) =>
                  updateLocalFilter(
                    'degree_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={!localFilters.institution_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select degree' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Degrees</SelectItem>
                  {degrees?.data?.map((degree) => (
                    <SelectItem key={degree.id} value={degree.id}>
                      {degree.degree_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Department Filter */}
          {viewMode === 'admin' && (
            <div className='space-y-2'>
              <Label className='text-sm font-medium flex items-center gap-2'>
                <GraduationCap className='h-3 w-3' />
                Department
                {localFilters.department_id && (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => clearFilter('department_id')}
                    className='h-4 w-4 p-0'
                  >
                    <X className='h-3 w-3' />
                  </Button>
                )}
              </Label>
              <Select
                value={localFilters.department_id || 'all'}
                onValueChange={(value) =>
                  updateLocalFilter(
                    'department_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={!localFilters.institution_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select department' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Departments</SelectItem>
                  {departments?.data?.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.department_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Program Filter */}
          {viewMode === 'admin' && (
            <div className='space-y-2'>
              <Label className='text-sm font-medium flex items-center gap-2'>
                <BookOpen className='h-3 w-3' />
                Program
              </Label>
              <Select
                value={localFilters.program_id || 'all'}
                onValueChange={(value) =>
                  updateLocalFilter(
                    'program_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={!localFilters.department_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select program' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Programs</SelectItem>
                  {programs?.data?.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.program_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Academic Year Filter */}
          {viewMode === 'admin' && (
            <div className='space-y-2'>
              <Label className='text-sm font-medium flex items-center gap-2'>
                <BookOpen className='h-3 w-3' />
                Academic Year
                {localFilters.academic_year_id && (
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => clearFilter('academic_year_id')}
                    className='h-4 w-4 p-0'
                  >
                    <X className='h-3 w-3' />
                  </Button>
                )}
              </Label>
              <Select
                value={localFilters.academic_year_id || 'all'}
                onValueChange={(value) =>
                  updateLocalFilter(
                    'academic_year_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={!localFilters.institution_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select academic year' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Years</SelectItem>
                  {academicYears?.map((year: any) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.academic_year_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Semester Filter */}
          {viewMode === 'admin' && (
            <div className='space-y-2'>
              <Label className='text-sm font-medium'>Semester</Label>
              <Select
                value={localFilters.semester_id || 'all'}
                onValueChange={(value) =>
                  updateLocalFilter(
                    'semester_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={!localFilters.institution_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select semester' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Semesters</SelectItem>
                  {semesters?.data?.map((semester) => (
                    <SelectItem key={semester.id} value={semester.id}>
                      {semester.semester_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Section Filter */}
          {viewMode === 'admin' && (
            <div className='space-y-2'>
              <Label className='text-sm font-medium'>Section</Label>
              <Select
                value={localFilters.section_name || 'all'}
                onValueChange={(value) =>
                  updateLocalFilter(
                    'section_name',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={!localFilters.semester_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select section' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Sections</SelectItem>
                  {sections?.data?.map((section) => (
                    <SelectItem key={section.id} value={section.section_name}>
                      {section.section_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Faculty and Options */}
        <div className='grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4'>
          {/* Faculty Selection (for admin view) */}
          {viewMode === 'admin' && (
            <div className='space-y-2'>
              <Label className='text-sm font-medium flex items-center gap-2'>
                <Users className='h-3 w-3' />
                Faculty Members
                {localFilters.staff_ids &&
                  localFilters.staff_ids.length > 0 && (
                    <Badge variant='secondary' className='text-xs'>
                      {localFilters.staff_ids.length} selected
                    </Badge>
                  )}
              </Label>
              <div className='max-h-32 overflow-y-auto border rounded p-2 bg-white/50'>
                {(!localFilters.institution_id ||
                  !localFilters.department_id) && (
                  <div className='text-sm text-gray-500 text-center py-8'>
                    Select an institution and department to see faculty.
                  </div>
                )}
                {localFilters.institution_id &&
                  localFilters.department_id &&
                  staffData?.data?.map((staff) => (
                    <div
                      key={staff.id}
                      className='flex items-center space-x-2 py-1'
                    >
                      <Checkbox
                        id={`staff-${staff.id}`}
                        checked={
                          localFilters.staff_ids?.includes(staff.id) || false
                        }
                        onCheckedChange={(checked) => {
                          const currentStaffIds = localFilters.staff_ids || [];
                          if (checked) {
                            updateLocalFilter('staff_ids', [
                              ...currentStaffIds,
                              staff.id
                            ]);
                          } else {
                            updateLocalFilter(
                              'staff_ids',
                              currentStaffIds.filter((id) => id !== staff.id)
                            );
                          }
                        }}
                      />
                      <Label
                        htmlFor={`staff-${staff.id}`}
                        className='text-sm flex-1 cursor-pointer'
                      >
                        {staff.first_name} {staff.last_name}
                      </Label>
                    </div>
                  ))}
                {localFilters.institution_id &&
                  localFilters.department_id &&
                  (!staffData?.data || staffData.data.length === 0) && (
                    <div className='text-sm text-gray-500 text-center py-2'>
                      No faculty members found for the selected department.
                    </div>
                  )}
              </div>
            </div>
          )}

          {/* Options and Format */}
          <div className='space-y-4'>
            {/* Timetable Format Filter */}
            <div className='space-y-2'>
              <Label className='text-sm font-medium'>Timetable Format</Label>
              <Select
                value={localFilters.timetable_format || 'all'}
                onValueChange={(value) =>
                  updateLocalFilter(
                    'timetable_format',
                    value === 'all' ? undefined : value
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Formats</SelectItem>
                  <SelectItem value='regular'>Regular (Day-wise)</SelectItem>
                  <SelectItem value='batch'>Batch (Date-wise)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Options */}
            <div className='space-y-3'>
              <Label className='text-sm font-medium'>Options</Label>
              <div className='space-y-2'>
                <div className='flex items-center space-x-2'>
                  <Checkbox
                    id='include-breaks'
                    checked={localFilters.include_break_slots || false}
                    onCheckedChange={(checked) =>
                      updateLocalFilter('include_break_slots', checked)
                    }
                  />
                  <Label htmlFor='include-breaks' className='text-sm'>
                    Include break periods
                  </Label>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Apply Button */}
        <div className='pt-4 border-t'>
          <Button
            onClick={applyFilters}
            className='w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium py-3 text-base shadow-lg hover:shadow-xl transition-all duration-200'
            size='lg'
          >
            <Filter className='h-5 w-5 mr-2' />
            Apply Filters & Load Calendar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
