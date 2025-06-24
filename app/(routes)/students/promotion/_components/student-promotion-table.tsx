'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { ArrowUp, MoreVertical } from 'lucide-react';
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
  FormMessage
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
import { DataTable, PermissionColumnDef } from '@/components/ui/data-table';

interface StudentPromotionTableProps {
  students: Student[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  onPageChange: (page: number) => void;
  canEdit: boolean;
  onBulkPromote: (
    studentIds: string[],
    semesterId: string,
    sectionId: string
  ) => Promise<boolean>;
}

const promotionSchema = z.object({
  semester_id: z.string().min(1, 'Semester is required'),
  section_id: z.string().min(1, 'Section is required')
});

type PromotionFormValues = z.infer<typeof promotionSchema>;

export function StudentPromotionTable({
  students,
  metadata,
  onPageChange,
  canEdit,
  onBulkPromote
}: StudentPromotionTableProps) {
  const [showPromotionDialog, setShowPromotionDialog] = useState(false);
  const [singleStudentId, setSingleStudentId] = useState<string | null>(null);
  const [bulkPromotionStudents, setBulkPromotionStudents] = useState<Student[]>(
    []
  );
  const [isPromoting, setIsPromoting] = useState(false);

  // State for semesters and sections
  const [semesters, setSemesters] = useState<
    Array<{ id: string; semester_name: string }>
  >([]);
  const [sections, setSections] = useState<
    Array<{ id: string; section_name: string }>
  >([]);

  // Set up the form
  const form = useForm<PromotionFormValues>({
    resolver: zodResolver(promotionSchema),
    defaultValues: {
      semester_id: '',
      section_id: ''
    }
  });

  // Watch semester_id to load sections
  const watchedSemesterId = form.watch('semester_id');

  // Load semesters when promotion dialog opens
  const handleOpenPromotionDialog = async (studentId?: string) => {
    try {
      // Reset form values
      form.reset();

      if (studentId) {
        setSingleStudentId(studentId);
      } else {
        setSingleStudentId(null);
      }

      // Get unique program IDs and institution IDs from selected students (or the single student)
      const studentsToCheck = studentId
        ? students.filter((s) => s.id === studentId)
        : bulkPromotionStudents;

      const uniqueProgramIds = [
        ...new Set(studentsToCheck.map((s) => s.program_id))
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

      // Load semesters for the program
      const semestersData = await SemesterService.getSemestersByProgram(
        uniqueProgramIds[0]
      );
      setSemesters(semestersData);

      // Show the dialog
      setShowPromotionDialog(true);
    } catch (error) {
      console.error('Error preparing promotion dialog:', error);
      toast.error('Failed to load semesters');
    }
  };

  // Load sections when semester changes
  const loadSections = async (semesterId: string) => {
    try {
      // Get the institution ID from selected students
      const studentsToCheck = singleStudentId
        ? students.filter((s) => s.id === singleStudentId)
        : bulkPromotionStudents;

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

  // Handle form submission
  const handlePromote = async (data: PromotionFormValues) => {
    try {
      setIsPromoting(true);

      // Get the list of student IDs to promote
      const studentsToPromote = singleStudentId
        ? [singleStudentId]
        : bulkPromotionStudents.map((s) => s.id);

      if (studentsToPromote.length === 0) {
        toast.error('No students selected for promotion');
        return;
      }

      // Call the bulk promote function
      const success = await onBulkPromote(
        studentsToPromote,
        data.semester_id,
        data.section_id
      );

      if (success) {
        toast.success(
          `Successfully promoted ${studentsToPromote.length} student${
            studentsToPromote.length > 1 ? 's' : ''
          }`
        );
        setShowPromotionDialog(false);
        setBulkPromotionStudents([]);
        setSingleStudentId(null);
      }
    } catch (error) {
      console.error('Error promoting students:', error);
      toast.error('Failed to promote students');
    } finally {
      setIsPromoting(false);
    }
  };

  // Handle bulk promotion - repurpose the delete function for promotion
  const handleBulkPromotion = async (selectedStudents: Student[]) => {
    if (selectedStudents.length > 0 && canEdit) {
      setBulkPromotionStudents(selectedStudents);
      await handleOpenPromotionDialog();
    }
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
          {row.original.student_name}
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
    onPageSizeChange: () => {
      // Page size change is handled by the parent component through filters
    },
    isLoading: false
  };

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
        onDeleteSelected={canEdit ? handleBulkPromotion : undefined}
        permissions={{
          module: 'students.promotion',
          actions: {
            view: true,
            edit: canEdit,
            delete: canEdit
          }
        }}
      />

      {/* Promotion Dialog */}
      <Dialog
        open={showPromotionDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowPromotionDialog(false);
            setSingleStudentId(null);
            setBulkPromotionStudents([]);
          }
        }}
      >
        <DialogContent className='sm:max-w-[425px]'>
          <DialogHeader>
            <DialogTitle>
              Promote{' '}
              {singleStudentId
                ? 'Student'
                : `${bulkPromotionStudents.length} Students`}
            </DialogTitle>
            <DialogDescription>
              Select the new semester and section for the student(s).
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handlePromote)}
              className='space-y-6'
            >
              <FormField
                control={form.control}
                name='semester_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Semester</FormLabel>
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

              <FormField
                control={form.control}
                name='section_id'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section</FormLabel>
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

              <DialogFooter>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => setShowPromotionDialog(false)}
                  disabled={isPromoting}
                >
                  Cancel
                </Button>
                <Button type='submit' disabled={isPromoting}>
                  {isPromoting ? 'Promoting...' : 'Promote'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
