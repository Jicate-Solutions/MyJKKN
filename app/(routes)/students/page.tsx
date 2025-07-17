'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
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
  Trash,
  RefreshCw,
  AlertCircle,
  BarChart3,
  Settings,
  Users
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useStudents } from '@/hooks/student/use-students';
import { StudentFilters, Student } from '@/types/student';
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
import { DegreeService } from '@/lib/services/organization/degree-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { ProgramService } from '@/lib/services/organization/program-service';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { useAcademicYearsByInstitution } from '@/hooks/academic/use-academic-years';
import { StudentService } from '@/lib/services/student/student-service';
import { DownloadNewStudentTemplateButton } from './_components/download-new-student-template-button';
import { ExportStudents } from './_components/export-students';
import { CreateMissingStudentProfilesButton } from './_components/create-missing-profiles-button';
import { BulkUploadStudentImages } from './_components/bulk-upload-student-images';
import { usePermissions } from '@/hooks/use-permissions';
import {
  CanCreate,
  CanView,
  CanDelete
} from '@/components/auth/permission-guard';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import toast from 'react-hot-toast';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Define the DateRange type
type DateRange = {
  from: Date | undefined;
  to?: Date | undefined;
};

// Student status options
const STUDENT_STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-800' },
  { value: 'inactive', label: 'Inactive', color: 'bg-gray-100 text-gray-800' },
  {
    value: 'pending',
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800'
  },
  { value: 'exited', label: 'Exited', color: 'bg-red-100 text-red-800' },
  { value: 'graduated', label: 'Graduated', color: 'bg-blue-100 text-blue-800' }
] as const;

