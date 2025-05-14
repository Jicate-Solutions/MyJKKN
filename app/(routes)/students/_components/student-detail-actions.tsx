'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Edit,
  Trash,
  Loader2,
  MoreVertical,
  FileEdit,
  UserCheck,
  UserCog
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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
import { useToast } from '@/hooks/use-toast';
import { StudentService } from '@/lib/services/student/student-service';
import { Student } from '@/types/student';
import { usePermissions } from '@/hooks/use-permissions';

interface StudentDetailActionsProps {
  student: Student;
}

export function StudentDetailActions({ student }: StudentDetailActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const { canAccess, isSuperAdmin } = usePermissions();

  // Check if student profile is incomplete
  const isProfileIncomplete =
    !student.roll_number ||
    !student.college_email ||
    !student.semester_id ||
    !student.section_id;

  const handleDeleteStudent = async () => {
    try {
      setIsDeleting(true);
      await StudentService.deleteStudent(student.id);
      toast({
        title: 'Student deleted',
        description: 'The student record has been deleted successfully'
      });
      router.push('/students');
    } catch (error) {
      console.error('Error deleting student:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete student',
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <>
      <div className='flex items-center gap-2'>
        {(isSuperAdmin || canAccess('students', 'edit')) && (
          <Button asChild>
            <Link href={`/students/${student.id}/edit`}>
              <Edit className='mr-2 h-4 w-4' />
              Edit
            </Link>
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant='outline' size='icon'>
              <MoreVertical className='h-4 w-4' />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end'>
            {(isSuperAdmin || canAccess('students', 'edit')) && (
              <>
                <DropdownMenuItem
                  onClick={() => router.push(`/students/${student.id}/edit`)}
                >
                  <FileEdit className='mr-2 h-4 w-4' />
                  Edit Full Details
                </DropdownMenuItem>

                {isProfileIncomplete && (
                  <DropdownMenuItem
                    onClick={() =>
                      router.push(`/students/${student.id}/edit-promotion`)
                    }
                  >
                    <UserCheck className='mr-2 h-4 w-4' />
                    Complete Profile
                  </DropdownMenuItem>
                )}

                <DropdownMenuSeparator />
              </>
            )}

            {(isSuperAdmin || canAccess('students', 'delete')) && (
              <DropdownMenuItem
                onClick={() => setShowDeleteDialog(true)}
                className='text-destructive'
              >
                <Trash className='mr-2 h-4 w-4' />
                Delete Student
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the
              student record for {student.student_name}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteStudent}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
