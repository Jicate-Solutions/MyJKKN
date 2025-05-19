'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Check,
  EyeIcon,
  FileEdit,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
  UserCheck,
  ChevronDown,
  ChevronUp,
  CalendarIcon,
  MoreHorizontal,
  Trash,
  RefreshCw,
  AlertCircle
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
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
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useStudents } from '@/hooks/student/use-students';
import { StudentFilters } from '@/types/student';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { StudentService } from '@/lib/services/student/student-service';
import { DownloadNewStudentTemplateButton } from './_components/download-new-student-template-button';
import { BulkCreateStudents } from './_components/bulk-create-students';
import { ExportStudents } from './_components/export-students';
import { usePermissions } from '@/hooks/use-permissions';
import {
  CanCreate,
  CanView,
  CanDelete
} from '@/components/auth/permission-guard';
import toast from 'react-hot-toast';

// Define the DateRange type
type DateRange = {
  from: Date | undefined;
  to?: Date | undefined;
};

export default function StudentsPage() {
  const router = useRouter();
  const { canAccess, isSuperAdmin, permissions } = usePermissions();
  const [filters, setFilters] = useState<StudentFilters>({
    search: '',
    student_name: '',
    institution: '',
    program: '',
    department: '',
    is_profile_complete: true,
    page: 1,
    limit: 10
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null);
  const [deleteStudentName, setDeleteStudentName] = useState<string>('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // State for institution/program filters
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [programs, setPrograms] = useState<
    Array<{ id: string; program_name: string }>
  >([]);

  // Date range state
  const [dateRange, setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined
  });

  const {
    data: studentsData,
    isLoading,
    refetch
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

  // Redirect if no access permission
  useEffect(() => {
    // Add a guard to prevent redirects while we're testing
    const shouldRedirect = !isSuperAdmin && !canAccess('students', 'view');

    if (shouldRedirect) {
    } else {
      console.log('Permission check passed! User can access students page');
    }
  }, [isSuperAdmin, canAccess, router, permissions]);

  const handleFilterChange = (newFilters: Partial<StudentFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: 1
    }));
    setCurrentPage(1);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Handle refreshing the student list
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success('Student data refreshed');
    } catch (error) {
      toast.error('Failed to refresh data');
      console.error('Error refreshing student data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle initiating the delete process
  const handleDeleteClick = (studentId: string, studentName: string) => {
    setDeleteStudentId(studentId);
    setDeleteStudentName(studentName);
    setShowDeleteDialog(true);
  };

  // Handle the actual deletion
  const handleConfirmDelete = async () => {
    if (!deleteStudentId) return;

    setIsDeleting(true);
    try {
      await StudentService.deleteStudent(deleteStudentId);
      toast.success(`Student ${deleteStudentName} deleted successfully`);
      refetch(); // Refresh the list after deletion
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error('Failed to delete student');
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
      setDeleteStudentId(null);
      setDeleteStudentName('');
    }
  };

  // Update the filter state when page changes
  useState(() => {
    setFilters((prev) => ({ ...prev, page: currentPage }));
  });

  // Reset all filters except is_profile_complete
  const handleResetFilters = () => {
    setFilters({
      search: '',
      student_name: '',
      institution: '',
      program: '',
      department: '',
      gender: undefined,
      entry_type: undefined,
      accommodation_type: undefined,
      status: undefined,
      created_from: undefined,
      created_to: undefined,
      is_profile_complete: true,
      page: 1,
      limit: 10
    });
    setDateRange({ from: undefined, to: undefined });
    setCurrentPage(1);
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
    } else if (key === 'created_from' || key === 'created_to') {
      if (key === 'created_from') {
        setDateRange((prev) => ({ ...prev, from: undefined }));
      } else {
        setDateRange((prev) => ({ ...prev, to: undefined }));
      }
    }

    setFilters({
      ...newFilters,
      page: 1
    });
    setCurrentPage(1);
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

  const metadata = {
    currentPage,
    totalPages: studentsData?.metadata.totalPages || 1,
    pageSize: studentsData?.metadata.limit || 10,
    totalCount: studentsData?.metadata.total || 0
  };

  return (
    <ContentLayout title='Students'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Students', href: '/students' },
            { label: 'Student Management' }
          ]}
        />
        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Students</h1>
            <p className='text-muted-foreground'>
              Manage enrolled student records
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2 w-full sm:w-auto'>
            <CanCreate module='students' fallback={null}>
              <DownloadNewStudentTemplateButton />
            </CanCreate>
            <CanView module='students' fallback={null}>
              <ExportStudents />
            </CanView>
            <CanCreate module='students' fallback={null}>
              <BulkCreateStudents />
            </CanCreate>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Student Records</CardTitle>
            <CardDescription>
              View and manage all enrolled students
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Basic search */}
            <div className='flex flex-col md:flex-row gap-4 mb-4'>
              <div className='flex-1 relative'>
                <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  placeholder='Search students...'
                  value={filters.search || ''}
                  onChange={(e) =>
                    handleFilterChange({ search: e.target.value })
                  }
                  className='w-full pl-9'
                />
              </div>
              <Select
                value={
                  filters.is_profile_complete !== undefined
                    ? String(filters.is_profile_complete)
                    : 'all'
                }
                onValueChange={(value) => {
                  handleFilterChange({
                    is_profile_complete:
                      value === 'all' ? undefined : value === 'true'
                  });
                }}
              >
                <SelectTrigger className='w-full md:w-[180px]'>
                  <SelectValue placeholder='Profile Status' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Profiles</SelectItem>
                  <SelectItem value='true'>Complete</SelectItem>
                  <SelectItem value='false'>Incomplete</SelectItem>
                </SelectContent>
              </Select>
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
              <Button
                variant='outline'
                className='md:w-auto'
                onClick={handleRefresh}
                disabled={isRefreshing}
                title='Refresh student data'
              >
                <RefreshCw
                  className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                <span className='sr-only'>Refresh</span>
              </Button>
            </div>

            {/* Advanced filter options */}
            {isAdvancedFilterOpen && (
              <div className='mb-6 pb-6 border-b'>
                <h3 className='text-sm font-medium mb-4'>Advanced Filters</h3>

                {/* First row of filters */}
                <div className='grid gap-4 md:grid-cols-3 mb-4'>
                  <Select
                    value={filters.institution || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        institution: value === 'all' ? undefined : value,
                        department: undefined,
                        program: undefined
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
                        program: undefined
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
                        program: value === 'all' ? undefined : value
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

                {/* Second row of filters */}
                <div className='grid gap-4 md:grid-cols-3 mb-4'>
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

                {/* Third row of filters */}
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
                      <SelectItem value='exited'>Exited</SelectItem>
                      <SelectItem value='graduated'>Graduated</SelectItem>
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

            {/* Active filter chips */}
            {renderFilterChips()}

            {isLoading ? (
              <div className='flex flex-col items-center justify-center py-10'>
                <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
                <p className='text-muted-foreground'>
                  Loading student records...
                </p>
              </div>
            ) : (
              <>
                <div className='border rounded-md'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>S.No</TableHead>
                        <TableHead>Student Name</TableHead>
                        <TableHead>Roll Number</TableHead>
                        <TableHead>Program</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {studentsData?.data && studentsData.data.length > 0 ? (
                        studentsData.data.map((student, index) => (
                          <TableRow key={student.id}>
                            <TableCell className='font-medium'>
                              {(currentPage - 1) * metadata.pageSize +
                                index +
                                1}
                            </TableCell>
                            <TableCell className='font-medium'>
                              <Link
                                href={`/students/${student.id}`}
                                className='hover:underline hover:text-primary'
                              >
                                {student.student_name}
                              </Link>
                            </TableCell>
                            <TableCell>
                              {student.roll_number || (
                                <span className='text-muted-foreground italic'>
                                  Not assigned
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {student.program?.program_name || 'N/A'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant='default'
                                className={cn(
                                  student.status === 'active' &&
                                    'bg-green-100 text-green-800',
                                  student.status === 'inactive' &&
                                    'bg-gray-100 text-gray-800',
                                  student.status === 'pending' &&
                                    'bg-yellow-100 text-yellow-800',
                                  student.status === 'exited' &&
                                    'bg-red-100 text-red-800',
                                  student.status === 'graduated' &&
                                    'bg-blue-100 text-blue-800'
                                )}
                              >
                                {student.status.charAt(0).toUpperCase() +
                                  student.status.slice(1)}
                              </Badge>
                            </TableCell>
                            <TableCell className='text-right'>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant='ghost'
                                    className='h-8 w-8 p-0'
                                  >
                                    <span className='sr-only'>Open menu</span>
                                    <MoreHorizontal className='h-4 w-4' />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align='end'>
                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/students/${student.id}`}
                                      className='cursor-pointer'
                                      aria-disabled={
                                        !isSuperAdmin &&
                                        !canAccess('students', 'view')
                                      }
                                      tabIndex={
                                        isSuperAdmin ||
                                        canAccess('students', 'view')
                                          ? 0
                                          : -1
                                      }
                                      style={{
                                        opacity:
                                          isSuperAdmin ||
                                          canAccess('students', 'view')
                                            ? 1
                                            : 0.5,
                                        pointerEvents:
                                          isSuperAdmin ||
                                          canAccess('students', 'view')
                                            ? 'auto'
                                            : 'none'
                                      }}
                                    >
                                      <EyeIcon className='mr-2 h-4 w-4' />
                                      <span>View Details</span>
                                    </Link>
                                  </DropdownMenuItem>

                                  <DropdownMenuItem asChild>
                                    <Link
                                      href={`/students/${student.id}/edit`}
                                      className='cursor-pointer'
                                      aria-disabled={
                                        !isSuperAdmin &&
                                        !canAccess('students', 'edit')
                                      }
                                      tabIndex={
                                        isSuperAdmin ||
                                        canAccess('students', 'edit')
                                          ? 0
                                          : -1
                                      }
                                      style={{
                                        opacity:
                                          isSuperAdmin ||
                                          canAccess('students', 'edit')
                                            ? 1
                                            : 0.5,
                                        pointerEvents:
                                          isSuperAdmin ||
                                          canAccess('students', 'edit')
                                            ? 'auto'
                                            : 'none'
                                      }}
                                    >
                                      <FileEdit className='mr-2 h-4 w-4' />
                                      <span>Edit Student</span>
                                    </Link>
                                  </DropdownMenuItem>

                                  {/* Add more actions as needed with permission checks */}
                                  <DropdownMenuSeparator />

                                  <DropdownMenuItem
                                    className='text-destructive'
                                    onClick={() =>
                                      handleDeleteClick(
                                        student.id,
                                        student.student_name
                                      )
                                    }
                                    disabled={
                                      !isSuperAdmin &&
                                      !canAccess('students', 'delete')
                                    }
                                  >
                                    <Trash className='mr-2 h-4 w-4' />
                                    <span>Delete</span>
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={6} className='h-24 text-center'>
                            No student records found.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {studentsData?.data && studentsData.data.length > 0 && (
                  <div className='flex items-center justify-end space-x-2 py-4'>
                    <div className='text-sm text-muted-foreground'>
                      Showing{' '}
                      <span className='font-medium'>
                        {(currentPage - 1) * metadata.pageSize + 1}
                      </span>{' '}
                      to{' '}
                      <span className='font-medium'>
                        {Math.min(
                          currentPage * metadata.pageSize,
                          metadata.totalCount
                        )}
                      </span>{' '}
                      of{' '}
                      <span className='font-medium'>{metadata.totalCount}</span>{' '}
                      results
                    </div>
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            onClick={() => {
                              if (currentPage > 1) {
                                handlePageChange(currentPage - 1);
                              }
                            }}
                            className={
                              currentPage <= 1
                                ? 'pointer-events-none opacity-50'
                                : ''
                            }
                          />
                        </PaginationItem>
                        {Array.from(
                          { length: metadata.totalPages },
                          (_, i) => i + 1
                        )
                          .filter(
                            (page) =>
                              page === 1 ||
                              page === metadata.totalPages ||
                              Math.abs(page - currentPage) <= 1
                          )
                          .map((page, i, array) => {
                            const showEllipsis =
                              i > 0 && page - array[i - 1] > 1;
                            return (
                              <div key={page} className='flex items-center'>
                                {showEllipsis && (
                                  <PaginationItem>
                                    <span className='px-4'>...</span>
                                  </PaginationItem>
                                )}
                                <PaginationItem>
                                  <PaginationLink
                                    onClick={() => handlePageChange(page)}
                                    isActive={page === currentPage}
                                  >
                                    {page}
                                  </PaginationLink>
                                </PaginationItem>
                              </div>
                            );
                          })}
                        <PaginationItem>
                          <PaginationNext
                            onClick={() => {
                              if (currentPage < metadata.totalPages) {
                                handlePageChange(currentPage + 1);
                              }
                            }}
                            className={
                              currentPage >= metadata.totalPages
                                ? 'pointer-events-none opacity-50'
                                : ''
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {deleteStudentName}&apos;s record and
              all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleConfirmDelete();
              }}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                <>Delete</>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
