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
  X
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
}

const promotionSchema = z.object({
  department_id: z.string().optional(),
  semester_id: z.string().min(1, 'Semester is required'),
  section_id: z.string().min(1, 'Section is required'),
  academic_year_id: z.string().optional()
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

export function StudentPromotionTable({
  students,
  metadata,
  onPageChange,
  onPageSizeChange,
  canEdit,
  onBulkPromote
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
                  Promote Student
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

  return (
    <>
      {/* DataTable with promotion functionality */}
      <DataTable
        columns={columns}
        data={students}
        searchPlaceholder='Search students...'
        filterColumn='student_name'
        getRowId={(row) => row.id}
        serverSidePagination={serverSidePagination}
        onBulkAction={canEdit ? handleBulkAction : undefined}
        bulkActionConfig={bulkActionConfig}
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
    </>
  );
}
