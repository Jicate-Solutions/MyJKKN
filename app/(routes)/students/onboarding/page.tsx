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
  SlidersHorizontal,
  Trash2,
  MoreHorizontal,
  AlertCircle
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
import { Separator } from '@/components/ui/separator';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { useStudents } from '@/hooks/student/use-students';
import { StudentFilters, Student } from '@/types/student';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
import { usePermissions } from '@/hooks/use-permissions';
import { Section } from '@/types/organizations';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { StudentService } from '@/lib/services/student/student-service';
import toast from 'react-hot-toast';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { DownloadNewStudentTemplateButton } from '../_components/download-new-student-template-button';
import { BulkCreateStudents } from '../_components/bulk-create-students';

// Define the DateRange type
type DateRange = {
  from: Date | undefined;
  to?: Date | undefined;
};

export default function StudentOnboardingPage() {
  const router = useRouter();
  const supabase = createClientSupabaseClient();
  const [filters, setFilters] = useState<StudentFilters>({
    search: '',
    is_profile_complete: false,
    page: 1,
    limit: 10
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [isAdvancedFilterOpen, setIsAdvancedFilterOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { canAccess, isSuperAdmin } = usePermissions();

  const canViewOnboarding =
    isSuperAdmin || canAccess('students.onboarding', 'view');
  const canEditOnboarding =
    isSuperAdmin || canAccess('students.onboarding', 'edit');
  const canDeleteOnboarding =
    isSuperAdmin || canAccess('students.onboarding', 'delete');

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
    isError,
    error
  } = useStudents({
    ...filters,
    page: currentPage
  });

  // Debug logging to diagnose the data fetching issue
  useEffect(() => {
    console.log('Student Onboarding Debug Info:', {
      filters: { ...filters, page: currentPage },
      isLoading,
      isError,
      error: error?.message,
      dataCount: studentsData?.data?.length,
      totalCount: studentsData?.metadata?.total,
      canViewOnboarding,
      isSuperAdmin
    });
  }, [
    studentsData,
    isLoading,
    isError,
    error,
    filters,
    currentPage,
    canViewOnboarding,
    isSuperAdmin
  ]);

  // Direct database check for debugging
  useEffect(() => {
    const checkDatabase = async () => {
      try {
        const { data, error } = await supabase
          .from('students')
          .select(
            'id, student_name, is_profile_complete, college_email, roll_number'
          )
          .eq('is_profile_complete', false)
          .limit(5);

        console.log('Direct DB Query - Incomplete Students:', {
          data,
          error,
          count: data?.length
        });

        // Also check total count of all students
        const { count } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true });

        console.log('Total students in database:', count);
      } catch (err) {
        console.error('Direct DB check failed:', err);
      }
    };

    if (canViewOnboarding) {
      checkDatabase();
    }
  }, [supabase, canViewOnboarding]);

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

  // Handle bulk delete operation - suppress service-level toasts
  const handleBulkDelete = async (students: Student[]) => {
    if (students.length === 0) return;

    try {
      // Delete students one by one with error handling
      const results = await Promise.allSettled(
        students.map(async (student) => {
          try {
            // Create a custom delete function that bypasses service toasts
            const { data: studentData, error: fetchError } = await supabase
              .from('students')
              .select('college_email, student_photo_url')
              .eq('id', student.id)
              .single();

            if (fetchError) throw fetchError;

            // Delete student photo from storage if it exists
            if (studentData?.student_photo_url) {
              try {
                const { StorageService } = await import(
                  '@/lib/storage/storage-service'
                );
                await StorageService.deleteStudentPhoto(student.id);
              } catch (photoError) {
                console.warn('Error deleting student photo:', photoError);
              }
            }

            // Delete associated user profile if exists
            if (studentData?.college_email) {
              try {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('id')
                  .eq('email', studentData.college_email)
                  .single();

                if (profile) {
                  await fetch(`/api/users/${profile.id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' }
                  });
                }
              } catch (profileError) {
                console.warn('Error deleting student profile:', profileError);
              }
            }

            // Delete the student record
            const { error: deleteError } = await supabase
              .from('students')
              .delete()
              .eq('id', student.id);

            if (deleteError) throw deleteError;

            return { success: true, id: student.id };
          } catch (error) {
            console.error(`Error deleting student ${student.id}:`, error);
            return { success: false, id: student.id, error };
          }
        })
      );

      // Count successful deletions
      const successful = results.filter(
        (result) => result.status === 'fulfilled' && result.value.success
      ).length;

      const failed = results.length - successful;

      // Refresh the data
      await refetch();

      // Handle results - only throw if all failed
      if (failed === results.length) {
        throw new Error('All deletions failed');
      } else if (failed > 0) {
        console.warn(`${failed} out of ${results.length} deletions failed`);
      }

      // Don't show any additional toasts - let DataTable handle it
    } catch (error) {
      console.error('Error in bulk delete operation:', error);
      throw error; // Re-throw to let DataTable handle the error toast
    }
  };

  // Handle single student delete
  const handleSingleDelete = async (student: Student) => {
    setStudentToDelete(student);
    setDeleteDialogOpen(true);
  };

  const confirmSingleDelete = async () => {
    if (!studentToDelete) return;

    setIsDeleting(true);
    try {
      // Use the same deletion logic as bulk delete for consistency
      const { data: studentData, error: fetchError } = await supabase
        .from('students')
        .select('college_email, student_photo_url')
        .eq('id', studentToDelete.id)
        .single();

      if (fetchError) throw fetchError;

      // Delete student photo from storage if it exists
      if (studentData?.student_photo_url) {
        try {
          const { StorageService } = await import(
            '@/lib/storage/storage-service'
          );
          await StorageService.deleteStudentPhoto(studentToDelete.id);
        } catch (photoError) {
          console.warn('Error deleting student photo:', photoError);
        }
      }

      // Delete associated user profile if exists
      if (studentData?.college_email) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', studentData.college_email)
            .single();

          if (profile) {
            await fetch(`/api/users/${profile.id}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' }
            });
          }
        } catch (profileError) {
          console.warn('Error deleting student profile:', profileError);
        }
      }

      // Delete the student record
      const { error: deleteError } = await supabase
        .from('students')
        .delete()
        .eq('id', studentToDelete.id);

      if (deleteError) throw deleteError;

      // Refresh the data
      await refetch();

      // Show success message
      toast.success(
        `Successfully deleted student: ${studentToDelete.student_name}`
      );

      // Close dialog and reset state
      setDeleteDialogOpen(false);
      setStudentToDelete(null);
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error('Failed to delete student');
    } finally {
      setIsDeleting(false);
    }
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

  // Define columns for the DataTable
  const columns: PermissionColumnDef<Student, any>[] = [
    {
      id: 'serial',
      header: 'S.No',
      cell: ({ row }) => {
        const currentPage = metadata.page || 1;
        const pageSize = metadata.limit || 10;
        return (currentPage - 1) * pageSize + row.index + 1;
      },
      enableSorting: false,
      enableHiding: false
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
      enableSorting: true,
      requiredPermission: {
        module: 'students',
        action: 'view'
      }
    },
    {
      id: 'student_mobile',
      header: 'Mobile',
      cell: ({ row }) => row.original.student_mobile || 'Not provided',
      enableSorting: true
    },
    {
      id: 'program',
      header: 'Program',
      cell: ({ row }) => row.original.program?.program_name || 'Not assigned',
      enableSorting: false
    },
    {
      id: 'missing_info',
      header: 'Missing Info',
      cell: ({ row }) => {
        const student = row.original;
        const missingFields = [];

        if (!student.roll_number) missingFields.push('Roll Number');
        if (!student.college_email) missingFields.push('College Email');
        if (!student.academic_year_id) missingFields.push('Academic Year');
        if (!student.student_photo_url) missingFields.push('Photo');
        if (!student.semester_id) missingFields.push('Semester');
        if (!student.section_id) missingFields.push('Section');

        return (
          <div className='flex flex-wrap gap-1'>
            {missingFields.map((field) => (
              <Badge
                key={field}
                variant='outline'
                className='bg-red-50 text-red-700 border-red-200'
              >
                {field}
              </Badge>
            ))}
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === 'active' ? 'default' : 'secondary'}
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
      cell: ({ row }) => {
        const student = row.original;
        const canView = isSuperAdmin || canAccess('students', 'view');
        const canEdit = isSuperAdmin || canAccess('students', 'edit');
        const canDelete = isSuperAdmin || canDeleteOnboarding;

        return (
          <div className='flex justify-end'>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='ghost' className='h-8 w-8 p-0'>
                  <span className='sr-only'>Open menu</span>
                  <MoreHorizontal className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
                {canView && (
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/students/${student.id}`}
                      className='flex items-center'
                    >
                      <EyeIcon className='mr-2 h-4 w-4' />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                )}
                {canEdit && (
                  <DropdownMenuItem asChild>
                    <Link
                      href={`/students/onboarding/edit?id=${student.id}&returnTo=/students/onboarding`}
                      className='flex items-center'
                    >
                      <FileEdit className='mr-2 h-4 w-4' />
                      Complete Profile
                    </Link>
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => handleSingleDelete(student)}
                      className='flex items-center text-destructive focus:text-destructive'
                    >
                      <Trash2 className='mr-2 h-4 w-4' />
                      Delete Student
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
      enableSorting: false,
      enableHiding: false
    }
  ];

  // Handle page size change
  const handlePageSizeChange = (pageSize: number) => {
    setFilters((prev) => ({ ...prev, limit: pageSize, page: 1 }));
    setCurrentPage(1);
  };

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
    console.error('[StudentOnboardingPage] Render Error:', error);
    return (
      <ContentLayout title='Student Onboarding'>
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
    <ContentLayout title='Student Onboarding'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Students', href: '/students' },
            { label: 'Student Onboarding' }
          ]}
        />

        <div className='flex flex-col sm:flex-row justify-between items-start gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Student Onboarding
            </h1>
            <p className='text-muted-foreground'>
              Complete student profiles to promote them to the main student list
            </p>
          </div>
          <div className='flex flex-col sm:flex-row gap-2 w-full sm:w-auto'>
            {isSuperAdmin && <DownloadNewStudentTemplateButton />}
            {isSuperAdmin && <BulkCreateStudents />}
            {canViewOnboarding && (
              <Button
                variant='default'
                onClick={() => router.push('/students')}
                className='w-full sm:w-auto'
                disabled={!canViewOnboarding}
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
            <CardTitle>Students Pending Onboarding</CardTitle>
            <CardDescription>
              Students with incomplete profile information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex flex-col md:flex-row gap-4 mb-4'>
              <div className='flex-1 relative'>
                {/* Search is now handled by DataTable */}
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

            {/* Debug information */}
            {isError && (
              <Alert variant='destructive' className='mb-4'>
                <AlertCircle className='h-4 w-4' />
                <AlertTitle>Error Loading Students</AlertTitle>
                <AlertDescription>
                  Failed to load student data. Please check the console for
                  details.
                </AlertDescription>
              </Alert>
            )}

            {isLoading && (
              <div className='flex items-center justify-center p-8'>
                <Loader2 className='h-8 w-8 animate-spin' />
                <span className='ml-2'>Loading students...</span>
              </div>
            )}

            {!isLoading && !isError && (
              <div className='mb-4 text-sm text-muted-foreground'>
                {studentsData?.metadata?.total === 0
                  ? 'No incomplete student profiles found.'
                  : `Found ${studentsData?.metadata?.total} incomplete student profile(s)`}
              </div>
            )}

            {/* DataTable component replaces the custom table */}
            <DataTable
              columns={columns}
              data={studentsData?.data || []}
              searchPlaceholder='Search students...'
              filterColumn='student_name'
              permissions={{
                module: 'students.onboarding',
                actions: {
                  view: true,
                  edit: canEditOnboarding,
                  delete: canDeleteOnboarding
                },
                showPermissionError: true
              }}
              onDeleteSelected={
                canDeleteOnboarding ? handleBulkDelete : undefined
              }
              getRowId={(row) => row.id}
              onRefresh={refetch}
              showRefresh={true}
              serverSidePagination={serverSidePagination}
            />
          </CardContent>
        </Card>
      </div>

      {/* Single Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Student</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the student &ldquo;
              <span className='font-semibold'>
                {studentToDelete?.student_name}
              </span>
              &rdquo;? This action cannot be undone and will permanently remove:
              <ul className='list-disc list-inside mt-2 space-y-1'>
                <li>Student profile and data</li>
                <li>Associated user account (if exists)</li>
                <li>Student photo (if uploaded)</li>
                <li>All related records</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSingleDelete}
              disabled={isDeleting}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isDeleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                'Delete Student'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ContentLayout>
  );
}
