'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Calendar, Check, Loader2 } from 'lucide-react';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
    attendance_date: '', // Will be set on client-side to avoid hydration mismatch
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
  const [isClient, setIsClient] = useState(false);

  const {
    periods: availablePeriods,
    loading,
    refetch: refetchPeriods
  } = useAttendancePeriods(searchContext, showResults);

  // Monitor periods loading state
  useEffect(() => {
    // State changes tracked internally
  }, [availablePeriods, loading, showResults, searchContext, isSuperAdmin]);

  const { checkStaffPermissions } = useAttendanceRoster();

  // Set client flag and initial attendance date on client side to avoid hydration mismatch
  useEffect(() => {
    setIsClient(true);
    if (!searchContext.attendance_date) {
      setSearchContext((prev) => ({
        ...prev,
        attendance_date: format(new Date(), 'yyyy-MM-dd')
      }));
    }
  }, [searchContext.attendance_date]);

  // Update search context
  const updateSearchContext = (updates: Partial<AttendanceSearchContext>) => {
    setSearchContext((prev) => ({ ...prev, ...updates }));
  };

  // Initialize with user's institution
  useEffect(() => {
    if (profile?.institution_id) {
      updateSearchContext({
        institution_id: profile.institution_id
      });
      setLoadingInitialData(false);
    } else if (isSuperAdmin) {
      // For super admins without a specific institution, we need to handle this case
      setLoadingInitialData(false);
    }
  }, [profile?.institution_id, isSuperAdmin, profile]);

  // Check permissions for available periods
  useEffect(() => {
    const checkPermissionsForPeriods = async () => {
      const isHOD = profile?.role === 'hod';

      if (!availablePeriods.length || isSuperAdmin || isHOD) {
        if (isSuperAdmin || isHOD) {
          // Super admin and HOD have access to all periods
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
  }, [availablePeriods, isSuperAdmin, checkStaffPermissions, profile?.role]);

  // Handle search action
  const handleSearch = () => {
    setShowResults(true);
    setSelectedPeriod(null);
    refetchPeriods();
  };

  // Handle period selection - redirect directly to mark page
  const handlePeriodSelection = async (period: AttendancePeriodOption) => {
    // Find the section ID - try multiple sources
    let sectionId = searchContext.section_id;

    // If no section in search context, try to get from period data
    if (!sectionId && period.sections && period.sections.length > 0) {
      sectionId = period.sections[0].id;
    }

    // If still no section ID, try to get from period section_ids array
    if (!sectionId && period.section_ids && period.section_ids.length > 0) {
      sectionId = period.section_ids[0];
    }

    // Last resort: extract from timetable section name if available
    if (!sectionId && period.section_name) {
      console.warn('Using section name as fallback:', period.section_name);
      sectionId = period.section_name; // This will be resolved in the mark page
    }

    if (!sectionId) {
      toast.error('Section information not found');
      return;
    }

    // Navigate directly to attendance marking page
    const params = new URLSearchParams({
      periodId: period.timetable_slot_id,
      timetableId: period.timetable_id || '',
      sectionId: sectionId,
      date: searchContext.attendance_date || '',
      periodName: period.period_name || 'Unknown Period',
      courseName: period.course?.course_name || 'Unknown Course',
      startTime: period.start_time || '',
      endTime: period.end_time || ''
    });
    router.push(`/academic/attendance/mark?${params.toString()}`);
  };

  // Loading state - wait for client hydration and initial data
  if (!isClient || loadingInitialData) {
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
              onPeriodSelect={handlePeriodSelection}
              loading={loading || loadingPeriods}
              onSearch={handleSearch}
              showResults={showResults}
              attendancePermissions={attendancePermissions}
              isSuperAdmin={isSuperAdmin}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
