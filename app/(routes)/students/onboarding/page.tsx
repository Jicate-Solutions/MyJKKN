'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Check,
  EyeIcon,
  FileEdit,
  Loader2,
  Search,
  UserCheck,
  X,
  ChevronDown,
  ChevronUp,
  Filter,
  CalendarIcon,
  SlidersHorizontal
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/components/ui/pagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { DatePicker } from '@/components/ui/date-picker';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useStudents } from '@/hooks/student/use-students';
import { StudentFilters } from '@/types/student';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { format } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { BulkStudentUpdate } from './_components/bulk-student-update';
import { DownloadStudentTemplateButton } from './_components/download-student-template-button';
import { usePermissions } from '@/hooks/use-permissions';
import { Section } from '@/types/organizations';
import StudentonboardingTable from './_components/student-onboarding-table';

// Define the DateRange type
type DateRange = {
  from: Date | undefined;
  to?: Date | undefined;
};

export default function StudentonboardingPage() {
  const router = useRouter();
  const [filters, setFilters] = useState<StudentFilters>({
    search: '',
    is_profile_complete: false,
    page: 1,
    limit: 10
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewonboarding =
    isSuperAdmin || canAccess('students.onboarding', 'view');
  const canEditonboarding =
    isSuperAdmin || canAccess('students.onboarding', 'edit');

  // State for institution/program/semester/section filters
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);
  const [semesters, setSemesters] = useState<
    Array<{ id: string; semester_name: string; semester_code: string }>
  >([]);
  const [sections, setSections] = useState<Section[]>([]);

  // New states for advanced filters
  const [dateRange, setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined
  });

  const {
    data: studentsData,
    isLoading,
    refetch,
    isError
  } = useStudents({
    ...filters,
    page: currentPage,
    limit: 10
  });

  // Load institutions on mount
  useEffect(() => {
    async function loadInstitutions() {
      try {
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      }
    }
    loadInstitutions();
  }, []);

  // Load departments when institution changes
  useEffect(() => {
    if (filters.institution) {
      async function loadDepartments() {
        try {
          const { data } = await DepartmentService.getDepartments({
            institution_id: filters.institution,
            isActive: true
          });
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
        }
      }
      loadDepartments();
    } else {
      setDepartments([]);
    }
  }, [filters.institution]);

  // Load programs when department changes
  useEffect(() => {
    if (filters.department) {
      async function loadPrograms() {
        try {
          const { data } = await ProgramService.getPrograms({
            department_id: filters.department,
            isActive: true
          });
          setPrograms(data);
        } catch (error) {
          console.error('Error loading programs:', error);
        }
      }
      loadPrograms();
    } else {
      setPrograms([]);
    }
  }, [filters.department]);

  // Load semesters when program changes
  useEffect(() => {
    if (filters.program) {
      async function loadSemesters() {
        try {
          const data = await SemesterService.getSemestersByProgram(
            filters.program as string
          );
          setSemesters(data);
        } catch (error) {
          console.error('Error loading semesters:', error);
        }
      }
      loadSemesters();
    } else {
      setSemesters([]);
    }
  }, [filters.program]);

  // Load sections when semester changes
  useEffect(() => {
    if (filters.semester) {
      async function loadSections() {
        try {
          const data = await SectionService.getSectionsBySemester(
            filters.semester as string
          );
          setSections(data);
        } catch (error) {
          console.error('Error loading sections:', error);
        }
      }
      loadSections();
    } else {
      setSections([]);
    }
  }, [filters.semester]);

  const handleSearchChange = (searchTerm: string) => {
    setFilters({
      ...filters,
      search: searchTerm,
      page: 1
    });
    setCurrentPage(1);
  };

  const handleFilterChange = (newFilters: Partial<StudentFilters>) => {
    setFilters({
      ...filters,
      ...newFilters,
      page: 1
    });
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setFilters({
      ...filters,
      page
    });
  };

  // Remove a specific filter
  const handleRemoveFilter = (key: keyof StudentFilters) => {
    const newFilters = { ...filters };
    delete newFilters[key];

    if (key === 'institution') {
      delete newFilters.department;
      delete newFilters.program;
    } else if (key === 'department') {
      delete newFilters.program;
    }

    setFilters({
      ...newFilters,
      page: 1
    });
    setCurrentPage(1);
  };

  // Reset all filters except is_profile_complete
  const handleResetFilters = () => {
    setFilters({
      is_profile_complete: false,
      page: 1,
      limit: 10
    });
    setCurrentPage(1);
  };

  const renderPagination = () => {
    if (!studentsData || !studentsData.metadata.totalPages) return null;

    const { totalPages, page, total } = studentsData.metadata;

    if (totalPages <= 1) return null;

    const currentPage = page;

    return (
      <Pagination className='mt-4'>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onClick={() =>
                currentPage > 1 && handlePageChange(currentPage - 1)
              }
              className={
                currentPage <= 1 ? 'pointer-events-none opacity-50' : ''
              }
            />
          </PaginationItem>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map(
            (pageNum) => (
              <PaginationItem key={pageNum}>
                <PaginationLink
                  onClick={() => handlePageChange(pageNum)}
                  isActive={pageNum === currentPage}
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            )
          )}

          <PaginationItem>
            <PaginationNext
              onClick={() =>
                currentPage < totalPages && handlePageChange(currentPage + 1)
              }
              className={
                currentPage >= totalPages
                  ? 'pointer-events-none opacity-50'
                  : ''
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  // Render active filter chips
  const renderFilterChips = () => {
    const activeFilters = [];

    if (filters.search) {
      activeFilters.push(
        <Badge key='search' variant='outline' className='mr-2 mb-2'>
          Search: {filters.search}
          <X
            className='ml-1 h-3 w-3 cursor-pointer'
            onClick={() => handleRemoveFilter('search')}
          />
        </Badge>
      );
    }

    if (filters.institution) {
      const institution = institutions.find(
        (i) => i.id === filters.institution
      );
      if (institution) {
        activeFilters.push(
          <Badge key='institution' variant='outline' className='mr-2 mb-2'>
            Institution: {institution.name}
            <X
              className='ml-1 h-3 w-3 cursor-pointer'
              onClick={() => handleRemoveFilter('institution')}
            />
          </Badge>
        );
      }
    }

    if (filters.department) {
      const department = departments.find((d) => d.id === filters.department);
      if (department) {
        activeFilters.push(
          <Badge key='department' variant='outline' className='mr-2 mb-2'>
            Department: {department.department_name}
            <X
              className='ml-1 h-3 w-3 cursor-pointer'
              onClick={() => handleRemoveFilter('department')}
            />
          </Badge>
        );
      }
    }

    if (filters.program) {
      const program = programs.find((p) => p.id === filters.program);
      if (program) {
        activeFilters.push(
          <Badge key='program' variant='outline' className='mr-2 mb-2'>
            Program: {program.program_name}
            <X
              className='ml-1 h-3 w-3 cursor-pointer'
              onClick={() => handleRemoveFilter('program')}
            />
          </Badge>
        );
      }
    }

    if (filters.semester) {
      const semester = semesters.find((s) => s.id === filters.semester);
      if (semester) {
        activeFilters.push(
          <Badge key='semester' variant='outline' className='mr-2 mb-2'>
            Semester: {semester.semester_name}
            <X
              className='ml-1 h-3 w-3 cursor-pointer'
              onClick={() => handleRemoveFilter('semester')}
            />
          </Badge>
        );
      }
    }

    if (filters.section) {
      const section = sections.find((s) => s.id === filters.section);
      if (section) {
        activeFilters.push(
          <Badge key='section' variant='outline' className='mr-2 mb-2'>
            Section: {section.section_name}
            <X
              className='ml-1 h-3 w-3 cursor-pointer'
              onClick={() => handleRemoveFilter('section')}
            />
          </Badge>
        );
      }
    }

    // Add new filter chips
    if (filters.gender) {
      activeFilters.push(
        <Badge key='gender' variant='outline' className='mr-2 mb-2'>
          Gender: {filters.gender}
          <X
            className='ml-1 h-3 w-3 cursor-pointer'
            onClick={() => handleRemoveFilter('gender')}
          />
        </Badge>
      );
    }

    if (filters.entry_type) {
      activeFilters.push(
        <Badge key='entry_type' variant='outline' className='mr-2 mb-2'>
          Entry Type: {filters.entry_type}
          <X
            className='ml-1 h-3 w-3 cursor-pointer'
            onClick={() => handleRemoveFilter('entry_type')}
          />
        </Badge>
      );
    }

    if (filters.accommodation_type) {
      activeFilters.push(
        <Badge key='accommodation_type' variant='outline' className='mr-2 mb-2'>
          Accommodation: {filters.accommodation_type}
          <X
            className='ml-1 h-3 w-3 cursor-pointer'
            onClick={() => handleRemoveFilter('accommodation_type')}
          />
        </Badge>
      );
    }

    if (filters.status) {
      activeFilters.push(
        <Badge key='status' variant='outline' className='mr-2 mb-2'>
          Status: {filters.status}
          <X
            className='ml-1 h-3 w-3 cursor-pointer'
            onClick={() => handleRemoveFilter('status')}
          />
        </Badge>
      );
    }

    if (filters.created_from) {
      activeFilters.push(
        <Badge key='created_from' variant='outline' className='mr-2 mb-2'>
          Created From: {format(filters.created_from, 'dd MMM yyyy')}
          <X
            className='ml-1 h-3 w-3 cursor-pointer'
            onClick={() => handleRemoveFilter('created_from')}
          />
        </Badge>
      );
    }

    if (filters.created_to) {
      activeFilters.push(
        <Badge key='created_to' variant='outline' className='mr-2 mb-2'>
          Created To: {format(filters.created_to, 'dd MMM yyyy')}
          <X
            className='ml-1 h-3 w-3 cursor-pointer'
            onClick={() => handleRemoveFilter('created_to')}
          />
        </Badge>
      );
    }

    return activeFilters.length > 0 ? (
      <div className='mb-4'>
        <div className='flex flex-wrap items-center'>
          <span className='text-sm text-muted-foreground mr-2'>
            Active filters:
          </span>
          {activeFilters}
          {activeFilters.length > 1 && (
            <Button
              variant='ghost'
              size='sm'
              onClick={handleResetFilters}
              className='h-7 text-xs'
            >
              Clear all
            </Button>
          )}
        </div>
      </div>
    ) : null;
  };

  const renderActiveFilters = () => {
    const activeFilters: { key: string; label: string; value: string }[] = [];

    if (filters.institution) {
      const institutionName =
        institutions.find((i) => i.id === filters.institution)?.name ||
        filters.institution;
      activeFilters.push({
        key: 'institution',
        label: 'Institution',
        value: institutionName
      });
    }

    if (filters.department) {
      const departmentName =
        departments.find((d) => d.id === filters.department)?.department_name ||
        filters.department;
      activeFilters.push({
        key: 'department',
        label: 'Department',
        value: departmentName
      });
    }

    if (filters.program) {
      const programName =
        programs.find((p) => p.id === filters.program)?.program_name ||
        filters.program;
      activeFilters.push({
        key: 'program',
        label: 'Program',
        value: programName
      });
    }

    if (activeFilters.length === 0) return null;

    return (
      <div className='flex flex-wrap gap-2 mt-4'>
        {activeFilters.map((filter) => (
          <Badge
            key={filter.key}
            variant='outline'
            className='flex items-center gap-1'
          >
            <span className='text-muted-foreground'>{filter.label}:</span>{' '}
            {filter.value}
            <X
              className='h-3 w-3 ml-1 cursor-pointer'
              onClick={() => {
                if (
                  filter.key === 'created_from' ||
                  filter.key === 'created_to'
                ) {
                  handleFilterChange({ [filter.key]: undefined });
                } else if (filter.key === 'is_active') {
                  handleFilterChange({ is_active: undefined });
                } else {
                  handleFilterChange({ [filter.key]: undefined });
                }
              }}
            />
          </Badge>
        ))}

        <Button
          variant='outline'
          size='sm'
          onClick={() => {
            setFilters({
              is_profile_complete: false,
              page: 1,
              limit: 10
            });
          }}
          className='text-xs h-6'
        >
          Clear All
        </Button>
      </div>
    );
  };

  return (
    <ContentLayout title='Student onboarding'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Students', href: '/students' },
            { label: 'Student onboarding' }
          ]}
        />

        <div className='flex flex-col sm:flex-row justify-between items-start gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Student onboarding
            </h1>
            <p className='text-muted-foreground'>
              Complete student profiles to promote them to the main student list
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2 w-full sm:w-auto'>
            {isSuperAdmin && <DownloadStudentTemplateButton />}
            {isSuperAdmin && <BulkStudentUpdate />}
            {canViewonboarding && (
              <Button
                variant='default'
                onClick={() => router.push('/students')}
                className='w-full sm:w-auto'
                disabled={!canViewonboarding}
              >
                View All Students
              </Button>
            )}
          </div>
        </div>

        <Alert>
          <UserCheck className='h-4 w-4' />
          <AlertTitle>Incomplete Student Profiles</AlertTitle>
          <AlertDescription>
            Students listed here have incomplete profiles. Complete their
            essential information to promote them to the main list.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Students Pending onboarding</CardTitle>
            <CardDescription>
              Students with incomplete profile information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex flex-col md:flex-row gap-4 mb-4'>
              <div className='flex-1 relative'>
                <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  placeholder='Search students...'
                  value={filters.search || ''}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className='w-full pl-9'
                />
              </div>
              <Button
                variant='outline'
                className='md:w-auto'
                onClick={() => setIsAdvancedFilterOpen(!isAdvancedFilterOpen)}
              >
                <SlidersHorizontal className='h-4 w-4 mr-2' />
                {isAdvancedFilterOpen ? 'Hide Filters' : 'Advanced Filters'}
                {isAdvancedFilterOpen ? (
                  <ChevronUp className='h-4 w-4 ml-2' />
                ) : (
                  <ChevronDown className='h-4 w-4 ml-2' />
                )}
              </Button>
            </div>

            {isAdvancedFilterOpen && (
              <div className='mb-6 pb-6 border-b'>
                <h3 className='text-sm font-medium mb-4'>Advanced Filters</h3>

                <div className='grid gap-4 md:grid-cols-3 mb-4'>
                  <Select
                    value={filters.institution || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        institution: value === 'all' ? undefined : value,
                        department: undefined,
                        program: undefined,
                        semester: undefined,
                        section: undefined
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select Institution' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Institutions</SelectItem>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={filters.department || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        department: value === 'all' ? undefined : value,
                        program: undefined,
                        semester: undefined,
                        section: undefined
                      })
                    }
                    disabled={!filters.institution}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select Department' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Departments</SelectItem>
                      {departments.map((dept) => (
                        <SelectItem key={dept.id} value={dept.id}>
                          {dept.department_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={filters.program || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        program: value === 'all' ? undefined : value,
                        semester: undefined,
                        section: undefined
                      })
                    }
                    disabled={!filters.department}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select Program' />
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
                </div>

                <div className='grid gap-4 md:grid-cols-3 mb-4'>
                  <Select
                    value={filters.semester || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        semester: value === 'all' ? undefined : value,
                        section: undefined
                      })
                    }
                    disabled={!filters.program}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select Semester' />
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

                  <Select
                    value={filters.section || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        section: value === 'all' ? undefined : value
                      })
                    }
                    disabled={!filters.semester}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select Section' />
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

                  <Select
                    value={filters.gender || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        gender: value === 'all' ? undefined : value
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select Gender' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Genders</SelectItem>
                      <SelectItem value='Male'>Male</SelectItem>
                      <SelectItem value='Female'>Female</SelectItem>
                      <SelectItem value='Other'>Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='grid gap-4 md:grid-cols-3 mb-4'>
                  <Select
                    value={filters.entry_type || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        entry_type: value === 'all' ? undefined : value
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Entry Type' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Entry Types</SelectItem>
                      <SelectItem value='FIRST YEAR'>First Year</SelectItem>
                      <SelectItem value='LATERAL ENTRY'>
                        Lateral Entry
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <Select
                    value={filters.accommodation_type || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        accommodation_type: value === 'all' ? undefined : value
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Accommodation Type' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>
                        All Accommodation Types
                      </SelectItem>
                      <SelectItem value='DAY SCHOLAR'>Day Scholar</SelectItem>
                      <SelectItem value='HOSTEL'>Hostel</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className='grid gap-4 md:grid-cols-3 mb-4'>
                  <Select
                    value={filters.status || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        status: value === 'all' ? undefined : value
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Status' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Statuses</SelectItem>
                      <SelectItem value='active'>Active</SelectItem>
                      <SelectItem value='inactive'>Inactive</SelectItem>
                      <SelectItem value='pending'>Pending</SelectItem>
                    </SelectContent>
                  </Select>

                  <div className='grid gap-2'>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          id='date'
                          variant={'outline'}
                          className={cn(
                            'w-full justify-start text-left font-normal',
                            !dateRange.from && 'text-muted-foreground'
                          )}
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
                            <span>Creation Date Range</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className='w-auto p-0' align='start'>
                        <Calendar
                          initialFocus
                          mode='range'
                          defaultMonth={dateRange.from}
                          selected={dateRange}
                          onSelect={(range) => {
                            setDateRange(
                              range || { from: undefined, to: undefined }
                            );
                            if (range?.from) {
                              handleFilterChange({
                                created_from: range.from
                              });
                            } else {
                              handleFilterChange({
                                created_from: undefined
                              });
                            }

                            if (range?.to) {
                              handleFilterChange({
                                created_to: range.to
                              });
                            } else {
                              handleFilterChange({
                                created_to: undefined
                              });
                            }
                          }}
                          numberOfMonths={2}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className='flex justify-end mt-4'>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={handleResetFilters}
                    className='mr-2'
                  >
                    Reset Filters
                  </Button>
                  <Button
                    size='sm'
                    onClick={() => setIsAdvancedFilterOpen(false)}
                  >
                    Apply Filters
                  </Button>
                </div>
              </div>
            )}

            {renderFilterChips()}

            {isLoading ? (
              <div className='flex flex-col items-center justify-center py-10'>
                <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
                <p className='text-muted-foreground'>
                  Loading student records...
                </p>
              </div>
            ) : isError ? (
              <div className='py-10 text-center'>
                <p className='text-destructive font-medium'>
                  Failed to load students
                </p>
                <Button
                  variant='outline'
                  size='sm'
                  className='mt-2'
                  onClick={() => refetch()}
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <>
                <StudentonboardingTable
                  students={studentsData?.data || []}
                  isLoading={isLoading}
                  onRefresh={refetch}
                />
                {renderPagination()}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
