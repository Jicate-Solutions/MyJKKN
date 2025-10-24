'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Calendar,
  Clock,
  Users,
  BookOpen,
  Loader2,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { AttendancePeriodOption } from '@/types/attendance';
import { AttendanceService } from '@/lib/services/academic/attendance-service';
import { cn } from '@/lib/utils';

interface AvailablePeriodsCardsProps {
  periods: AttendancePeriodOption[];
  onPeriodSelect: (period: AttendancePeriodOption) => void;
  loading: boolean;
  selectedDate?: string;
  attendancePermissions: Map<string, boolean>;
  isSuperAdmin: boolean;
}

export function AvailablePeriodsCards({
  periods,
  onPeriodSelect,
  loading,
  selectedDate,
  attendancePermissions,
  isSuperAdmin
}: AvailablePeriodsCardsProps) {
  const router = useRouter();
  const [markedPeriods, setMarkedPeriods] = useState<Set<string>>(new Set());
  const [periodRecordIds, setPeriodRecordIds] = useState<Map<string, string>>(
    new Map()
  );
  const [checkingAttendance, setCheckingAttendance] = useState(false);

  const targetDate = selectedDate || format(new Date(), 'yyyy-MM-dd');
  const displayDate = format(
    new Date(targetDate + 'T00:00:00'),
    'EEEE, MMMM d, yyyy'
  );

  // Check existing attendance when periods change
  useEffect(() => {
    const checkExistingAttendance = async () => {
      if (!periods.length) {
        setMarkedPeriods(new Set());
        return;
      }

      try {
        setCheckingAttendance(true);

        // Updated: 2025-10-09 - For multi-section periods, check using the first section
        // The service will check both section_id and section_ids array automatically
        const periodChecks = periods.map((period) => ({
          timetable_slot_id: period.timetable_slot_id,
          timetable_id: period.timetable_id,
          // Use first section's ID for multi-section periods (service checks section_ids array)
          section_id: period.sections && period.sections.length > 0
            ? period.sections[0].id
            : '',
          attendance_date: targetDate
        }));

        const attendanceMap =
          await AttendanceService.checkExistingAttendanceForPeriods(
            periodChecks
          );

        // DEBUG: Log the attendance check results
        console.log('🔍 Attendance check results:', {
          periodChecksCount: periodChecks.length,
          attendanceMapSize: attendanceMap.size,
          attendanceMapEntries: Array.from(attendanceMap.entries())
        });

        // Updated: 2025-10-09 - Simplified: One check per slot, service handles multi-section logic
        const marked = new Set<string>();
        const recordIds = new Map<string, string>();

        // Simply check each slot - if marked, add to marked periods
        for (const [slotId, attendanceInfo] of attendanceMap) {
          console.log(`📊 Checking slot ${slotId}:`, {
            isMarked: attendanceInfo.isMarked,
            recordId: attendanceInfo.recordId
          });

          if (attendanceInfo.isMarked) {
            marked.add(slotId);
            if (attendanceInfo.recordId) {
              recordIds.set(slotId, attendanceInfo.recordId);
            }
          }
        }

        console.log('✅ Final marked periods:', {
          markedCount: marked.size,
          markedSlotIds: Array.from(marked),
          recordIdsCount: recordIds.size
        });

        setMarkedPeriods(marked);
        setPeriodRecordIds(recordIds);
      } catch (error) {
        console.error('Error checking existing attendance:', error);
        setMarkedPeriods(new Set());
        setPeriodRecordIds(new Map());
      } finally {
        setCheckingAttendance(false);
      }
    };

    checkExistingAttendance();
  }, [periods, targetDate]);

  const getTimeStatus = (startTime: string) => {
    // TEMPORARY: Remove time-based restrictions - faculty can mark attendance anytime
    // TODO: Implement proper time restriction logic in future
    // For now, always allow attendance marking regardless of time
    return 'current';

    /* COMMENTED OUT - Original time-based logic for future implementation
    if (!startTime) return 'upcoming';

    const now = new Date();
    const [time, period] = startTime.split(' ');
    const [hours, minutes] = time.split(':').map(Number);

    // Create period time using the selected date, not today's date
    const periodTime = new Date(targetDate + 'T00:00:00');
    periodTime.setHours(
      period === 'PM' && hours !== 12 ? hours + 12 : hours,
      minutes,
      0,
      0
    );

    // Add buffer time (e.g., allow marking attendance up to 2 hours after period ends)
    const bufferMinutes = 240; // 4 hours buffer
    const periodEndTime = new Date(
      periodTime.getTime() + bufferMinutes * 60000
    );

    if (now < periodTime) return 'upcoming';
    if (now > periodEndTime) return 'past';
    return 'current';
    */
  };

  const handlePeriodClick = (period: AttendancePeriodOption) => {
    const isMarked = markedPeriods.has(period.timetable_slot_id);
    const recordId = periodRecordIds.get(period.timetable_slot_id);

    if (isMarked && recordId) {
      // Navigate to attendance report details page
      router.push(`/academic/attendance/reports/${recordId}`);
      return;
    } else {
      // Use the original period selection behavior for unmarked periods
      onPeriodSelect(period);
    }
  };

  // Filter periods based on permissions
  const filteredPeriods = periods.filter(
    (period: AttendancePeriodOption) =>
      isSuperAdmin ||
      attendancePermissions.get(period.timetable_slot_id) === true
  );

  if (loading) {
    return (
      <Card>
        <CardContent className='flex items-center justify-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin text-primary' />
          <span className='ml-2'>Loading available periods...</span>
        </CardContent>
      </Card>
    );
  }

  if (filteredPeriods.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Calendar className='h-5 w-5' />
            Available Periods - {displayDate}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className='h-4 w-4' />
            <AlertDescription>
              {periods.length === 0
                ? 'No periods found for the selected criteria. Please adjust your search filters and try again.'
                : 'No periods available - You are not assigned to teach any periods for this class on the selected date.'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <Calendar className='h-5 w-5' />
              Available Periods
            </CardTitle>
            <p className='text-sm text-muted-foreground mt-1'>{displayDate}</p>
          </div>
          <Badge variant='secondary' className='ml-auto'>
            {filteredPeriods.length}{' '}
            {filteredPeriods.length === 1 ? 'Period' : 'Periods'} Found
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className='grid gap-4'>
          {filteredPeriods.map((period) => {
            const timeStatus = getTimeStatus(period.start_time);
            const isMarked = markedPeriods.has(period.timetable_slot_id);
            const isMultiSection = period.sections && period.sections.length > 1;

            return (
              <Card
                key={period.timetable_slot_id}
                className={cn(
                  'border-2 transition-all duration-200',
                  // timeStatus === 'past' && !isMarked && 'opacity-75', // TEMPORARY: Removed past period styling
                  isMarked && 'border-green-500 dark:border-green-600'
                )}
              >
                <CardContent className='p-4'>
                  <div className='space-y-3'>
                    {/* Time and Period Info - Mobile Responsive */}
                    <div className='flex flex-col gap-3'>
                      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2'>
                        <div className='flex flex-col xs:flex-row xs:items-center gap-2'>
                          <div className='flex items-center gap-2'>
                            <Clock className='h-4 w-4 text-muted-foreground flex-shrink-0' />
                            <span className='font-medium text-sm'>
                              {period.start_time} - {period.end_time}
                            </span>
                          </div>
                          <Badge
                            variant='default'
                            className='text-xs w-fit self-start xs:self-auto'
                          >
                            {period.period_name}
                          </Badge>
                        </div>
                        {isMarked && (
                          <div className='flex items-center gap-2 self-start sm:self-auto'>
                            <CheckCircle className='h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0' />
                            <span className='text-xs text-green-600 dark:text-green-400 font-medium'>
                              {isMultiSection
                                ? 'All Sections Completed'
                                : 'Completed'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Course Info */}
                    {period.course && (
                      <div className='flex items-start gap-2 -mt-1'>
                        <BookOpen className='h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0' />
                        <div className='min-w-0 flex-1'>
                          <span className='font-medium text-sm break-words leading-relaxed'>
                            {period.course.course_code}
                          </span>
                          <span className='text-muted-foreground text-sm'> - </span>
                          <span className='font-medium text-sm break-words leading-relaxed'>
                            {period.course.course_name}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Class Details - Mobile Responsive Grid */}
                    <div className='grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground'>
                      {period.degree_name && (
                        <div className='bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-md text-center font-medium'>
                          {period.degree_name}
                        </div>
                      )}
                      {period.department_name && (
                        <div className='bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-md text-center font-medium'>
                          {period.department_name}
                        </div>
                      )}
                      {period.program_name && (
                        <div className='bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-md text-center font-medium'>
                          {period.program_name}
                        </div>
                      )}
                      {period.semester_name && (
                        <div className='bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-md text-center font-medium'>
                          {period.semester_name}
                        </div>
                      )}

                      {/* Updated: 2025-10-09 - Fixed section name display for both section-level and semester-level timetables */}
                      {period.sections && period.sections.length > 0 ? (
                        // Multi-section or single section slot (semester-level timetable)
                        <div className={cn(
                          'px-3 py-2 rounded-md flex items-center justify-center gap-1.5 font-medium col-span-1',
                          period.sections.length === 1
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 xs:col-span-2 sm:col-span-1'
                            : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 xs:col-span-2 sm:col-span-3'
                        )}>
                          <Users className='h-3 w-3 flex-shrink-0' />
                          <span>
                            {period.sections.length === 1
                              ? `Section ${period.sections[0].section_name || period.sections[0].name || period.section_name || ''}`
                              : `${period.sections.length} Sections: ${period.sections.map(s => s.section_name || s.name).join(', ')}`
                            }
                          </span>
                        </div>
                      ) : period.section_name ? (
                        // Single section (section-level timetable - legacy fallback)
                        <div className='bg-blue-50 dark:bg-blue-900/30 px-3 py-2 rounded-md text-center flex items-center justify-center gap-1.5 font-medium text-blue-700 dark:text-blue-300 col-span-1 xs:col-span-2 sm:col-span-1'>
                          <Users className='h-3 w-3 flex-shrink-0' />
                          <span>Section {period.section_name}</span>
                        </div>
                      ) : null}
                    </div>

                    {/* Mark Attendance Button - Mobile Responsive */}
                    <div className='pt-3 border-t border-border/50'>
                      <Button
                        onClick={() => handlePeriodClick(period)}
                        disabled={false}
                        size='sm'
                        className={cn(
                          'w-full h-10 font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]',
                          // Updated: 2025-10-09 - Red background for completed attendance
                          isMarked
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : ''
                        )}
                      >
                        {isMarked ? (
                          <>
                            <CheckCircle className='h-4 w-4 mr-2 flex-shrink-0' />
                            <span className='text-sm'>View Details</span>
                          </>
                        ) : (
                          <>
                            <Users className='h-4 w-4 mr-2 flex-shrink-0' />
                            <span className='text-sm'>
                              {isMultiSection
                                ? 'Mark All Sections'
                                : 'Mark Attendance'}
                            </span>
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Help Text */}
        <div className='mt-4 p-3 bg-muted/50 rounded-lg'>
          <p className='text-sm text-muted-foreground'>
            <strong>Search Results:</strong> Click the &quot;Mark
            Attendance&quot; button for any period to record student attendance.
            These periods match your search criteria and permission levels.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
