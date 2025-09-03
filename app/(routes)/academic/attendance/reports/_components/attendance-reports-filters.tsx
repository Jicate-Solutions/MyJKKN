'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, FilterIcon, XIcon, Search, Check } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  useInstitutions,
  useDegrees,
  useDepartments,
  usePrograms,
  useSemesters,
  useSections,
  useAcademicYears,
  useStaff,
  useExportAttendanceReport,
  type AttendanceReportFilters
} from '@/hooks/academic/use-attendance-analytics';

interface AttendanceReportsFiltersProps {
  filters: AttendanceReportFilters;
  onFiltersChange: (filters: Partial<AttendanceReportFilters>) => void;
  userRole?: string;
}

export function AttendanceReportsFilters({
  filters,
  onFiltersChange,
  userRole
}: AttendanceReportsFiltersProps) {
  const { user } = useAuth();
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [activeFiltersCount, setActiveFiltersCount] = useState(0);
  const [facultyOpen, setFacultyOpen] = useState(false);
  const [facultySearchValue, setFacultySearchValue] = useState('');

  // Query hooks
  const { data: institutions = [] } = useInstitutions();
  const { data: degrees = [] } = useDegrees(
    filters.institution_id || '',
    !!(filters.institution_id && filters.institution_id.trim() !== '')
  );
  const { data: departments = [] } = useDepartments(
    filters.degree_id || '',
    !!(filters.degree_id && filters.degree_id.trim() !== '')
  );
  const { data: programs = [] } = usePrograms(
    filters.department_id || '',
    !!(filters.department_id && filters.department_id.trim() !== '')
  );
  const { data: semesters = [] } = useSemesters(
    filters.program_id || '',
    !!(filters.program_id && filters.program_id.trim() !== '')
  );
  const { data: sections = [] } = useSections(
    filters.semester_id || '',
    !!(filters.semester_id && filters.semester_id.trim() !== '')
  );
  const { data: academicYears = [] } = useAcademicYears();
  const { data: staff = [] } = useStaff(
    filters.institution_id || '',
    user?.role === 'super_admin' || user?.role === 'administrator'
  );

  const exportMutation = useExportAttendanceReport();

  // Determine if user is super admin
  const isSuperAdmin =
    user?.role === 'super_admin' || user?.role === 'administrator';

  // Count active filters
  useEffect(() => {
    let count = 0;
    if (filters.institution_id) count++;
    if (filters.degree_id) count++;
    if (filters.department_id) count++;
    if (filters.program_id) count++;
    if (filters.semester_id) count++;
    if (filters.section_id) count++;
    if (filters.academic_year_id) count++;
    if (filters.staff_id) count++;
    if (filters.start_date) count++;
    if (filters.end_date) count++;
    setActiveFiltersCount(count);
  }, [filters]);

  const handleFilterChange = (
    key: keyof AttendanceReportFilters,
    value: string | undefined
  ) => {
    // Clear dependent filters when parent changes
    const updates: Partial<AttendanceReportFilters> = { [key]: value };

    if (key === 'institution_id') {
      updates.degree_id = undefined;
      updates.department_id = undefined;
      updates.program_id = undefined;
      updates.semester_id = undefined;
      updates.section_id = undefined;
    } else if (key === 'degree_id') {
      updates.department_id = undefined;
      updates.program_id = undefined;
      updates.semester_id = undefined;
      updates.section_id = undefined;
    } else if (key === 'department_id') {
      updates.program_id = undefined;
      updates.semester_id = undefined;
      updates.section_id = undefined;
    } else if (key === 'program_id') {
      updates.semester_id = undefined;
      updates.section_id = undefined;
    } else if (key === 'semester_id') {
      updates.section_id = undefined;
    }

    onFiltersChange(updates);
  };

  const handleDateSelect = (
    key: 'start_date' | 'end_date',
    date: Date | undefined
  ) => {
    onFiltersChange({
      [key]: date ? format(date, 'yyyy-MM-dd') : undefined
    });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      institution_id: undefined,
      degree_id: undefined,
      department_id: undefined,
      program_id: undefined,
      semester_id: undefined,
      section_id: undefined,
      academic_year_id: undefined,
      staff_id: undefined,
      start_date: undefined,
      end_date: undefined
    });
  };

  const handleExport = () => {
    exportMutation.mutate(filters);
  };

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <CardTitle className='text-lg font-medium'>Filters</CardTitle>
          <div className='flex items-center gap-2'>
            {activeFiltersCount > 0 && (
              <Badge variant='secondary'>
                {activeFiltersCount} active filter
                {activeFiltersCount !== 1 ? 's' : ''}
              </Badge>
            )}
            <Button
              variant='outline'
              size='sm'
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
            >
              <FilterIcon className='h-4 w-4 mr-1' />
              {isFiltersOpen ? 'Hide' : 'Show'} Filters
            </Button>
          </div>
        </div>
      </CardHeader>

      {isFiltersOpen && (
        <CardContent className='space-y-4'>
          {/* All Filters in Responsive Grid */}
          <div className='grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'>
            {/* Institution Filter - Only show for Super Admins */}
            {isSuperAdmin && (
              <div className='space-y-2'>
                <Label>Institution</Label>
                <Select
                  value={filters.institution_id || 'all'}
                  onValueChange={(value) =>
                    handleFilterChange(
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
            <div className='space-y-2'>
              <Label>Degree</Label>
              <Select
                value={filters.degree_id || 'all'}
                onValueChange={(value) =>
                  handleFilterChange(
                    'degree_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={isSuperAdmin && !filters.institution_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select degree' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Degrees</SelectItem>
                  {degrees.map((degree) => (
                    <SelectItem key={degree.id} value={degree.id}>
                      {degree.name} ({degree.short_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Department Filter */}
            <div className='space-y-2'>
              <Label>Department</Label>
              <Select
                value={filters.department_id || 'all'}
                onValueChange={(value) =>
                  handleFilterChange(
                    'department_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={!filters.degree_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select department' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Departments</SelectItem>
                  {departments.map((department) => (
                    <SelectItem key={department.id} value={department.id}>
                      {department.name} ({department.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Program Filter */}
            <div className='space-y-2'>
              <Label>Program</Label>
              <Select
                value={filters.program_id || 'all'}
                onValueChange={(value) =>
                  handleFilterChange(
                    'program_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={!filters.department_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select program' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Programs</SelectItem>
                  {programs.map((program) => (
                    <SelectItem key={program.id} value={program.id}>
                      {program.name} ({program.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Semester Filter */}
            <div className='space-y-2'>
              <Label>Semester</Label>
              <Select
                value={filters.semester_id || 'all'}
                onValueChange={(value) =>
                  handleFilterChange(
                    'semester_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={!filters.program_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select semester' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Semesters</SelectItem>
                  {semesters.map((semester) => (
                    <SelectItem key={semester.id} value={semester.id}>
                      {semester.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Section Filter */}
            <div className='space-y-2'>
              <Label>Section</Label>
              <Select
                value={filters.section_id || 'all'}
                onValueChange={(value) =>
                  handleFilterChange(
                    'section_id',
                    value === 'all' ? undefined : value
                  )
                }
                disabled={!filters.semester_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select section' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Sections</SelectItem>
                  {sections.map((section) => (
                    <SelectItem key={section.id} value={section.id}>
                      {section.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Academic Year Filter */}
            <div className='space-y-2'>
              <Label>Academic Year</Label>
              <Select
                value={filters.academic_year_id || 'all'}
                onValueChange={(value) =>
                  handleFilterChange(
                    'academic_year_id',
                    value === 'all' ? undefined : value
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder='Select academic year' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Years</SelectItem>
                  {academicYears.map((year) => (
                    <SelectItem key={year.id} value={year.id}>
                      {year.name} {year.is_current && '(Current)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Faculty Filter - Separate Section (Only for Super Admins) */}
          {isSuperAdmin && (
            <div className='space-y-2'>
              <Label>Faculty Filter</Label>
              <Popover open={facultyOpen} onOpenChange={setFacultyOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    role='combobox'
                    aria-expanded={facultyOpen}
                    className='w-full justify-between font-normal'
                  >
                    {filters.staff_id && filters.staff_id !== 'all'
                      ? (staff || []).find((s) => s.id === filters.staff_id)
                          ?.name || 'Selected Faculty'
                      : 'Select faculty...'}
                    <Search className='ml-2 h-4 w-4 shrink-0 opacity-50' />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-full p-0' align='start'>
                  <div className='flex flex-col'>
                    <div className='p-2 border-b'>
                      <div className='relative'>
                        <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
                        <Input
                          placeholder='Search faculty by name or designation...'
                          value={facultySearchValue}
                          onChange={(e) =>
                            setFacultySearchValue(e.target.value)
                          }
                          className='pl-8'
                        />
                      </div>
                    </div>
                    <div className='max-h-64 overflow-auto p-1'>
                      <button
                        className='relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground'
                        onClick={() => {
                          handleFilterChange('staff_id', undefined);
                          setFacultyOpen(false);
                          setFacultySearchValue('');
                        }}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            !filters.staff_id || filters.staff_id === 'all'
                              ? 'opacity-100'
                              : 'opacity-0'
                          )}
                        />
                        All Faculty
                      </button>
                      {(() => {
                        const filteredStaff = (staff || []).filter(
                          (facultyMember) => {
                            if (!facultySearchValue) return true;
                            const searchLower =
                              facultySearchValue.toLowerCase();
                            const name =
                              facultyMember.name?.toLowerCase() || '';
                            const designation =
                              facultyMember.designation?.toLowerCase() || '';
                            return (
                              name.includes(searchLower) ||
                              designation.includes(searchLower)
                            );
                          }
                        );

                        if (filteredStaff.length === 0 && facultySearchValue) {
                          return (
                            <div className='px-2 py-4 text-center text-sm text-muted-foreground'>
                              No faculty found matching &quot;
                              {facultySearchValue}&quot;
                            </div>
                          );
                        }

                        return filteredStaff.map((facultyMember) => (
                          <button
                            key={facultyMember.id}
                            className='relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground'
                            onClick={() => {
                              handleFilterChange('staff_id', facultyMember.id);
                              setFacultyOpen(false);
                              setFacultySearchValue('');
                            }}
                          >
                            <Check
                              className={cn(
                                'mr-2 h-4 w-4',
                                filters.staff_id === facultyMember.id
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              )}
                            />
                            <div className='flex flex-col items-start'>
                              <span className='font-medium'>
                                {facultyMember.name}
                              </span>
                              <span className='text-xs text-muted-foreground'>
                                {facultyMember.designation}
                              </span>
                            </div>
                          </button>
                        ));
                      })()}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              {filters.staff_id && filters.staff_id !== 'all' && (
                <div className='flex items-center gap-2'>
                  <Badge variant='secondary'>
                    {(staff || []).find((s) => s.id === filters.staff_id)
                      ?.name || 'Selected Faculty'}
                  </Badge>
                  <Button
                    variant='ghost'
                    size='sm'
                    onClick={() => handleFilterChange('staff_id', undefined)}
                  >
                    <XIcon className='h-3 w-3' />
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Date Range Filter - Separate Section */}
          <div className='space-y-2'>
            <Label>Date Range</Label>
            <div className='flex flex-col sm:flex-row gap-2'>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'w-full sm:flex-1 justify-start text-left font-normal',
                      !filters.start_date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {filters.start_date
                      ? format(new Date(filters.start_date), 'PPP')
                      : 'Start date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={
                      filters.start_date
                        ? new Date(filters.start_date)
                        : undefined
                    }
                    onSelect={(date) => handleDateSelect('start_date', date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'w-full sm:flex-1 justify-start text-left font-normal',
                      !filters.end_date && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {filters.end_date
                      ? format(new Date(filters.end_date), 'PPP')
                      : 'End date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={
                      filters.end_date ? new Date(filters.end_date) : undefined
                    }
                    onSelect={(date) => handleDateSelect('end_date', date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Separator />

          <div className='flex items-center justify-between'>
            <div className='flex gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={clearAllFilters}
                disabled={activeFiltersCount === 0}
              >
                <XIcon className='h-4 w-4 mr-1' />
                Clear All
              </Button>
              <Button
                variant='outline'
                size='sm'
                onClick={handleExport}
                disabled={exportMutation.isPending}
              >
                {exportMutation.isPending ? 'Exporting...' : 'Export CSV'}
              </Button>
            </div>
            <p className='text-sm text-muted-foreground'>
              {activeFiltersCount === 0
                ? 'No filters applied'
                : `${activeFiltersCount} filter${
                    activeFiltersCount !== 1 ? 's' : ''
                  } applied`}
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
