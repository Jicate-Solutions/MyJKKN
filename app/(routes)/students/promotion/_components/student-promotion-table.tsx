'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  ArrowUp,
  MoreVertical,
  AlertTriangle,
  CheckCircle,
  X,
  RefreshCw,
  GraduationCap
} from 'lucide-react';
import { Student } from '@/types/student';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { toast } from 'react-hot-toast';
import { SemesterService } from '@/lib/services/organization/semester-service';
import { SectionService } from '@/lib/services/organization/section-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { AcademicYearService } from '@/lib/services/academic/academic-year-service';
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

interface StudentPromotionTableProps {
  students: Student[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  canEdit: boolean;
  onBulkPromote: (
    studentIds: string[],
    semesterId: string,
    sectionId: string,
    departmentId?: string,
    academicYearId?: string,
    onProgress?: (progress: number, success: string[], failed: { id: string; error: string }[]) => void
  ) => Promise<boolean>;
  onBulkUpdateStatus: (
    studentIds: string[],
    newStatus: 'active' | 'inactive' | 'pending' | 'exited' | 'graduated',
    onProgress?: (progress: number, success: string[], failed: { id: string; error: string }[]) => void
  ) => Promise<boolean>;
}

const promotionSchema = z.object({
  department_id: z.string().optional(),
  semester_id: z.string().min(1, 'Semester is required'),
  section_id: z.string().min(1, 'Section is required'),
  academic_year_id: z.string().optional()
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

// Status promotion schema
const statusPromotionSchema = z.object({
  new_status: z.enum(['active', 'inactive', 'pending', 'exited', 'graduated'], {
    required_error: 'Please select a status'
  })
});

type StatusPromotionFormValues = z.infer<typeof statusPromotionSchema>;

// Status labels for display
const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: 'Active', color: 'bg-green-100 text-green-800' },
  inactive: { label: 'Inactive', color: 'bg-gray-100 text-gray-800' },
  pending: { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' },
  exited: { label: 'Exited', color: 'bg-red-100 text-red-800' },
  graduated: { label: 'Graduated', color: 'bg-blue-100 text-blue-800' }
};

export function StudentPromotionTable({
  students,
  metadata,
  onPageChange,
  onPageSizeChange,
  canEdit,
  onBulkPromote,
  onBulkUpdateStatus
}: StudentPromotionTableProps) {
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [showConfirmationDialog, setShowConfirmationDialog] = useState(false);
  const [singleStudentId, setSingleStudentId] = useState<string | null>(null);
  const [bulkPromotionStudents, setBulkPromotionStudents] = useState<Student[]>(
    []
  );
  const [currentDialogStudents, setCurrentDialogStudents] = useState<Student[]>(
    []
  );
  const [isPromoting, setIsPromoting] = useState(false);
  const [pendingPromotionData, setPendingPromotionData] = useState<{
    department_id?: string;
    semester_id: string;
    section_id: string;
    academic_year_id?: string;
    departmentName?: string;
    semesterName: string;
    sectionName: string;
    academicYearName?: string;
  } | null>(null);
  
  // Progress tracking states
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [promotionProgress, setPromotionProgress] = useState(0);
  const [promotionResults, setPromotionResults] = useState<{
    success: string[];
    failed: { id: string; error: string }[];
    total: number;
  }>({
    success: [],
    failed: [],
    total: 0
  });

  // Status promotion states
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [showStatusConfirmationDialog, setShowStatusConfirmationDialog] = useState(false);
  const [showStatusProgressDialog, setShowStatusProgressDialog] = useState(false);
  const [statusDialogStudents, setStatusDialogStudents] = useState<Student[]>([]);
  const [pendingStatusData, setPendingStatusData] = useState<{
    new_status: 'active' | 'inactive' | 'pending' | 'exited' | 'graduated';
    statusLabel: string;
  } | null>(null);
  const [statusProgress, setStatusProgress] = useState(0);
  const [statusResults, setStatusResults] = useState<{
    success: string[];
    failed: { id: string; error: string }[];
    total: number;
  }>({
    success: [],
    failed: [],
    total: 0
  });
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // State for departments, semesters, sections and academic years
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string }>
  >([]);
  const [semesters, setSemesters] = useState<
    Array<{ id: string; semester_name: string }>
  >([]);
  const [sections, setSections] = useState<
    Array<{ id: string; section_name: string }>
  >([]);
  const [academicYears, setAcademicYears] = useState<
    Array<{ id: string; academic_year_name: string }>
  >([]);

  // Set up the form
  const form = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionSchema),
    defaultValues: {
      department_id: undefined,
      semester_id: '',
      section_id: '',
      academic_year_id: undefined
    }
  });

  // Status promotion form
  const statusForm = useForm<StatusPromotionFormValues>({
    resolver: zodResolver(statusPromotionSchema),
    defaultValues: {
      new_status: undefined
    }
  });

  // Watch semester_id to load sections
  const watchedSemesterId = form.watch('semester_id');

  // Load departments and semesters when promotion dialog opens
  const handleOpenPromotionDialog = async (
    studentId?: string,
    bulkStudents?: Student[]
  ) => {
    try {
      // Reset form values
      form.reset({
        department_id: undefined,
        semester_id: '',
        section_id: '',
        academic_year_id: undefined
      });

      if (studentId) {
        setSingleStudentId(studentId);
        setCurrentDialogStudents([]);
      } else {
        setSingleStudentId(null);
        setCurrentDialogStudents(bulkStudents || bulkPromotionStudents);
      }

      // Get unique program IDs, degree IDs, and institution IDs from selected students
      const studentsToCheck = studentId
        ? students.filter((s) => s.id === studentId)
        : bulkStudents || bulkPromotionStudents;

      const uniqueProgramIds = [
        ...new Set(studentsToCheck.map((s) => s.program_id))
      ];
      const uniqueDegreeIds = [
        ...new Set(studentsToCheck.map((s) => s.degree_id))
      ];
      const uniqueInstitutionIds = [
        ...new Set(studentsToCheck.map((s) => s.institution_id))
      ];

      if (uniqueProgramIds.length > 1) {
        toast.error(
          'Selected students must be from the same program for promotion'
        );
        return;
      }

      if (uniqueInstitutionIds.length > 1) {
        toast.error(
          'Selected students must be from the same institution for promotion'
        );
        return;
      }

      if (uniqueProgramIds.length === 0 || !uniqueProgramIds[0]) {
        toast.error('No valid program found for the selected students');
        return;
      }

      if (uniqueInstitutionIds.length === 0 || !uniqueInstitutionIds[0]) {
        toast.error('No valid institution found for the selected students');
        return;
      }

      // Load departments for the degree (if all students have the same degree)
      if (uniqueDegreeIds.length === 1 && uniqueDegreeIds[0]) {
        try {
          const departmentsData =
            await DepartmentService.getDepartmentsByDegree(uniqueDegreeIds[0]);
          setDepartments(departmentsData);
        } catch (error) {
          console.error('Error loading departments:', error);
          setDepartments([]);
        }
      } else {
        setDepartments([]);
      }

      // Load semesters for the program
      const semestersData = await SemesterService.getSemestersByProgram(
        uniqueProgramIds[0]
      );
      setSemesters(semestersData);

      // Load academic years for the institution
      try {
        const academicYearsData = await AcademicYearService.getAcademicYearsByInstitution(
          uniqueInstitutionIds[0]
        );
        setAcademicYears(academicYearsData);
      } catch (error) {
        console.error('Error loading academic years:', error);
        setAcademicYears([]);
      }

      // Show the dialog
      setShowPromotionDialog(true);
    } catch (error) {
      console.error('Error preparing promotion dialog:', error);
      toast.error('Failed to load promotion options');
    }
  };

  // Load sections when semester changes
  const loadSections = async (semesterId: string) => {
    try {
      // Get the institution ID from selected students
      const studentsToCheck = singleStudentId
        ? students.filter((s) => s.id === singleStudentId)
        : currentDialogStudents;

      if (studentsToCheck.length === 0) {
        setSections([]);
        return;
      }

      const institutionId = studentsToCheck[0]?.institution_id;
      if (!institutionId) {
        console.log('No institution_id found for selected students');
        setSections([]);
        return;
      }

      // Use the new method that filters by both semester and institution
      const sectionsData =
        await SectionService.getSectionsBySemesterAndInstitution(
          semesterId,
          institutionId
        );
      setSections(sectionsData);
    } catch (error) {
      console.error('Error loading sections:', error);
      toast.error('Failed to load sections');
    }
  };

  // Handle form submission - now shows confirmation dialog instead of directly promoting
  const handlePromote = async (data: PromotionFormValues) => {
    try {
      // Get the list of students to promote
      const studentsToPromote = singleStudentId
        ? students.filter((s) => s.id === singleStudentId)
        : currentDialogStudents;

      if (studentsToPromote.length === 0) {
        toast.error('No students selected for promotion');
        return;
      }

      // Get semester and section names for display
      const selectedSemester = semesters.find((s) => s.id === data.semester_id);
      const selectedSection = sections.find((s) => s.id === data.section_id);
      const selectedDepartment = data.department_id
        ? departments.find((d) => d.id === data.department_id)
        : null;
      const selectedAcademicYear = data.academic_year_id
        ? academicYears.find((a) => a.id === data.academic_year_id)
        : null;

      if (!selectedSemester || !selectedSection) {
        toast.error('Invalid semester or section selection');
        return;
      }

      // Store the promotion data for confirmation
      setPendingPromotionData({
        department_id: data.department_id,
        semester_id: data.semester_id,
        section_id: data.section_id,
        academic_year_id: data.academic_year_id,
        departmentName: selectedDepartment?.department_name,
        semesterName: selectedSemester.semester_name,
        sectionName: selectedSection.section_name,
        academicYearName: selectedAcademicYear?.academic_year_name
      });

      // Hide the form dialog and show confirmation dialog
      setShowPromotionDialog(false);
      setShowConfirmationDialog(true);
    } catch (error) {
      console.error('Error preparing promotion confirmation:', error);
      toast.error('Failed to prepare promotion');
    }
  };

  // Handle final confirmation and execute promotion
  const handleConfirmPromotion = async () => {
    if (!pendingPromotionData) {
      toast.error('No promotion data available');
      return;
    }

    try {
      setIsPromoting(true);

      // Get the list of student IDs to promote
      const studentsToPromote = singleStudentId
        ? [singleStudentId]
        : currentDialogStudents.map((s) => s.id);

      // Initialize progress tracking
      setPromotionResults({
        success: [],
        failed: [],
        total: studentsToPromote.length
      });
      setPromotionProgress(0);
      
      // Hide confirmation dialog and show progress dialog
      setShowConfirmationDialog(false);
      setShowProgressDialog(true);

      // Call the bulk promote function with optional department, academic year and progress callback
      const success = await onBulkPromote(
        studentsToPromote,
        pendingPromotionData.semester_id,
        pendingPromotionData.section_id,
        pendingPromotionData.department_id,
        pendingPromotionData.academic_year_id,
        (progress, successList, failedList) => {
          setPromotionProgress(progress);
          setPromotionResults({
            success: successList,
            failed: failedList,
            total: studentsToPromote.length
          });
        }
      );

      if (success) {
        toast.success(
          `Successfully promoted ${studentsToPromote.length} student${
            studentsToPromote.length > 1 ? 's' : ''
          }`
        );
      }
    } catch (error) {
      console.error('Error promoting students:', error);
      toast.error('Failed to promote students');
    } finally {
      setIsPromoting(false);
    }
  };

  // Handle canceling confirmation
  const handleCancelConfirmation = () => {
    setShowConfirmationDialog(false);
    setShowPromotionDialog(true); // Go back to form dialog
    setPendingPromotionData(null);
  };

  // Handle closing progress dialog
  const handleCloseProgressDialog = () => {
    setShowProgressDialog(false);
    // Reset all states
    setBulkPromotionStudents([]);
    setCurrentDialogStudents([]);
    setSingleStudentId(null);
    setPendingPromotionData(null);
    setPromotionProgress(0);
    setPromotionResults({
      success: [],
      failed: [],
      total: 0
    });
  };

  // Handle bulk promotion using the new bulk action system
  const handleBulkAction = async (selectedStudents: Student[]) => {
    if (selectedStudents.length > 0 && canEdit) {
      setBulkPromotionStudents(selectedStudents);
      await handleOpenPromotionDialog(undefined, selectedStudents);
    }
  };

  // =============================================
  // STATUS PROMOTION HANDLERS
  // =============================================

  // Open status update dialog
  const handleOpenStatusDialog = (selectedStudents: Student[]) => {
    if (selectedStudents.length === 0) {
      toast.error('No students selected');
      return;
    }
    statusForm.reset({ new_status: undefined });
    setStatusDialogStudents(selectedStudents);
    setShowStatusDialog(true);
  };

  // Handle status form submission - show confirmation
  const handleStatusSubmit = (data: StatusPromotionFormValues) => {
    const statusInfo = STATUS_LABELS[data.new_status];
    setPendingStatusData({
      new_status: data.new_status,
      statusLabel: statusInfo.label
    });
    setShowStatusDialog(false);
    setShowStatusConfirmationDialog(true);
  };

  // Handle status confirmation and execute update
  const handleConfirmStatusUpdate = async () => {
    if (!pendingStatusData) {
      toast.error('No status data available');
      return;
    }

    try {
      setIsUpdatingStatus(true);

      const studentIds = statusDialogStudents.map((s) => s.id);

      // Initialize progress tracking
      setStatusResults({
        success: [],
        failed: [],
        total: studentIds.length
      });
      setStatusProgress(0);

      // Hide confirmation dialog and show progress dialog
      setShowStatusConfirmationDialog(false);
      setShowStatusProgressDialog(true);

      // Call the bulk status update function
      const success = await onBulkUpdateStatus(
        studentIds,
        pendingStatusData.new_status,
        (progress, successList, failedList) => {
          setStatusProgress(progress);
          setStatusResults({
            success: successList,
            failed: failedList,
            total: studentIds.length
          });
        }
      );

      if (success) {
        toast.success(
          `Successfully updated status for ${studentIds.length} student${
            studentIds.length > 1 ? 's' : ''
          } to ${pendingStatusData.statusLabel}`
        );
      }
    } catch (error) {
      console.error('Error updating student status:', error);
      toast.error('Failed to update student status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Handle canceling status confirmation
  const handleCancelStatusConfirmation = () => {
    setShowStatusConfirmationDialog(false);
    setShowStatusDialog(true); // Go back to form dialog
    setPendingStatusData(null);
  };

  // Handle closing status progress dialog
  const handleCloseStatusProgressDialog = () => {
    setShowStatusProgressDialog(false);
    // Reset all status states
    setStatusDialogStudents([]);
    setPendingStatusData(null);
    setStatusProgress(0);
    setStatusResults({
      success: [],
      failed: [],
      total: 0
    });
  };

  // Get current status info for selected students
  const getCurrentStatusInfo = () => {
    if (statusDialogStudents.length === 0) return null;

    // Count status distribution
    const statusCounts: Record<string, number> = {};
    statusDialogStudents.forEach((student) => {
      const status = student.status || 'unknown';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    return {
      studentCount: statusDialogStudents.length,
      statusDistribution: Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
        label: STATUS_LABELS[status]?.label || status,
        color: STATUS_LABELS[status]?.color || 'bg-gray-100 text-gray-800'
      }))
    };
  };

  // Handle bulk status action from data table
  const handleBulkStatusAction = (selectedStudents: Student[]) => {
    if (selectedStudents.length > 0 && canEdit) {
      handleOpenStatusDialog(selectedStudents);
    }
  };

  // =============================================
  // END STATUS PROMOTION HANDLERS
  // =============================================

  // Get current semester/section/department info for selected students
  const getCurrentPromotionInfo = () => {
    const studentsToCheck = singleStudentId
      ? students.filter((s) => s.id === singleStudentId)
      : currentDialogStudents;

    if (studentsToCheck.length === 0) return null;

    // Get unique current departments, semesters, sections and academic years
    const currentDepartments = [
      ...new Set(
        studentsToCheck
          .map((s) => s.department?.department_name)
          .filter(Boolean)
      )
    ];
    const currentSemesters = [
      ...new Set(
        studentsToCheck.map((s) => s.semester?.semester_name).filter(Boolean)
      )
    ];
    const currentSections = [
      ...new Set(
        studentsToCheck.map((s) => s.section?.section_name).filter(Boolean)
      )
    ];
    const currentAcademicYears = [
      ...new Set(
        studentsToCheck.map((s) => s.academic_year?.academic_year_name).filter(Boolean)
      )
    ];

    return {
      currentDepartments,
      currentSemesters,
      currentSections,
      currentAcademicYears,
      studentCount: studentsToCheck.length
    };
  };

  // Define columns for the DataTable
  const columns: PermissionColumnDef<Student, any>[] = [
    {
      id: 'student_name',
      header: 'Student Name',
      cell: ({ row }) => (
        <Link
          href={`/students/${row.original.id}`}
          className='font-medium hover:underline hover:text-primary'
        >
          {`${row.original.first_name} ${row.original.last_name || ''}`.trim()}
        </Link>
      ),
      enableSorting: true
    },
    {
      id: 'roll_number',
      header: 'Roll Number',
      cell: ({ row }) => row.original.roll_number || 'N/A',
      enableSorting: true
    },
    {
      id: 'program',
      header: 'Program',
      cell: ({ row }) => row.original.program?.program_name || 'N/A',
      enableSorting: false
    },
    {
      id: 'current_semester',
      header: 'Current Semester',
      cell: ({ row }) => row.original.semester?.semester_name || 'N/A',
      enableSorting: false
    },
    {
      id: 'current_section',
      header: 'Current Section',
      cell: ({ row }) => row.original.section?.section_name || 'N/A',
      enableSorting: false
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.status || 'unknown';
        const statusInfo = STATUS_LABELS[status] || { label: status, color: 'bg-gray-100 text-gray-800' };
        return (
          <Badge className={`${statusInfo.color} font-medium`}>
            {statusInfo.label}
          </Badge>
        );
      },
      enableSorting: false
    },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='ghost' className='h-8 w-8 p-0'>
              <span className='sr-only'>Open menu</span>
              <MoreVertical className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href={`/students/${row.original.id}`}>View Profile</Link>
            </DropdownMenuItem>
            {canEdit && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => handleOpenPromotionDialog(row.original.id)}
                >
                  <ArrowUp className='h-4 w-4 mr-2' />
                  Promote Student
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleOpenStatusDialog([row.original])}
                >
                  <RefreshCw className='h-4 w-4 mr-2' />
                  Update Status
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
      enableSorting: false,
      enableHiding: false
    }
  ];

  // Server-side pagination configuration
  const serverSidePagination = {
    currentPage: metadata.page,
    totalPages: metadata.totalPages,
    pageSize: metadata.limit,
    totalItems: metadata.total,
    hasNextPage: metadata.page < metadata.totalPages,
    hasPreviousPage: metadata.page > 1,
    onPageChange: onPageChange,
    onPageSizeChange: onPageSizeChange,
    isLoading: false
  };

  // Bulk action configuration for promotion - disable confirmation dialog
  const bulkActionConfig = {
    label: 'Promote',
    icon: ArrowUp,
    variant: 'default' as const,
    confirmTitle: '', // Empty to skip confirmation dialog
    confirmDescription: '', // Empty to skip confirmation dialog
    successMessage: 'Successfully promoted {count} student{plural}',
    errorMessage: 'Failed to promote students',
    loadingText: 'Promoting...'
  };

  const promotionInfo = getCurrentPromotionInfo();
  const statusInfo = getCurrentStatusInfo();

  return (
    <>
      {/* DataTable with promotion functionality */}
      <DataTable
        columns={columns}
        data={students}
        getRowId={(row) => row.id}
        serverSidePagination={serverSidePagination}
        onBulkAction={canEdit ? handleBulkAction : undefined}
        bulkActionConfig={bulkActionConfig}
        secondaryBulkAction={
          canEdit
            ? {
                label: 'Update Status',
                icon: RefreshCw,
                variant: 'outline',
                onClick: handleBulkStatusAction
              }
            : undefined
        }
        permissions={{
          module: 'students.promotion',
          actions: {
            view: true,
            edit: canEdit
          }
        }}
      />

      {/* Promotion Form Dialog */}
      <Dialog
        open={showPromotionDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowPromotionDialog(false);
            setSingleStudentId(null);
            setBulkPromotionStudents([]);
            setCurrentDialogStudents([]);
          }
        }}
      >
        <DialogContent className='max-w-md max-h-[90vh] overflow-hidden flex flex-col'>
          <DialogHeader>
            <DialogTitle>
              Promote{' '}
              {singleStudentId
                ? 'Student'
                : `${currentDialogStudents.length} Students`}
            </DialogTitle>
            <DialogDescription>
              Select the new semester and section for the student(s). Department
              change is optional and rarely used.
            </DialogDescription>
          </DialogHeader>

          <div className='overflow-y-auto flex-1 pr-2'>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handlePromote)}
                className='space-y-6'
              >
              {/* Optional Department Field */}
              {departments.length > 0 && (
                <FormField
                  control={form.control}
                  name='department_id'
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department (Optional)</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder='Keep current department' />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {departments.map((department) => (
                            <SelectItem
                              key={department.id}
                              value={department.id}
                            >
                              {department.department_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Only change if students are being moved to a different
                        department. Leave empty to keep current department.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Mandatory Semester Field */}
              <FormField
                control={form.control}
                name='semester_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semester*</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Reset section when semester changes
                        form.setValue('section_id', '');
                        // Load sections for the selected semester
                        loadSections(value);
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select semester' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {semesters.map((semester) => (
                          <SelectItem key={semester.id} value={semester.id}>
                            {semester.semester_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Mandatory Section Field */}
              <FormField
                control={form.control}
                name='section_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section*</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!watchedSemesterId || sections.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select section' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {sections.map((section) => (
                          <SelectItem key={section.id} value={section.id}>
                            {section.section_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Optional Academic Year Field */}
              <FormField
                control={form.control}
                name='academic_year_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Academic Year (Optional)</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Keep current academic year' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
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
                    <FormDescription>
                      Only change if students are being promoted to a different academic year. Leave empty to keep current academic year.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              </form>
            </Form>
          </div>

          <DialogFooter className='mt-6'>
            <Button
              type='button'
              variant='outline'
              onClick={() => setShowPromotionDialog(false)}
            >
              Cancel
            </Button>
            <Button 
              type='submit'
              onClick={form.handleSubmit(handlePromote)}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Final Confirmation Dialog */}
      <AlertDialog
        open={showConfirmationDialog}
        onOpenChange={setShowConfirmationDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-amber-500' />
              Confirm Student Promotion
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='space-y-4'>
                <p>
                  You are about to promote{' '}
                  <strong>
                    {promotionInfo?.studentCount || 0} student
                    {(promotionInfo?.studentCount || 0) > 1 ? 's' : ''}
                  </strong>{' '}
                  to a new semester and section
                  {pendingPromotionData?.departmentName || pendingPromotionData?.academicYearName
                    ? ', and optionally '
                    : ''}
                  {pendingPromotionData?.departmentName && pendingPromotionData?.academicYearName
                    ? 'department and academic year'
                    : pendingPromotionData?.departmentName
                    ? 'department'
                    : pendingPromotionData?.academicYearName
                    ? 'academic year'
                    : ''}
                  .
                </p>

                {pendingPromotionData && promotionInfo && (
                  <div className='bg-muted p-4 rounded-lg space-y-3'>
                    <div className='grid grid-cols-2 gap-4 text-sm'>
                      <div>
                        <h4 className='font-medium text-foreground mb-2'>
                          Current Assignment:
                        </h4>
                        <div className='space-y-1 text-muted-foreground'>
                          {pendingPromotionData.departmentName && (
                            <div>
                              <span className='font-medium'>Department:</span>{' '}
                              {promotionInfo.currentDepartments.length > 1
                                ? `Multiple (${promotionInfo.currentDepartments.length})`
                                : promotionInfo.currentDepartments[0] || 'N/A'}
                            </div>
                          )}
                          <div>
                            <span className='font-medium'>Semester:</span>{' '}
                            {promotionInfo.currentSemesters.length > 1
                              ? `Multiple (${promotionInfo.currentSemesters.length})`
                              : promotionInfo.currentSemesters[0] || 'N/A'}
                          </div>
                          <div>
                            <span className='font-medium'>Section:</span>{' '}
                            {promotionInfo.currentSections.length > 1
                              ? `Multiple (${promotionInfo.currentSections.length})`
                              : promotionInfo.currentSections[0] || 'N/A'}
                          </div>
                          <div>
                            <span className='font-medium'>Academic Year:</span>{' '}
                            {promotionInfo.currentAcademicYears.length > 1
                              ? `Multiple (${promotionInfo.currentAcademicYears.length})`
                              : promotionInfo.currentAcademicYears[0] || 'N/A'}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className='font-medium text-foreground mb-2'>
                          New Assignment:
                        </h4>
                        <div className='space-y-1 text-muted-foreground'>
                          {pendingPromotionData.departmentName && (
                            <div>
                              <span className='font-medium'>Department:</span>{' '}
                              <span className='text-green-600 font-medium'>
                                {pendingPromotionData.departmentName}
                              </span>
                            </div>
                          )}
                          <div>
                            <span className='font-medium'>Semester:</span>{' '}
                            <span className='text-green-600 font-medium'>
                              {pendingPromotionData.semesterName}
                            </span>
                          </div>
                          <div>
                            <span className='font-medium'>Section:</span>{' '}
                            <span className='text-green-600 font-medium'>
                              {pendingPromotionData.sectionName}
                            </span>
                          </div>
                          {pendingPromotionData.academicYearName && (
                            <div>
                              <span className='font-medium'>Academic Year:</span>{' '}
                              <span className='text-green-600 font-medium'>
                                {pendingPromotionData.academicYearName}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className='flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg'>
                  <AlertTriangle className='h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0' />
                  <div className='text-sm text-amber-800'>
                    <p className='font-medium'>Important:</p>
                    <p>
                      This action will update the academic records for all
                      selected students.
                      {pendingPromotionData?.departmentName &&
                        ' Department changes should be rare and carefully considered.'}{' '}
                      Make sure all assignments are correct before proceeding.
                    </p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleCancelConfirmation}
              disabled={isPromoting}
            >
              Go Back
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPromotion}
              disabled={isPromoting}
              className='bg-green-600 hover:bg-green-700'
            >
              {isPromoting ? (
                <>
                  <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2' />
                  Promoting...
                </>
              ) : (
                <>
                  <CheckCircle className='h-4 w-4 mr-2' />
                  Confirm Promotion
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Progress Dialog */}
      <Dialog
        open={showProgressDialog}
        onOpenChange={(open) => {
          // Only allow closing if promotion is complete
          if (!open && !isPromoting) {
            handleCloseProgressDialog();
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center justify-between'>
              <span>Promotion Progress</span>
              {!isPromoting && (
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={handleCloseProgressDialog}
                  className='h-6 w-6 p-0'
                >
                  <X className='h-4 w-4' />
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              {isPromoting 
                ? 'Promoting students to their new assignments...' 
                : 'Promotion complete!'}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4 py-4'>
            {/* Progress Bar */}
            <div className='space-y-2'>
              <div className='flex justify-between text-sm'>
                <span>Progress</span>
                <span>{Math.round(promotionProgress)}%</span>
              </div>
              <Progress value={promotionProgress} className='h-2' />
            </div>

            {/* Status Summary */}
            <div className='grid grid-cols-2 gap-4 text-sm'>
              <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                  <CheckCircle className='h-4 w-4 text-green-600' />
                  <span className='font-medium'>Successful</span>
                </div>
                <p className='text-2xl font-bold text-green-600'>
                  {promotionResults.success.length}
                </p>
              </div>
              <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                  <X className='h-4 w-4 text-red-600' />
                  <span className='font-medium'>Failed</span>
                </div>
                <p className='text-2xl font-bold text-red-600'>
                  {promotionResults.failed.length}
                </p>
              </div>
            </div>

            {/* Current Status */}
            <div className='text-sm text-muted-foreground'>
              <p>
                Processing {promotionResults.success.length + promotionResults.failed.length} of {promotionResults.total} students
              </p>
            </div>

            {/* Error Details (if any) */}
            {promotionResults.failed.length > 0 && !isPromoting && (
              <div className='mt-4 p-3 bg-red-50 border border-red-200 rounded-lg'>
                <h4 className='font-medium text-red-800 text-sm mb-2'>
                  Failed Promotions ({promotionResults.failed.length})
                </h4>
                <div className='max-h-32 overflow-y-auto space-y-1'>
                  {promotionResults.failed.map((failure, index) => (
                    <p key={index} className='text-xs text-red-700'>
                      Student ID {failure.id}: {failure.error}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!isPromoting && (
            <DialogFooter>
              <Button onClick={handleCloseProgressDialog} className='w-full'>
                Done
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* ================================================== */}
      {/* STATUS PROMOTION DIALOGS */}
      {/* ================================================== */}

      {/* Status Form Dialog */}
      <Dialog
        open={showStatusDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowStatusDialog(false);
            setStatusDialogStudents([]);
          }
        }}
      >
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <RefreshCw className='h-5 w-5' />
              Update Status for {statusDialogStudents.length} Student{statusDialogStudents.length > 1 ? 's' : ''}
            </DialogTitle>
            <DialogDescription>
              Change the status for the selected student(s). This will <strong>NOT</strong> affect their semester, section, or other academic assignments.
            </DialogDescription>
          </DialogHeader>

          {/* Current Status Distribution */}
          {statusInfo && statusInfo.statusDistribution.length > 0 && (
            <div className='bg-muted p-3 rounded-lg'>
              <p className='text-sm font-medium mb-2'>Current Status Distribution:</p>
              <div className='flex flex-wrap gap-2'>
                {statusInfo.statusDistribution.map((item) => (
                  <Badge key={item.status} className={`${item.color}`}>
                    {item.label}: {item.count}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Form {...statusForm}>
            <form
              onSubmit={statusForm.handleSubmit(handleStatusSubmit)}
              className='space-y-4'
            >
              <FormField
                control={statusForm.control}
                name='new_status'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Status*</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder='Select new status' />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value='active'>
                          <div className='flex items-center gap-2'>
                            <div className='w-2 h-2 rounded-full bg-green-500' />
                            Active
                          </div>
                        </SelectItem>
                        <SelectItem value='inactive'>
                          <div className='flex items-center gap-2'>
                            <div className='w-2 h-2 rounded-full bg-gray-500' />
                            Inactive
                          </div>
                        </SelectItem>
                        <SelectItem value='pending'>
                          <div className='flex items-center gap-2'>
                            <div className='w-2 h-2 rounded-full bg-yellow-500' />
                            Pending
                          </div>
                        </SelectItem>
                        <SelectItem value='exited'>
                          <div className='flex items-center gap-2'>
                            <div className='w-2 h-2 rounded-full bg-red-500' />
                            Exited
                          </div>
                        </SelectItem>
                        <SelectItem value='graduated'>
                          <div className='flex items-center gap-2'>
                            <GraduationCap className='w-4 h-4 text-blue-500' />
                            Graduated
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Select the new status. For final year students completing their program, select "Graduated".
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setShowStatusDialog(false)}
                >
                  Cancel
                </Button>
                <Button type='submit'>
                  Continue
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Status Confirmation Dialog */}
      <AlertDialog
        open={showStatusConfirmationDialog}
        onOpenChange={setShowStatusConfirmationDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-amber-500' />
              Confirm Status Update
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='space-y-4'>
                <p>
                  You are about to update the status of{' '}
                  <strong>
                    {statusInfo?.studentCount || 0} student{(statusInfo?.studentCount || 0) > 1 ? 's' : ''}
                  </strong>{' '}
                  to <strong>{pendingStatusData?.statusLabel}</strong>.
                </p>

                {pendingStatusData && statusInfo && (
                  <div className='bg-muted p-4 rounded-lg space-y-3'>
                    <div className='grid grid-cols-2 gap-4 text-sm'>
                      <div>
                        <h4 className='font-medium text-foreground mb-2'>Current Status:</h4>
                        <div className='space-y-1'>
                          {statusInfo.statusDistribution.map((item) => (
                            <div key={item.status} className='flex items-center gap-2'>
                              <Badge className={`${item.color} text-xs`}>{item.label}</Badge>
                              <span className='text-muted-foreground'>({item.count})</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <h4 className='font-medium text-foreground mb-2'>New Status:</h4>
                        <Badge className={`${STATUS_LABELS[pendingStatusData.new_status]?.color || 'bg-gray-100'} text-lg px-3 py-1`}>
                          {pendingStatusData.statusLabel}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}

                {pendingStatusData?.new_status === 'graduated' && (
                  <div className='flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg'>
                    <GraduationCap className='h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0' />
                    <div className='text-sm text-blue-800'>
                      <p className='font-medium'>Graduation Status</p>
                      <p>
                        Students marked as "Graduated" will retain their current semester and section records. This is typically used for final year students who have completed their program.
                      </p>
                    </div>
                  </div>
                )}

                {pendingStatusData?.new_status === 'exited' && (
                  <div className='flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg'>
                    <AlertTriangle className='h-4 w-4 text-red-600 mt-0.5 flex-shrink-0' />
                    <div className='text-sm text-red-800'>
                      <p className='font-medium'>Warning: User Accounts</p>
                      <p>
                        Setting status to "Exited" will disable the user accounts for these students. They will no longer be able to log in.
                      </p>
                    </div>
                  </div>
                )}

                <div className='flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg'>
                  <AlertTriangle className='h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0' />
                  <div className='text-sm text-amber-800'>
                    <p className='font-medium'>Note:</p>
                    <p>
                      This action will <strong>only update the status</strong>. Semester, section, and other academic fields will remain unchanged.
                    </p>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={handleCancelStatusConfirmation}
              disabled={isUpdatingStatus}
            >
              Go Back
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmStatusUpdate}
              disabled={isUpdatingStatus}
              className={
                pendingStatusData?.new_status === 'graduated'
                  ? 'bg-blue-600 hover:bg-blue-700'
                  : pendingStatusData?.new_status === 'exited'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }
            >
              {isUpdatingStatus ? (
                <>
                  <div className='animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2' />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircle className='h-4 w-4 mr-2' />
                  Confirm Update
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Status Progress Dialog */}
      <Dialog
        open={showStatusProgressDialog}
        onOpenChange={(open) => {
          // Only allow closing if update is complete
          if (!open && !isUpdatingStatus) {
            handleCloseStatusProgressDialog();
          }
        }}
      >
        <DialogContent className='sm:max-w-md'>
          <DialogHeader>
            <DialogTitle className='flex items-center justify-between'>
              <span>Status Update Progress</span>
              {!isUpdatingStatus && (
                <Button
                  variant='ghost'
                  size='icon'
                  onClick={handleCloseStatusProgressDialog}
                  className='h-6 w-6 p-0'
                >
                  <X className='h-4 w-4' />
                </Button>
              )}
            </DialogTitle>
            <DialogDescription>
              {isUpdatingStatus
                ? `Updating student status to "${pendingStatusData?.statusLabel}"...`
                : 'Status update complete!'}
            </DialogDescription>
          </DialogHeader>

          <div className='space-y-4 py-4'>
            {/* Progress Bar */}
            <div className='space-y-2'>
              <div className='flex justify-between text-sm'>
                <span>Progress</span>
                <span>{Math.round(statusProgress)}%</span>
              </div>
              <Progress value={statusProgress} className='h-2' />
            </div>

            {/* Status Summary */}
            <div className='grid grid-cols-2 gap-4 text-sm'>
              <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                  <CheckCircle className='h-4 w-4 text-green-600' />
                  <span className='font-medium'>Successful</span>
                </div>
                <p className='text-2xl font-bold text-green-600'>
                  {statusResults.success.length}
                </p>
              </div>
              <div className='space-y-1'>
                <div className='flex items-center gap-2'>
                  <X className='h-4 w-4 text-red-600' />
                  <span className='font-medium'>Failed</span>
                </div>
                <p className='text-2xl font-bold text-red-600'>
                  {statusResults.failed.length}
                </p>
              </div>
            </div>

            {/* Current Status */}
            <div className='text-sm text-muted-foreground'>
              <p>
                Processing {statusResults.success.length + statusResults.failed.length} of {statusResults.total} students
              </p>
            </div>

            {/* Error Details (if any) */}
            {statusResults.failed.length > 0 && !isUpdatingStatus && (
              <div className='mt-4 p-3 bg-red-50 border border-red-200 rounded-lg'>
                <h4 className='font-medium text-red-800 text-sm mb-2'>
                  Failed Updates ({statusResults.failed.length})
                </h4>
                <div className='max-h-32 overflow-y-auto space-y-1'>
                  {statusResults.failed.map((failure, index) => (
                    <p key={index} className='text-xs text-red-700'>
                      Student ID {failure.id}: {failure.error}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>

          {!isUpdatingStatus && (
            <DialogFooter>
              <Button onClick={handleCloseStatusProgressDialog} className='w-full'>
                Done
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
