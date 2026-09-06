'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, AlertCircle, Edit, Trash2 } from 'lucide-react';
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
import { Timetable } from '@/types/academics';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAdaptiveLabels } from '@/hooks/use-adaptive-labels';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { revalidateTimetables } from '../../_actions/revalidate-timetables';
import { logger } from '@/lib/utils/enhanced-logger';

interface TimetableHeaderProps {
  timetable: Timetable;
  onBack?: () => void;
  hasAttendance?: boolean;
  attendanceCount?: number;
  isSuperAdmin?: boolean;
  canEdit?: boolean; // New prop
  canDelete?: boolean;
  todaysCycle?: number | null; // For cycle-format timetables: today's active cycle
  inchargeName?: string | null; // Resolved class incharge display name (session/day-wise)
}

/**
 * Validates timetable ID before navigation (defense-in-depth)
 */
function isNavigableId(id: string | undefined): boolean {
  if (!id) return false;
  if (id.includes('%%drp:')) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function TimetableHeader({
  timetable,
  onBack,
  hasAttendance = false,
  attendanceCount = 0,
  isSuperAdmin = false,
  canEdit = false,
  canDelete = false,
  todaysCycle = null,
  inchargeName = null
}: TimetableHeaderProps) {
  const router = useRouter();
  const adapt = useAdaptiveLabels();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await TimetableService.deleteTimetable(timetable.id);
      await revalidateTimetables();
      setDeleteDialogOpen(false);
      router.push('/academic/timetables');
    } catch (error) {
      logger.error('academic/timetables', 'Error deleting timetable', error);
      setDeleteDialogOpen(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
    <div className='bg-white rounded-lg shadow-sm border'>
      <div className='p-6'>
        <div className='flex items-center justify-between mb-4'>
          <div>
            <div className='flex items-center gap-3 flex-wrap'>
              <h1 className='text-2xl font-bold text-gray-900'>
                {timetable.timetable_name}
              </h1>

              {/* Timetable Type Badge - Updated: 2025-10-08 */}
              {timetable.timetable_type === 'semester' ? (
                <Badge variant='default' className='text-sm bg-green-600'>
                  Semester Level
                </Badge>
              ) : (
                <Badge variant='secondary' className='text-sm'>
                  Section Level
                </Badge>
              )}

              {/* Updated: 2025-10-08 - Only show Section badge for section-level timetables */}
              {timetable.timetable_type === 'section' && timetable.sections?.section_name && (
                <Badge variant='outline' className='text-sm'>
                  {adapt('Section')} {timetable.sections.section_name}
                </Badge>
              )}

              {timetable.timetable_format === 'cycle' && (
                <Badge
                  variant='outline'
                  className='text-sm border-amber-500 text-amber-700 bg-amber-50'
                >
                  {todaysCycle != null
                    ? `Today: Cycle ${todaysCycle}`
                    : 'Cycle Format'}
                </Badge>
              )}

              {hasAttendance && (
                <Badge
                  variant='outline'
                  className='text-sm border-orange-500 text-orange-700'
                >
                  <Lock className='h-3 w-3 mr-1' />
                  Attendance Marked
                </Badge>
              )}
            </div>
            {/* Updated: 2025-10-08 - Fixed description logic */}
            <p className='text-sm text-gray-500 mt-1'>
              {timetable.timetable_type === 'semester'
                ? 'Semester-level timetable with multi-section slot support'
                : timetable.timetable_type === 'section' && timetable.sections?.section_name
                ? `Section-level timetable for ${adapt('Section')} ${timetable.sections.section_name}`
                : 'Manage and view the timetable details'}
            </p>
          </div>
          <div className='flex items-center gap-2'>
            {/* Edit Button - Updated: 2026-02-25 - Added ID validation before navigation */}
            {canEdit && (
              <Button
                variant='default'
                size='sm'
                onClick={() => {
                  if (!isNavigableId(timetable.id)) {
                    toast.error('Unable to edit. Please refresh the page and try again.');
                    return;
                  }
                  router.push(`/academic/timetables/${timetable.id}/edit`);
                }}
              >
                <Edit className='h-4 w-4 mr-2' />
                Edit
              </Button>
            )}
            {canDelete && (
              <Button
                variant='destructive'
                size='sm'
                onClick={() => {
                  if (!isNavigableId(timetable.id)) {
                    toast.error('Unable to delete. Please refresh the page and try again.');
                    return;
                  }
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 className='h-4 w-4 mr-2' />
                Delete
              </Button>
            )}
            <Button variant='outline' size='sm' onClick={onBack}>
              <ArrowLeft className='h-4 w-4 mr-2' />
              Back
            </Button>
          </div>
        </div>

        {/* Attendance Lock Warning */}
        {hasAttendance && (
          <Alert
            className={
              isSuperAdmin
                ? 'mb-4 border-blue-200 bg-blue-50'
                : 'mb-4 border-orange-200 bg-orange-50'
            }
          >
            <AlertCircle
              className={
                isSuperAdmin
                  ? 'h-4 w-4 text-blue-600'
                  : 'h-4 w-4 text-orange-600'
              }
            />
            <AlertDescription
              className={isSuperAdmin ? 'text-blue-800' : 'text-orange-800'}
            >
              {isSuperAdmin ? (
                <>
                  <strong>Super Admin Override:</strong> Attendance has been
                  marked for {attendanceCount || 'some'} period(s). As a super
                  admin, you can still modify this timetable, but please be
                  aware that changes may affect existing attendance records.
                </>
              ) : (
                // Fixed: 2026-08-13 (BUG-005790/91/92/93) - This used to read
                // "This timetable is locked for editing … you cannot modify or
                // delete this timetable". That was never true for a user holding
                // academic.timetables.edit: the per-period lock it advertised
                // compares master `periods.id` against slot ids collected from
                // `timetable_data[cycle][periodId].slot_id`, so it never matches.
                // Four HODs read the banner as a hard block and filed it as a bug.
                // State the real risk instead of asserting a block that isn't there.
                <>
                  <strong>
                    Attendance has been marked for{' '}
                    {attendanceCount || 'some'} period(s).
                  </strong>{' '}
                  Editing or deleting those slots may affect existing attendance
                  records, so change them only when you mean to. Staff changes
                  are usually better made through the Staff Planning module.
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Timetable Info Cards */}
        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
          {/* Institution & Academic Details */}
          <div className='space-y-4'>
            <h3 className='font-medium text-gray-900'>
              Institution & Academic Details
            </h3>
            <div className='space-y-3 text-sm'>
              <div>
                <span className='text-gray-500'>Institution</span>
                <p className='font-medium'>
                  {timetable.institution?.name || 'N/A'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>Academic Year</span>
                <p className='font-medium'>
                  {timetable.academic_year?.academic_year_name || 'N/A'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>Start Date</span>
                <p className='font-medium'>
                  {timetable.start_date
                    ? new Date(timetable.start_date).toLocaleDateString(
                        'en-US',
                        {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric'
                        }
                      )
                    : 'N/A'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>End Date</span>
                <p className='font-medium'>
                  {timetable.end_date
                    ? new Date(timetable.end_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Program Information */}
          <div className='space-y-4'>
            <h3 className='font-medium text-gray-900'>Program Information</h3>
            <div className='space-y-3 text-sm'>
              <div>
                <span className='text-gray-500'>{adapt('Degree')}</span>
                <p className='font-medium'>
                  {timetable.degree?.degree_name || 'N/A'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>{adapt('Program')}</span>
                <p className='font-medium'>
                  {timetable.program?.program_name || 'N/A'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>{adapt('Department')}</span>
                <p className='font-medium'>
                  {timetable.department?.department_name || 'N/A'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>{adapt('Semester')}</span>
                <p className='font-medium'>
                  {timetable.semesters?.semester_name || 'N/A'}
                </p>
              </div>
              {/* Timetable Type - Updated: 2025-10-08 */}
              <div>
                <span className='text-gray-500'>Timetable Type</span>
                <p className='font-medium'>
                  {timetable.timetable_type === 'semester' ? (
                    <span className='text-green-600'>
                      Semester Level
                    </span>
                  ) : (
                    <span className='text-gray-900'>
                      Section Level
                    </span>
                  )}
                </p>
              </div>

              {/* Updated: 2025-10-08 - Section - Only show for section-level timetables with a section */}
              {timetable.timetable_type === 'section' && timetable.sections?.section_name && (
                <div>
                  <span className='text-gray-500'>{adapt('Section')}</span>
                  <p className='font-medium'>
                    {timetable.sections.section_name}
                  </p>
                </div>
              )}

              {/* For semester-level, show available sections count */}
              {timetable.timetable_type === 'semester' && (
                <div>
                  <span className='text-gray-500'>{adapt('Sections')}</span>
                  <p className='font-medium'>
                    {timetable.available_sections?.length || 0} {adapt('Section').toLowerCase()}(s)
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div className='space-y-4'>
            <h3 className='font-medium text-gray-900'>Dates</h3>
            <div className='space-y-3 text-sm'>
              <div>
                <span className='text-gray-500'>Created</span>
                <p className='font-medium'>
                  {new Date(timetable.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>Last Updated</span>
                <p className='font-medium'>
                  {new Date(timetable.updated_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </p>
              </div>
              {/* Attendance configuration (school day-wise support) */}
              <div>
                <span className='text-gray-500'>Attendance Mode</span>
                <p className='font-medium'>
                  {timetable.attendance_mode === 'session_wise'
                    ? 'Day-wise (FN & AN sessions)'
                    : 'Period-wise (every period)'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>Class Incharge</span>
                <p className='font-medium'>
                  {inchargeName || 'Not assigned'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the
            timetable &quot;{timetable.timetable_name}&quot; and all its
            associated data.
            <br /><br />
            <strong>Note:</strong> If this timetable has been used for attendance tracking,
            the deletion will be prevented to preserve attendance records.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            disabled={isDeleting}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