export default function StudentsPage() {
  const router = useRouter();
  const { canAccess, isSuperAdmin } = usePermissions();
  const [filters, setFilters] = useState<StudentFilters>({
    search: '',
    student_name: '',
    institution: '',
    degree: '',
    department: '',
    program: '',
    semester: '',
    section: '',
    academic_year: '',
    is_profile_complete: true, // Show only complete profiles in the main student list
    page: 1,
    limit: 10
  });
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // State for bulk actions
  const [bulkActionMode, setBulkActionMode] = useState<'delete' | 'status'>(
    'delete'
  );
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [selectedStudentsForStatus, setSelectedStudentsForStatus] = useState<
    Student[]
  >([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // State for hierarchical filters
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [degrees, setDegrees] = useState<
    Array<{ id: string; degree_name: string }>
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
  const [sections, setSections] = useState<
    Array<{ id: string; section_name: string }>
  >([]);
  const [academicYears, setAcademicYears] = useState<
    Array<{ id: string; academic_year_name: string }>
  >([]);

  // Date range state
  const [dateRange, setDateRange] = useState<DateRange>({
    from: undefined,
    to: undefined
  });

  // Use the refactored hook
  const {
    data: studentsData,
    isLoading,
    refetch,
    isError,
    error
  } = useStudents(filters);

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

  // Load degrees when institution changes
  useEffect(() => {
    if (filters.institution) {
      async function loadDegrees() {
        try {
          const data = await DegreeService.getDegreesByInstitution(
            filters.institution as string
          );
          setDegrees(data);
        } catch (error) {
          console.error('Error loading degrees:', error);
        }
      }
      loadDegrees();
    } else {
      setDegrees([]);
    }
  }, [filters.institution]);

  // Load departments when degree changes
  useEffect(() => {
    if (filters.degree) {
      async function loadDepartments() {
        try {
          const data = await DepartmentService.getDepartmentsByDegree(
            filters.degree as string
          );
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
        }
      }
      loadDepartments();
    } else {
      setDepartments([]);
    }
  }, [filters.degree]);

  // Load programs when department changes
  useEffect(() => {
    if (filters.department) {
      async function loadPrograms() {
        try {
          const data = await ProgramService.getProgramsByDepartment(
            filters.department as string
          );
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

  // Load sections when semester and institution are available
  useEffect(() => {
    if (filters.semester && filters.institution) {
      async function loadSections() {
        try {
          const data = await SectionService.getSectionsBySemesterAndInstitution(
            filters.semester as string,
            filters.institution as string
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
  }, [filters.semester, filters.institution]);

  // Load academic years when institution changes
  useEffect(() => {
    if (filters.institution) {
      async function loadAcademicYears() {
        try {
          const data = await AcademicYearService.getAcademicYearsByInstitution(
            filters.institution as string
          );
          setAcademicYears(data);
        } catch (error) {
          console.error('Error loading academic years:', error);
        }
      }
      loadAcademicYears();
    } else {
      setAcademicYears([]);
    }
  }, [filters.institution]);

  // No longer need a useEffect to check permissions, as the hook handles it.

  const handleFilterChange = (newFilters: Partial<StudentFilters>) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: 1
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  };

  const handlePageSizeChange = (pageSize: number) => {
    setFilters((prev) => ({ ...prev, limit: pageSize, page: 1 }));
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

  // Handle bulk delete operation
  const handleBulkDelete = async (students: Student[]) => {
    if (students.length === 0) return;

    try {
      // Delete students one by one (could be optimized with bulk API)
      const promises = students.map((student) =>
        StudentService.deleteStudent(student.id)
      );

      await Promise.all(promises);

      // Refresh the data
      await refetch();

      toast.success(`Successfully deleted ${students.length} student(s)`);
    } catch (error) {
      console.error('Error deleting students:', error);
      toast.error('Failed to delete students');
      throw error; // Re-throw to let DataTable handle the error state
    }
  };

  // Handle bulk status update operation
  const handleBulkStatusUpdate = async (students: Student[]) => {
    if (students.length === 0) return;

    setSelectedStudentsForStatus(students);
    setShowStatusDialog(true);
  };

  // Handle status update confirmation
  const handleStatusUpdateConfirm = async () => {
    if (!selectedStatus || selectedStudentsForStatus.length === 0) {
      toast.error('Please select a status');
      return;
    }

    try {
      setIsUpdatingStatus(true);

      // Update each student's status
      const promises = selectedStudentsForStatus.map((student) =>
        StudentService.updateStudent(
          student.id,
          { status: selectedStatus as any },
          { suppressToast: true }
        )
      );

      await Promise.all(promises);

      // Refresh the data
      await refetch();

      toast.success(
        `Successfully updated status for ${selectedStudentsForStatus.length} student(s)`
      );

      // Reset state
      setShowStatusDialog(false);
      setSelectedStudentsForStatus([]);
      setSelectedStatus('');
    } catch (error) {
      console.error('Error updating student status:', error);
      toast.error('Failed to update student status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handle canceling status update
  const handleStatusUpdateCancel = () => {
    setShowStatusDialog(false);
    setSelectedStudentsForStatus([]);
    setSelectedStatus('');
  };

  // Determine which bulk action to use based on mode
  const getBulkActionFunction = () => {
    if (bulkActionMode === 'delete') {
      return handleBulkDelete;
    } else {
      return handleBulkStatusUpdate;
    }
  };

  // Get bulk action configuration
  const getBulkActionConfig = () => {
    if (bulkActionMode === 'delete') {
      return {
        label: 'Delete',
        icon: Trash,
        variant: 'destructive' as const,
        confirmTitle: 'Are you sure?',
        confirmDescription:
          'This will permanently delete the selected student(s). This action cannot be undone.',
        successMessage: 'Successfully deleted {count} student{plural}',
        errorMessage: 'Failed to delete students',
        loadingText: 'Deleting...'
      };
    } else {
      return {
        label: 'Update Status',
        icon: Settings,
        variant: 'default' as const,
        confirmTitle: '', // Empty to skip default confirmation dialog
        confirmDescription: '',
        successMessage:
          'Successfully updated status for {count} student{plural}',
        errorMessage: 'Failed to update student status',
        loadingText: 'Updating...'
      };
    }
  };

  // Reset all filters except is_profile_complete
  const handleResetFilters = () => {
    setFilters({
      search: '',
      student_name: '',
      institution: '',
      degree: '',
      department: '',
      program: '',
      semester: '',
      section: '',
      academic_year: '',
      gender: undefined,
      entry_type: undefined,
      accommodation_type: undefined,
      status: undefined,
      created_from: undefined,
      created_to: undefined,
      is_profile_complete: undefined,
      page: 1,
      limit: 10
    });
    setDateRange({ from: undefined, to: undefined });
  };

  // Remove a specific filter
  const handleRemoveFilter = (key: keyof StudentFilters) => {
    const newFilters = { ...filters };
    delete newFilters[key];

    // Handle hierarchical dependencies
    if (key === 'institution') {
      delete newFilters.degree;
      delete newFilters.department;
      delete newFilters.program;
      delete newFilters.semester;
      delete newFilters.section;
      delete newFilters.academic_year;
    } else if (key === 'degree') {
      delete newFilters.department;
      delete newFilters.program;
      delete newFilters.semester;
      delete newFilters.section;
    } else if (key === 'department') {
      delete newFilters.program;
      delete newFilters.semester;
      delete newFilters.section;
    } else if (key === 'program') {
      delete newFilters.semester;
      delete newFilters.section;
    } else if (key === 'semester') {
      delete newFilters.section;
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

    if (filters.degree) {
      const degree = degrees.find((d) => d.id === filters.degree);
      if (degree) {
        activeFilters.push(
          <Badge key='degree' variant='outline' className='mr-2 mb-2'>
            Degree: {degree.degree_name}
            <X
              className='ml-1 h-3 w-3 cursor-pointer'
              onClick={() => handleRemoveFilter('degree')}
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

    if (filters.academic_year) {
      const academicYear = academicYears.find(
        (ay) => ay.id === filters.academic_year
      );
      if (academicYear) {
        activeFilters.push(
          <Badge key='academic_year' variant='outline' className='mr-2 mb-2'>
            Academic Year: {academicYear.academic_year_name}
            <X
              className='ml-1 h-3 w-3 cursor-pointer'
              onClick={() => handleRemoveFilter('academic_year')}
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

  // Define columns for the DataTable
  const columns: PermissionColumnDef<Student, any>[] = [
    {
      id: 'serial',
      header: 'S.No',
      cell: ({ row, table }) => {
        const currentPage =
          Math.floor(row.index / (studentsData?.metadata.limit || 10)) + 1;
        const pageSize = studentsData?.metadata.limit || 10;
        return (currentPage - 1) * pageSize + (row.index % pageSize) + 1;
      },
      enableSorting: false
    },
    {
      id: 'student_name',
      header: 'Student Name',
      cell: ({ row }) => (
        <Link
          href={`/students/${row.original.id}`}
          className='hover:underline hover:text-primary font-medium'
        >
          {row.original.student_name}
        </Link>
      ),
      enableSorting: true
    },
    {
      id: 'roll_number',
      header: 'Roll Number',
      cell: ({ row }) =>
        row.original.roll_number || (
          <span className='text-muted-foreground italic'>Not assigned</span>
        ),
      enableSorting: true
    },
    {
      id: 'program',
      header: 'Program',
      cell: ({ row }) => row.original.program?.program_name || 'N/A',
      enableSorting: false
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          variant='default'
          className={cn(
            row.original.status === 'active' && 'bg-green-100 text-green-800',
            row.original.status === 'inactive' && 'bg-gray-100 text-gray-800',
            row.original.status === 'pending' &&
              'bg-yellow-100 text-yellow-800',
            row.original.status === 'exited' && 'bg-red-100 text-red-800',
            row.original.status === 'graduated' && 'bg-blue-100 text-blue-800'
          )}
        >
          {row.original.status.charAt(0).toUpperCase() +
            row.original.status.slice(1)}
        </Badge>
      ),
      enableSorting: true
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className='flex items-center gap-2'>
          <Button size='icon' variant='ghost' asChild>
            <Link href={`/students/${row.original.id}`}>
              <EyeIcon className='h-4 w-4' />
              <span className='sr-only'>View student</span>
            </Link>
          </Button>
          <Button size='icon' variant='ghost' asChild>
            <Link href={`/students/${row.original.id}/edit`}>
              <FileEdit className='h-4 w-4' />
              <span className='sr-only'>Edit student</span>
            </Link>
          </Button>
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      requiredPermission: {
        module: 'students',
        action: 'view'
      }
    }
  ];

  const metadata = studentsData?.metadata || {
    page: 1,
    totalPages: 1,
    limit: 10,
    total: 0
  };

  // Server-side pagination configuration
  const serverSidePagination = {
    currentPage: metadata.page || 1,
    totalPages: metadata.totalPages || 1,
    pageSize: metadata.limit || 10,
    totalItems: metadata.total || 0,
    hasNextPage: (metadata.page || 1) < (metadata.totalPages || 1),
    hasPreviousPage: (metadata.page || 1) > 1,
    onPageChange: handlePageChange,
    onPageSizeChange: handlePageSizeChange,
    isLoading: isLoading
  };

  if (isError) {
    console.error('[StudentsPage] Render Error:', error);
    return (
      <ContentLayout title='Students'>
        <div className='p-4'>
          <Alert variant='destructive'>
            <AlertCircle className='h-4 w-4' />
            <AlertTitle>Error Loading Students</AlertTitle>
            <AlertDescription>
              {error?.message || 'An unexpected error occurred.'}
              <Button
                variant='outline'
                size='sm'
                onClick={() => refetch()}
                className='mt-4'
              >
                Try Again
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      </ContentLayout>
    );
  }

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
        <div className='flex flex-col items-start justify-between gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>Students</h1>
            <p className='text-muted-foreground'>
              Manage and view all student records
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <CanView module='students.analytics'>
              <Link href='/students/dashboard'>
                <Button variant='outline' size='sm'>
                  <BarChart3 className='h-4 w-4 mr-2' />
                  Analytics Dashboard
                </Button>
              </Link>
            </CanView>
            <CanCreate module='students'>
              <Link href='/students/onboarding'>
                <Button variant='outline' size='sm'>
                  <UserCheck className='h-4 w-4 mr-2' />
                  Onboarding
                </Button>
              </Link>
            </CanCreate>
            <CanCreate module='students'>
              <CreateMissingStudentProfilesButton />
            </CanCreate>
            <CanCreate module='students'>
              <BulkUploadStudentImages />
            </CanCreate>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex flex-col gap-2'>
                <CardTitle>Student Records</CardTitle>
                <CardDescription>
                  View and manage all enrolled students
                </CardDescription>
              </div>

              {/* Bulk Action Mode Toggle */}
              <div className='flex items-center gap-2 mt-4 sm:mt-0'>
                <span className='text-sm text-muted-foreground'>
                  Bulk Action:
                </span>
                <Select
                  value={bulkActionMode}
                  onValueChange={(value: 'delete' | 'status') =>
                    setBulkActionMode(value)
                  }
                >
                  <SelectTrigger className='w-[140px]'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='delete'>Delete</SelectItem>
                    <SelectItem value='status'>Update Status</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Basic search and profile status filter */}
            <div className='flex flex-col md:flex-row gap-4 mb-4'>
              <div className='flex-1'>
                {/* Search is handled by DataTable component */}
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
            </div>

            {/* Advanced filter options */}
            {isAdvancedFilterOpen && (
              <div className='mb-6 pb-6 border-b'>
                <h3 className='text-sm font-medium mb-4'>Advanced Filters</h3>

                {/* First row of filters - Institution to Program */}
                <div className='grid gap-4 md:grid-cols-3 mb-4'>
                  <Select
                    value={filters.institution || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        institution: value === 'all' ? undefined : value,
                        degree: undefined,
                        department: undefined,
                        program: undefined,
                        semester: undefined,
                        section: undefined,
                        academic_year: undefined
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
                    value={filters.degree || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        degree: value === 'all' ? undefined : value,
                        department: undefined,
                        program: undefined,
                        semester: undefined,
                        section: undefined
                      })
                    }
                    disabled={!filters.institution}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select Degree' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Degrees</SelectItem>
                      {degrees.map((degree) => (
                        <SelectItem key={degree.id} value={degree.id}>
                          {degree.degree_name}
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
                    disabled={!filters.degree}
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
                </div>

                {/* Second row of filters - Program to Section + Academic Year */}
                <div className='grid gap-4 md:grid-cols-4 mb-4'>
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
                    disabled={!filters.semester || !filters.institution}
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
                    value={filters.academic_year || 'all'}
                    onValueChange={(value) =>
                      handleFilterChange({
                        academic_year: value === 'all' ? undefined : value
                      })
                    }
                    disabled={!filters.institution}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Select Academic Year' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='all'>All Academic Years</SelectItem>
                      {academicYears.map((academicYear) => (
                        <SelectItem
                          key={academicYear.id}
                          value={academicYear.id}
                        >
                          {academicYear.academic_year_name}
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

            {/* Filter-based count display */}
            <div className='flex items-center justify-between mb-4 p-3 bg-muted/30 rounded-lg border'>
              <div className='flex items-center gap-2'>
                <div className='flex items-center gap-1'>
                  <Users className='h-4 w-4 text-muted-foreground' />
                  <span className='text-sm font-medium'>
                    {isLoading ? (
                      'Loading...'
                    ) : (
                      <>
                        Showing {studentsData?.data?.length || 0} of{' '}
                        <span className='font-semibold text-primary'>
                          {metadata.total || 0}
                        </span>{' '}
                        student{metadata.total !== 1 ? 's' : ''}
                        {metadata.total > 0 && (
                          <span className='text-muted-foreground'>
                            {' '}
                            (Page {metadata.page} of {metadata.totalPages})
                          </span>
                        )}
                      </>
                    )}
                  </span>
                </div>
                {!isLoading && metadata.total > 0 && (
                  <Badge variant='secondary' className='ml-2'>
                    {(
                      ((studentsData?.data?.length || 0) /
                        (metadata.total || 1)) *
                      100
                    ).toFixed(1)}
                    % of total
                  </Badge>
                )}
              </div>
              {!isLoading && metadata.total === 0 && (
                <div className='text-sm text-muted-foreground'>
                  No students found matching the current filters
                </div>
              )}
            </div>

            {/* DataTable component */}
            <DataTable
              columns={columns}
              data={studentsData?.data || []}
              searchPlaceholder='Search students...'
              filterColumn='student_name'
              permissions={{
                module: 'students',
                actions: {
                  view: true,
                  create: true,
                  edit: true,
                  delete: true
                },
                showPermissionError: true
              }}
              onBulkAction={getBulkActionFunction()}
              bulkActionConfig={getBulkActionConfig()}
              getRowId={(row) => row.id}
              onRefresh={handleRefresh}
              showRefresh={true}
              serverSidePagination={serverSidePagination}
            />
          </CardContent>
        </Card>

        {/* Status Update Dialog */}
        <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Update Student Status</DialogTitle>
              <DialogDescription>
                Update the status for {selectedStudentsForStatus.length}{' '}
                selected student(s).
              </DialogDescription>
            </DialogHeader>

            <div className='py-4'>
              <div className='space-y-4'>
                <div>
                  <label className='text-sm font-medium mb-2 block'>
                    Select New Status
                  </label>
                  <Select
                    value={selectedStatus}
                    onValueChange={setSelectedStatus}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder='Choose a status' />
                    </SelectTrigger>
                    <SelectContent>
                      {STUDENT_STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          <div className='flex items-center gap-2'>
                            <div
                              className={cn(
                                'w-3 h-3 rounded-full',
                                status.color
                              )}
                            />
                            {status.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className='text-sm font-medium mb-2 block'>
                    Selected Students ({selectedStudentsForStatus.length})
                  </label>
                  <div className='max-h-32 overflow-y-auto border rounded-md p-2'>
                    {selectedStudentsForStatus.map((student) => (
                      <div key={student.id} className='text-sm py-1'>
                        {student.student_name} (
                        {student.roll_number || 'No roll number'})
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant='outline'
                onClick={handleStatusUpdateCancel}
                disabled={isUpdatingStatus}
              >
                Cancel
              </Button>
              <Button
                onClick={handleStatusUpdateConfirm}
                disabled={!selectedStatus || isUpdatingStatus}
              >
                {isUpdatingStatus ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Updating...
                  </>
                ) : (
                  'Update Status'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ContentLayout>
  );
}
