'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Calendar,
  Users,
  Search,
  RotateCcw,
  X,
  Check,
  AlertTriangle
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import Loading from '@/components/Loading/Loading';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { useAttendanceRoster } from '@/hooks/academic/use-attendance';
import { useInstitutions } from '@/hooks/organization/use-institutions';
import { useAcademicYears } from '@/hooks/academic/use-academic-years';
import { useDegrees } from '@/hooks/organization/use-degrees';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useDepartments } from '@/hooks/organization/use-departments';
import { useSemesters } from '@/hooks/organization/use-semesters';
import { useSections } from '@/hooks/organization/use-sections';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function AttendancePage() {
  const {
    rosterData,
    availablePeriods,
    loading,
    error,
    searchContext,
    updateSearchContext,
    fetchAttendanceRoster,
    saveAttendance
  } = useAttendanceRoster();

  const { canAccess, isSuperAdmin } = usePermissions();
  const { user } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [studentsForSection, setStudentsForSection] = useState<any[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [sortByRollNo, setSortByRollNo] = useState(true);
  const [sortByName, setSortByName] = useState(false);
  const [allAbsent, setAllAbsent] = useState(false);
  const [studentSearchTerm, setStudentSearchTerm] = useState('');

  // Data hooks for search form
  const { institutions, fetchInstitutions } = useInstitutions({});
  const { academicYears, fetchAcademicYears } = useAcademicYears({});
  const { degrees, fetchDegrees } = useDegrees({});
  const { programs, fetchPrograms } = usePrograms({});
  const { departments, fetchDepartments } = useDepartments({});
  const { semesters, fetchSemesters } = useSemesters({});
  const { sections, fetchSections } = useSections({});

  const canViewAttendance =
    isSuperAdmin || canAccess('academic.attendance', 'view');
  const canMarkAttendance =
    isSuperAdmin || canAccess('academic.attendance', 'create');

  // Load initial data
  useEffect(() => {
    fetchInstitutions();
    // Set default date to today if not set
    if (!searchContext.attendance_date) {
      const today = new Date().toISOString().split('T')[0];
      updateSearchContext({ attendance_date: today });
    }
  }, []);

  // Load dependent data when filters change
  useEffect(() => {
    if (searchContext.institution_id) {
      fetchAcademicYears({
        institution_id: searchContext.institution_id,
        isActive: true
      });
      fetchDegrees({
        institution_id: searchContext.institution_id,
        isActive: true
      });
    }
  }, [searchContext.institution_id]);

  useEffect(() => {
    if (searchContext.institution_id && searchContext.degree_id) {
      fetchPrograms({
        institution_id: searchContext.institution_id,
        degree_id: searchContext.degree_id,
        isActive: true
      });
    }
  }, [searchContext.institution_id, searchContext.degree_id]);

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
    searchContext.program_id
  ]);

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
    searchContext.department_id
  ]);

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
    searchContext.semester_id
  ]);

  // Handle search form submission
  const handleSearch = async () => {
    if (
      !searchContext.institution_id ||
      !searchContext.semester_id ||
      !searchContext.section_id ||
      !searchContext.attendance_date
    ) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setLoadingStudents(true);
      setShowResults(true);

      const { AttendanceService } = await import(
        '@/lib/services/academic/attendance-service'
      );

      // Fetch students for the section
      const students = await AttendanceService.getStudentsForAttendance({
        institution_id: searchContext.institution_id,
        degree_id: searchContext.degree_id || undefined,
        program_id: searchContext.program_id || undefined,
        department_id: searchContext.department_id || undefined,
        semester_id: searchContext.semester_id,
        section_id: searchContext.section_id
      });

      // Add default status to students
      const studentsWithStatus = students.map((student) => ({
        ...student,
        status: 'Present' // Default to Present
      }));

      setStudentsForSection(studentsWithStatus);

      // Fetch available periods for the date
      if (
        searchContext.academic_year_id &&
        searchContext.degree_id &&
        searchContext.program_id &&
        searchContext.department_id
      ) {
        try {
          const periods = await AttendanceService.getAvailablePeriodsForDate(
            {
              institution_id: searchContext.institution_id,
              academic_year_id: searchContext.academic_year_id,
              degree_id: searchContext.degree_id,
              program_id: searchContext.program_id,
              department_id: searchContext.department_id,
              semester: searchContext.semester_id,
              section: searchContext.section_id
            },
            searchContext.attendance_date
          );
          // The periods will be automatically set by the useAttendanceRoster hook
        } catch (periodError) {
          console.warn('Could not fetch periods:', periodError);
        }
      }
    } catch (error) {
      console.error('Error loading students:', error);
      toast.error('Failed to load students');
      setStudentsForSection([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  // Handle reset form
  const handleReset = async () => {
    await updateSearchContext({
      institution_id: null,
      academic_year_id: null,
      degree_id: null,
      program_id: null,
      department_id: null,
      semester_id: null,
      section_id: null,
      attendance_date: new Date().toISOString().split('T')[0]
    });
    setShowResults(false);
    setStudentsForSection([]);
    setSelectedPeriod(null);
  };

  // Handle date selection
  const handleDateSelect = async (date: Date | undefined) => {
    if (date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      await updateSearchContext({ attendance_date: dateString });
      setCalendarOpen(false);
    }
  };

  // Toggle student attendance status
  const toggleStudentStatus = (studentId: string) => {
    setStudentsForSection((prev) =>
      prev.map((student) =>
        student.id === studentId
          ? {
              ...student,
              status: student.status === 'Present' ? 'Absent' : 'Present'
            }
          : student
      )
    );
  };

  // Get student initials for avatar fallback
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  // Filter students based on search term
  const filteredStudents = studentsForSection.filter((student) => {
    if (!studentSearchTerm) return true;

    const searchLower = studentSearchTerm.toLowerCase();
    const nameMatch = student.student_name.toLowerCase().includes(searchLower);
    const rollMatch =
      student.roll_number?.toLowerCase().includes(searchLower) || false;

    return nameMatch || rollMatch;
  });

  if (!canViewAttendance) {
    return <Loading title='Loading attendance...' />;
  }

  return (
    <ContentLayout title='Attendance'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Attendance</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        {/* Header with status indicator */}
        <div className='flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg'>
          <div className='flex-shrink-0'>
            <Check className='h-5 w-5 text-green-600' />
          </div>
          <span className='text-green-800 font-medium'>
            Select the class to record attendance
          </span>
        </div>

        {/* Search Criteria Form */}
        <Card>
          <CardContent className='p-6'>
            <h3 className='text-lg font-medium mb-6'>Search Criteria</h3>

            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6'>
              {/* Institution */}
              <div className='space-y-2'>
                <Label htmlFor='institution'>
                  Institution <span className='text-red-500'>*</span>
                </Label>
                <Select
                  value={searchContext.institution_id || undefined}
                  onValueChange={async (value) =>
                    await updateSearchContext({
                      institution_id: value,
                      academic_year_id: null,
                      degree_id: null,
                      program_id: null,
                      department_id: null,
                      semester_id: null,
                      section_id: null
                    })
                  }
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

              {/* Degree */}
              <div className='space-y-2'>
                <Label htmlFor='degree'>
                  Degree <span className='text-red-500'>*</span>
                </Label>
                <Select
                  value={searchContext.degree_id || undefined}
                  onValueChange={async (value) =>
                    await updateSearchContext({
                      degree_id: value,
                      program_id: null,
                      department_id: null,
                      semester_id: null,
                      section_id: null
                    })
                  }
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
                <Label htmlFor='program'>
                  Program <span className='text-red-500'>*</span>
                </Label>
                <Select
                  value={searchContext.program_id || undefined}
                  onValueChange={async (value) =>
                    await updateSearchContext({
                      program_id: value,
                      department_id: null,
                      semester_id: null,
                      section_id: null
                    })
                  }
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
                <Label htmlFor='department'>
                  Department <span className='text-red-500'>*</span>
                </Label>
                <Select
                  value={searchContext.department_id || undefined}
                  onValueChange={async (value) =>
                    await updateSearchContext({
                      department_id: value,
                      semester_id: null,
                      section_id: null
                    })
                  }
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
                <Label htmlFor='semester'>
                  Semester <span className='text-red-500'>*</span>
                </Label>
                <Select
                  value={searchContext.semester_id || undefined}
                  onValueChange={async (value) =>
                    await updateSearchContext({
                      semester_id: value,
                      section_id: null
                    })
                  }
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
                <Label htmlFor='section'>
                  Section <span className='text-red-500'>*</span>
                </Label>
                <Select
                  value={searchContext.section_id || undefined}
                  onValueChange={async (value) =>
                    await updateSearchContext({ section_id: value })
                  }
                  disabled={!searchContext.semester_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder='Select section' />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={section.id} value={section.id}>
                        {section.section_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Academic Year - Auto-populated */}
              {searchContext.academic_year_id && (
                <div className='space-y-2'>
                  <Label htmlFor='academic-year'>
                    Academic Year (Auto-selected)
                  </Label>
                  <div className='px-3 py-2 border rounded-md bg-muted text-sm'>
                    {academicYears.find(
                      (year) => year.id === searchContext.academic_year_id
                    )?.academic_year_name || 'Loading...'}
                  </div>
                </div>
              )}

              {/* Attendance Date */}
              <div className='space-y-2'>
                <Label htmlFor='date'>
                  Attendance date <span className='text-red-500'>*</span>
                </Label>
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant='outline'
                      className={cn(
                        'w-full justify-start text-left font-normal',
                        !searchContext.attendance_date &&
                          'text-muted-foreground'
                      )}
                    >
                      <Calendar className='mr-2 h-4 w-4' />
                      {searchContext.attendance_date ? (
                        format(
                          new Date(searchContext.attendance_date + 'T00:00:00'),
                          'dd-MM-yyyy'
                        )
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className='w-auto p-0' align='start'>
                    <CalendarComponent
                      mode='single'
                      selected={
                        searchContext.attendance_date
                          ? new Date(
                              searchContext.attendance_date + 'T00:00:00'
                            )
                          : undefined
                      }
                      onSelect={handleDateSelect}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            {/* Action Buttons */}
            <div className='flex gap-3'>
              <Button
                onClick={handleSearch}
                disabled={loading || loadingStudents}
                className='flex items-center gap-2'
              >
                <Search className='h-4 w-4' />
                Search
              </Button>
              <Button
                variant='outline'
                onClick={handleReset}
                className='flex items-center gap-2'
              >
                <RotateCcw className='h-4 w-4' />
                Reset
              </Button>
              <Button variant='ghost' className='flex items-center gap-2'>
                <X className='h-4 w-4' />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {showResults && (
          <>
            {/* Attendance Warning */}
            <div className='flex items-center gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg'>
              <AlertTriangle className='h-5 w-5 text-orange-600' />
              <span className='text-orange-800'>
                Attendance not yet recorded
              </span>
              <div className='ml-auto text-orange-600 text-sm'>
                {(() => {
                  const total = studentsForSection.length;
                  const present = studentsForSection.filter(
                    (s) => s.status === 'Present'
                  ).length;
                  const percentage =
                    total > 0 ? Math.round((present / total) * 100) : 100;
                  const dateStr = searchContext.attendance_date
                    ? format(
                        new Date(searchContext.attendance_date + 'T00:00:00'),
                        'dd-MMM-yyyy'
                      )
                    : '';
                  return `${present}/${total} | ${percentage}% attendance | ${dateStr}`;
                })()}
              </div>
            </div>

            {/* Period Selection and Controls */}
            {availablePeriods.length > 0 && (
              <div className='space-y-4 p-4 bg-blue-50 rounded-lg'>
                <div className='flex flex-wrap items-center gap-4'>
                  <div className='flex items-center gap-2'>
                    <Label>Period:</Label>
                    <Select
                      value={selectedPeriod || undefined}
                      onValueChange={(value) => setSelectedPeriod(value)}
                    >
                      <SelectTrigger className='w-48'>
                        <SelectValue placeholder='Select period' />
                      </SelectTrigger>
                      <SelectContent>
                        {availablePeriods.map((period) => (
                          <SelectItem
                            key={period.timetable_slot_id}
                            value={period.timetable_slot_id}
                          >
                            {period.period_name} ({period.start_time} -{' '}
                            {period.end_time})
                            {period.course && ` - ${period.course.course_name}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className='flex items-center gap-2 flex-1 min-w-[200px]'>
                    <Label>Search:</Label>
                    <div className='relative flex-1'>
                      <Search className='absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground' />
                      <Input
                        placeholder='Search by name or roll number...'
                        value={studentSearchTerm}
                        onChange={(e) => setStudentSearchTerm(e.target.value)}
                        className='pl-10 pr-10'
                      />
                      {studentSearchTerm && (
                        <Button
                          variant='ghost'
                          size='sm'
                          className='absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0'
                          onClick={() => setStudentSearchTerm('')}
                        >
                          <X className='h-4 w-4' />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className='flex flex-wrap items-center gap-4'>
                  <div className='flex items-center gap-2'>
                    <Label>Sort by Roll No.</Label>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setSortByRollNo(!sortByRollNo);
                        setSortByName(false);
                      }}
                    >
                      <Check
                        className={`h-3 w-3 mr-1 ${
                          sortByRollNo ? '' : 'opacity-0'
                        }`}
                      />
                      {sortByRollNo ? 'YES' : 'NO'}
                    </Button>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Label>Name A-Z</Label>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        setSortByName(!sortByName);
                        setSortByRollNo(false);
                      }}
                    >
                      <Check
                        className={`h-3 w-3 mr-1 ${
                          sortByName ? '' : 'opacity-0'
                        }`}
                      />
                      {sortByName ? 'YES' : 'NO'}
                    </Button>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Label>All absent</Label>
                    <Button
                      variant='outline'
                      size='sm'
                      onClick={() => {
                        const newAllAbsent = !allAbsent;
                        setAllAbsent(newAllAbsent);
                        if (newAllAbsent) {
                          setStudentsForSection((prev) =>
                            prev.map((student) => ({
                              ...student,
                              status: 'Absent'
                            }))
                          );
                        } else {
                          setStudentsForSection((prev) =>
                            prev.map((student) => ({
                              ...student,
                              status: 'Present'
                            }))
                          );
                        }
                      }}
                    >
                      <Check
                        className={`h-3 w-3 mr-1 ${
                          allAbsent ? '' : 'opacity-0'
                        }`}
                      />
                      {allAbsent ? 'YES' : 'NO'}
                    </Button>
                  </div>
                  <div className='ml-auto text-blue-800 text-sm'>
                    {filteredStudents.length} of {studentsForSection.length}{' '}
                    student(s)
                  </div>
                </div>
              </div>
            )}

            {/* Save Attendance Button */}
            {!loadingStudents && studentsForSection.length > 0 && (
              <div className='flex justify-end gap-3'>
                <Button
                  variant='outline'
                  onClick={() => {
                    // Mark all as present
                    setStudentsForSection((prev) =>
                      prev.map((student) => ({ ...student, status: 'Present' }))
                    );
                  }}
                >
                  Mark All Present
                </Button>
                <Button
                  variant='outline'
                  onClick={() => {
                    // Mark all as absent
                    setStudentsForSection((prev) =>
                      prev.map((student) => ({ ...student, status: 'Absent' }))
                    );
                  }}
                >
                  Mark All Absent
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      if (!selectedPeriod) {
                        toast.error('Please select a period first');
                        return;
                      }

                      if (!searchContext.institution_id || !user?.id) {
                        toast.error(
                          'Missing required information to save attendance'
                        );
                        return;
                      }

                      // Prepare attendance records
                      const attendanceRecords = studentsForSection.map(
                        (student) => ({
                          student_id: student.id,
                          timetable_slot_id: selectedPeriod,
                          attendance_date: searchContext.attendance_date!,
                          status: student.status as 'Present' | 'Absent',
                          marked_by: user.id,
                          institution_id: searchContext.institution_id!
                        })
                      );

                      // Save using the attendance service
                      const success = await saveAttendance({
                        records: attendanceRecords
                      });

                      if (success) {
                        toast.success('Attendance saved successfully!');
                      } else {
                        toast.error('Failed to save attendance');
                      }
                    } catch (error) {
                      console.error('Error saving attendance:', error);
                      toast.error('Failed to save attendance');
                    }
                  }}
                  className='flex items-center gap-2'
                  disabled={!selectedPeriod || studentsForSection.length === 0}
                >
                  <Check className='h-4 w-4' />
                  Save Attendance
                </Button>
              </div>
            )}

            {/* Loading State */}
            {loadingStudents && (
              <div className='text-center py-8'>
                <Loading title='Loading students...' />
              </div>
            )}

            {/* Students Grid */}
            {!loadingStudents && filteredStudents.length > 0 && (
              <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'>
                {filteredStudents
                  .slice() // Create a copy to avoid mutating original array
                  .sort((a, b) => {
                    if (sortByRollNo) {
                      const rollA = a.roll_number || '';
                      const rollB = b.roll_number || '';
                      return rollA.localeCompare(rollB);
                    } else if (sortByName) {
                      return a.student_name.localeCompare(b.student_name);
                    }
                    return 0; // No sorting
                  })
                  .map((student) => (
                    <Card
                      key={student.id}
                      className='cursor-pointer transition-all hover:shadow-md'
                      onClick={() => toggleStudentStatus(student.id)}
                    >
                      <CardContent className='p-4 text-center'>
                        <Avatar className='h-16 w-16 mx-auto mb-3'>
                          <AvatarImage src={student.student_photo_url} />
                          <AvatarFallback className='text-lg'>
                            {getInitials(student.student_name)}
                          </AvatarFallback>
                        </Avatar>

                        <h4 className='font-medium text-sm mb-1'>
                          {student.student_name}
                        </h4>
                        <p className='text-xs text-muted-foreground mb-3'>
                          {student.roll_number || 'No Roll Number'}
                        </p>

                        <Badge
                          variant={
                            student.status === 'Present'
                              ? 'default'
                              : 'destructive'
                          }
                          className='w-full justify-center'
                        >
                          {student.status || 'Present'}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}

            {/* No Students Found */}
            {!loadingStudents && studentsForSection.length === 0 && (
              <div className='text-center py-8 text-muted-foreground'>
                <Users className='h-12 w-12 mx-auto mb-4 opacity-50' />
                <p>No students found for the selected criteria</p>
              </div>
            )}

            {/* No Students Match Search */}
            {!loadingStudents &&
              studentsForSection.length > 0 &&
              filteredStudents.length === 0 && (
                <div className='text-center py-8 text-muted-foreground'>
                  <Search className='h-12 w-12 mx-auto mb-4 opacity-50' />
                  <p>
                    No students match your search for &ldquo;{studentSearchTerm}
                    &rdquo;
                  </p>
                  <Button
                    variant='outline'
                    size='sm'
                    className='mt-2'
                    onClick={() => setStudentSearchTerm('')}
                  >
                    Clear Search
                  </Button>
                </div>
              )}
          </>
        )}
      </div>
    </ContentLayout>
  );
}
