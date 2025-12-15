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
import { SectionSelectionModal } from './_components/section-selection-modal';
import { formatTimeRange } from '@/utils/time-format';
import { logger } from '@/lib/utils/enhanced-logger';
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
  // Updated: 2025-10-09 - Added state for section selection modal
  const [showSectionModal, setShowSectionModal] = useState(false);
  const [selectedPeriodForModal, setSelectedPeriodForModal] =
    useState<AttendancePeriodOption | null>(null);

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
    } else if (profile && !profile.institution_id) {
      // Profile loaded but no institution - still allow loading to finish
      setLoadingInitialData(false);
    }
  }, [profile?.institution_id, isSuperAdmin, profile, loadingInitialData]);

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
        logger.error('academic/attendance', 'Error checking permissions', error);
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

  // Updated: 2025-10-09 - Handle period selection
  // For semester-level timetables: mark all sections together (no modal)
  // For section-level timetables: proceed directly to mark page
  const handlePeriodSelection = async (period: AttendancePeriodOption) => {
    // Check if this is a multi-section slot from a semester-level timetable
    const isMultiSection =
      (period.sections && period.sections.length > 1) ||
      (period.section_ids && period.section_ids.length > 1);

    if (isMultiSection) {
      // For semester-level with multiple sections, mark attendance for ALL sections together
      navigateToMarkAttendance(period, undefined);
      return;
    }

    // For single section, get the section ID and proceed directly
    const sectionId = getSingleSectionId(period);

    if (!sectionId) {
      toast.error('Section information not found');
      return;
    }

    navigateToMarkAttendance(period, sectionId);
  };

  // Helper to get single section ID from period
  const getSingleSectionId = (
    period: AttendancePeriodOption
  ): string | undefined => {
    // Try multiple sources in priority order
    return (
      searchContext.section_id ||
      period.sections?.[0]?.id ||
      period.section_ids?.[0] ||
      period.section_name
    );
  };

  // Handle section selection from modal
  const handleSectionSelected = (sectionId: string) => {
    if (selectedPeriodForModal) {
      navigateToMarkAttendance(selectedPeriodForModal, sectionId);
      setSelectedPeriodForModal(null);
    }
  };

  // Navigate to mark attendance page with optional section
  // Updated: 2025-10-13 - Pass subdivision group data for group-specific attendance
  const navigateToMarkAttendance = (
    period: AttendancePeriodOption,
    sectionId?: string
  ) => {
    const params: Record<string, string> = {
      periodId: period.timetable_slot_id,
      timetableId: period.timetable_id || '',
      date: searchContext.attendance_date || '',
      periodName: period.period_name || 'Unknown Period',
      courseName: period.course?.course_name || 'Unknown Course',
      startTime: period.start_time || '',
      endTime: period.end_time || ''
    };

    // Only include sectionId if provided (for section-level timetables)
    // For semester-level with multiple sections, omit sectionId to load all students
    if (sectionId) {
      params.sectionId = sectionId;
    }

    // Updated: 2025-10-13 - Pass subdivision group data if this is a subdivided period
    if ((period as any).is_subdivided && (period as any).subdivision_group) {
      const group = (period as any).subdivision_group;

      params.isSubdivided = 'true';
      params.subdivisionGroupOrder = String(group.group_order);
      params.subdivisionGroupName = group.group_name;
      // Pass student and staff IDs as comma-separated strings
      if (group.student_ids && group.student_ids.length > 0) {
        params.subdivisionStudentIds = group.student_ids.join(',');
      }
      if (group.staff_ids && group.staff_ids.length > 0) {
        params.subdivisionStaffIds = group.staff_ids.join(',');
      } else {
        logger.warn('academic/attendance', 'No staff_ids found in subdivision group', { group_name: group.group_name });
      }
      if (group.lab_room) {
        params.subdivisionLabRoom = group.lab_room;
      }
    }

    const searchParams = new URLSearchParams(params);
    router.push(`/academic/attendance/mark?${searchParams.toString()}`);
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

      {/* Section Selection Modal - Updated: 2025-10-09 */}
      <SectionSelectionModal
        open={showSectionModal}
        onOpenChange={setShowSectionModal}
        sections={(selectedPeriodForModal?.sections || []).map((section) => ({
          id: section.id,
          name: section.name || section.section_name || 'Unknown Section'
        }))}
        onSectionSelect={handleSectionSelected}
        periodName={selectedPeriodForModal?.period_name || ''}
        courseName={selectedPeriodForModal?.course?.course_name || ''}
        startTime={selectedPeriodForModal?.start_time}
        endTime={selectedPeriodForModal?.end_time}
      />
    </ContentLayout>
  );
}
