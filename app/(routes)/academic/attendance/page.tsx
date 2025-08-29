'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useAttendancePeriods,
  useAttendanceRoster
} from '@/hooks/academic/use-attendance';
import { AttendanceViewSelector } from './_components/attendance-view-selector';
import { formatTimeRange } from '@/utils/time-format';
import type {
  AttendanceSearchContext,
  AttendancePeriodOption
} from '@/types/attendance';
import { toast } from 'sonner';

export default function AttendancePage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const [searchContext, setSearchContext] = useState<AttendanceSearchContext>({
    attendance_date: format(new Date(), 'yyyy-MM-dd'),
    institution_id: '',
    academic_year_id: '',
    department_id: '',
    program_id: '',
    semester_id: '',
    section_id: '',
    degree_id: ''
  });

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [attendancePermissions, setAttendancePermissions] = useState<
    Map<string, boolean>
  >(new Map());
  const [loadingInitialData, setLoadingInitialData] = useState(true);

  const {
    periods: availablePeriods,
    loading,
    refetch: refetchPeriods
  } = useAttendancePeriods(searchContext, showResults);

  // Debug logging for periods loading
  useEffect(() => {
    console.log('📊 useAttendancePeriods state:', {
      availablePeriodsCount: availablePeriods.length,
      loading,
      showResults,
      searchContext,
      isSuperAdmin
    });
  }, [availablePeriods, loading, showResults, searchContext, isSuperAdmin]);

  const { checkStaffPermissions } = useAttendanceRoster();

  // Update search context
  const updateSearchContext = (updates: Partial<AttendanceSearchContext>) => {
    setSearchContext((prev) => ({ ...prev, ...updates }));
  };

  // Initialize with user's institution
  useEffect(() => {
    console.log('🔧 Initializing attendance page:', {
      profileInstitutionId: profile?.institution_id,
      isSuperAdmin,
      profile: profile
    });

    if (profile?.institution_id) {
      updateSearchContext({
        institution_id: profile.institution_id
      });
      setLoadingInitialData(false);
    } else if (isSuperAdmin) {
      // For super admins without a specific institution, we need to handle this case
      console.log(
        '⚠️ Super admin without institution_id - may need to select institution manually'
      );
      setLoadingInitialData(false);
    }
  }, [profile?.institution_id, isSuperAdmin, profile]);

  // Check permissions for available periods
  useEffect(() => {
    const checkPermissionsForPeriods = async () => {
      if (!availablePeriods.length || isSuperAdmin) {
        if (isSuperAdmin) {
          // Super admin has access to all periods
          const allPermissions = new Map<string, boolean>();
          availablePeriods.forEach((period: AttendancePeriodOption) => {
            allPermissions.set(period.timetable_slot_id, true);
          });
          setAttendancePermissions(allPermissions);
        }
        return;
      }

      try {
        setLoadingPeriods(true);
        const permissions = new Map<string, boolean>();

        for (const period of availablePeriods) {
          const canMark = await checkStaffPermissions(period.timetable_slot_id);
          permissions.set(period.timetable_slot_id, canMark);
        }

        setAttendancePermissions(permissions);
      } catch (error) {
        console.error('Error checking permissions:', error);
      } finally {
        setLoadingPeriods(false);
      }
    };

    checkPermissionsForPeriods();
  }, [availablePeriods, isSuperAdmin, checkStaffPermissions]);

  // Handle search action
  const handleSearch = () => {
    setShowResults(true);
    setSelectedPeriod(null);
    refetchPeriods();
  };

  // Handle period selection - redirect directly to mark page
  const handlePeriodSelection = async (periodId: string) => {
    const periodData = availablePeriods.find(
      (p: AttendancePeriodOption) => p.timetable_slot_id === periodId
    );

    if (!periodData) {
      toast.error('Period information not found');
      return;
    }

    // Find the section ID - try multiple sources
    let sectionId = searchContext.section_id;

    // If no section in search context, try to get from period data
    if (!sectionId && periodData.sections && periodData.sections.length > 0) {
      sectionId = periodData.sections[0].id;
    }

    // If still no section ID, try to get from period section_ids array
    if (
      !sectionId &&
      periodData.section_ids &&
      periodData.section_ids.length > 0
    ) {
      sectionId = periodData.section_ids[0];
    }

    // Last resort: extract from timetable section name if available
    if (!sectionId && periodData.section_name) {
      console.warn('Using section name as fallback:', periodData.section_name);
      sectionId = periodData.section_name; // This will be resolved in the mark page
    }

    if (!sectionId) {
      toast.error('Section information not found');
      return;
    }

    console.log(
      '🚀 Period selection - redirecting to mark page with data:',
      {
        sectionId,
        periodId,
        timetableId: periodData.timetable_id,
        date: searchContext.attendance_date,
        periodData
      }
    );

    // Navigate directly to attendance marking page
    const params = new URLSearchParams({
      periodId: periodId,
      timetableId: periodData.timetable_id || '',
      sectionId: sectionId,
      date: searchContext.attendance_date || '',
      periodName: periodData.period_name || 'Unknown Period',
      courseName: periodData.course?.course_name || 'Unknown Course',
      startTime: periodData.start_time || '',
      endTime: periodData.end_time || ''
    });

    console.log('🔗 Redirect URL params:', params.toString());
    router.push(`/academic/attendance/mark?${params.toString()}`);
  };

  // Loading state
  if (loadingInitialData) {
    return (
      <div className='flex items-center justify-center h-screen'>
        <Loader2 className='h-10 w-10 animate-spin' />
      </div>
    );
  }

  return (
    <ContentLayout title='Attendance'>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/'>Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/academic'>Academic</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Attendance</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        {/* Dynamic Status Indicator */}
        <div
          className={`flex items-center gap-3 p-3 rounded-lg border ${
            showResults && availablePeriods.length > 0
              ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800/50'
              : loadingPeriods
              ? 'bg-orange-50 border-orange-200 dark:bg-orange-950 dark:border-orange-800/50'
              : 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800/50'
          }`}
        >
          <div className='flex-shrink-0'>
            {loadingPeriods ? (
              <Loader2 className='h-5 w-5 text-orange-600 dark:text-orange-500 animate-spin' />
            ) : showResults && availablePeriods.length > 0 ? (
              <Calendar className='h-5 w-5 text-green-600 dark:text-green-500' />
            ) : (
              <Check className='h-5 w-5 text-green-600 dark:text-green-500' />
            )}
          </div>
          <span
            className={`font-medium ${
              showResults && availablePeriods.length > 0
                ? 'text-green-800 dark:text-green-300'
                : loadingPeriods
                ? 'text-orange-800 dark:text-orange-300'
                : 'text-green-800 dark:text-green-300'
            }`}
          >
            {loadingPeriods
              ? 'Loading available periods...'
              : showResults && availablePeriods.length > 0
              ? 'Select a period to mark attendance'
              : 'Select the class to record attendance'}
          </span>
        </div>

        {/* Attendance View Selector - Shows Quick View for Faculty or Search for Admin */}
        <Card>
          <CardContent className='p-6'>
            <AttendanceViewSelector
              searchContext={searchContext}
              onContextChange={updateSearchContext}
              availablePeriods={availablePeriods}
              selectedPeriod={selectedPeriod}
              onPeriodSelect={(period: AttendancePeriodOption) =>
                handlePeriodSelection(period.timetable_slot_id)
              }
              loading={loading || loadingPeriods}
              onSearch={handleSearch}
            />
          </CardContent>
        </Card>

        {/* Results Section */}
        {showResults && (
          <Card id='periods-section'>
            <CardContent className='p-6'>
              <div className='flex items-center gap-3 mb-4'>
                <Calendar className='h-5 w-5 text-blue-600 dark:text-blue-500' />
                <h3 className='text-lg font-medium'>Available Periods</h3>
                <Badge variant='secondary' className='ml-auto'>
                  {searchContext.attendance_date
                    ? format(
                        new Date(searchContext.attendance_date + 'T00:00:00'),
                        'dd MMM yyyy'
                      )
                    : ''}
                </Badge>
              </div>

              {loadingPeriods ? (
                <div className='flex flex-col items-center justify-center py-12 space-y-4'>
                  <Loader2 className='h-8 w-8 text-primary animate-spin' />
                  <p className='text-sm text-muted-foreground'>
                    Loading available periods...
                  </p>
                </div>
              ) : availablePeriods.length > 0 ? (
                <div className='max-w-md'>
                  <Label
                    htmlFor='period-select'
                    className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block'
                  >
                    Select Period to Mark Attendance
                  </Label>
                  <Select onValueChange={handlePeriodSelection}>
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder='Choose a period...' />
                    </SelectTrigger>
                    <SelectContent>
                      {(() => {
                        const filteredPeriods = availablePeriods.filter(
                          (period: AttendancePeriodOption) =>
                            isSuperAdmin ||
                            attendancePermissions.get(
                              period.timetable_slot_id
                            ) === true
                        );

                        if (filteredPeriods.length === 0) {
                          return (
                            <SelectItem value='no-periods' disabled>
                              <div className='flex items-center gap-2'>
                                <AlertTriangle className='h-4 w-4 text-orange-500' />
                                <span className='text-gray-500 dark:text-gray-400'>
                                  No periods available
                                </span>
                              </div>
                            </SelectItem>
                          );
                        }

                        return filteredPeriods.map(
                          (period: AttendancePeriodOption) => (
                            <SelectItem
                              key={period.timetable_slot_id}
                              value={period.timetable_slot_id}
                            >
                              <div className='flex items-center justify-between w-full'>
                                <div className='flex flex-col'>
                                  <span className='font-medium'>
                                    {period.period_name}
                                  </span>
                                  <span className='text-xs text-gray-500 dark:text-gray-400'>
                                    {formatTimeRange(
                                      period.start_time,
                                      period.end_time
                                    )}
                                    {period.course &&
                                      ` • ${period.course.course_name}`}
                                  </span>
                                </div>
                              </div>
                            </SelectItem>
                          )
                        );
                      })()}
                    </SelectContent>
                  </Select>

                  {availablePeriods.filter(
                    (period: AttendancePeriodOption) =>
                      isSuperAdmin ||
                      attendancePermissions.get(period.timetable_slot_id) ===
                        true
                  ).length === 0 && (
                    <div className='mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg dark:bg-orange-950 dark:border-orange-800/50'>
                      <div className='flex items-center gap-2'>
                        <AlertTriangle className='h-4 w-4 text-orange-600 dark:text-orange-500' />
                        <p className='text-sm text-orange-800 dark:text-orange-300'>
                          No periods available - You are not assigned to teach
                          any periods for this class on the selected date.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className='text-center py-8 text-muted-foreground dark:text-gray-500'>
                  <Calendar className='h-12 w-12 mx-auto mb-4 opacity-50' />
                  <p className='font-medium'>No periods available</p>
                  <p className='text-sm'>
                    {isSuperAdmin
                      ? 'No timetable periods are configured for this class on the selected date.'
                      : 'You are not assigned to teach any periods for this class on the selected date.'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </ContentLayout>
  );
}
