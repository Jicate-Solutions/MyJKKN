'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Lock, AlertCircle, Edit } from 'lucide-react';
import { Timetable } from '@/types/academics';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface TimetableHeaderProps {
  timetable: Timetable;
  onBack?: () => void;
  hasAttendance?: boolean;
  attendanceCount?: number;
  isSuperAdmin?: boolean;
  canEdit?: boolean; // New prop
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
  canEdit = false
}: TimetableHeaderProps) {
  const router = useRouter();

  return (
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
                  Section {timetable.sections.section_name}
                </Badge>
              )}

              {hasAttendance && (
                <Badge
                  variant='outline'
                  className='text-sm border-orange-500 text-orange-700'
                >
                  <Lock className='h-3 w-3 mr-1' />
                  Locked - Attendance Marked
                </Badge>
              )}
            </div>
            {/* Updated: 2025-10-08 - Fixed description logic */}
            <p className='text-sm text-gray-500 mt-1'>
              {timetable.timetable_type === 'semester'
                ? 'Semester-level timetable with multi-section slot support'
                : timetable.timetable_type === 'section' && timetable.sections?.section_name
                ? `Section-level timetable for Section ${timetable.sections.section_name}`
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
                <>
                  <strong>This timetable is locked for editing.</strong>{' '}
                  Attendance has been marked for {attendanceCount || 'some'}{' '}
                  period(s). You cannot modify or delete this timetable to
                  preserve attendance data integrity. Staff changes should be
                  made through the Staff Planning module if needed.
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
                <span className='text-gray-500'>Degree</span>
                <p className='font-medium'>
                  {timetable.degree?.degree_name || 'N/A'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>Program</span>
                <p className='font-medium'>
                  {timetable.program?.program_name || 'N/A'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>Department</span>
                <p className='font-medium'>
                  {timetable.department?.department_name || 'N/A'}
                </p>
              </div>
              <div>
                <span className='text-gray-500'>Semester</span>
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
                  <span className='text-gray-500'>Section</span>
                  <p className='font-medium'>
                    {timetable.sections.section_name}
                  </p>
                </div>
              )}

              {/* For semester-level, show available sections count */}
              {timetable.timetable_type === 'semester' && (
                <div>
                  <span className='text-gray-500'>Available Sections</span>
                  <p className='font-medium'>
                    {timetable.available_sections?.length || 0} section(s)
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
