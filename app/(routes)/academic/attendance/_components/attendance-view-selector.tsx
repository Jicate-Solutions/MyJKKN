'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { FacultyQuickAttendance } from './faculty-quick-attendance';
import { DaySessionAttendance } from '../day/_components/day-session-attendance';
import { AttendanceFilters } from './attendance-filters';
import { AvailablePeriodsCards } from './available-periods-cards';
import { FacultyAttendanceService } from '@/lib/services/academic/faculty-attendance-service';
import { ClassInchargeService } from '@/lib/services/staff/class-incharge-service';
import { AttendanceService } from '@/lib/services/academic/attendance-service';
import { logger } from '@/lib/utils/enhanced-logger';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import {
  Search,
  CalendarDays,
  Loader2,
  Info,
  AlertTriangle,
  CalendarIcon
} from 'lucide-react';
import type {
  AttendanceSearchContext,
  AttendancePeriodOption,
  DaySessionClass
} from '@/types/attendance';
import toast from 'react-hot-toast';

interface AttendanceViewSelectorProps {
  searchContext: AttendanceSearchContext;
  onContextChange: (context: Partial<AttendanceSearchContext>) => void;
  availablePeriods: AttendancePeriodOption[];
  selectedPeriod: string | null;
  onPeriodSelect: (period: AttendancePeriodOption) => void;
  loading: boolean;
  onSearch: () => void;
  showResults?: boolean;
  attendancePermissions?: Map<string, boolean>;
  isSuperAdmin?: boolean;
}

export function AttendanceViewSelector({
  searchContext,
  onContextChange,
  availablePeriods,
  selectedPeriod,
  onPeriodSelect,
  loading,
  onSearch,
  showResults = false,
  attendancePermissions = new Map(),
  isSuperAdmin = false
}: AttendanceViewSelectorProps) {
  // Updated: 2025-11-29 - Include isLoading to prevent showing "no permission" during permission load
  const { isSuperAdmin: isUserSuperAdmin, userProfile, isLoading: permissionsLoading } = usePermissions();
  const { profile, isLoading: authLoading } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  // Updated: 2025-10-09 - Track if section is required for validation
  const [isSectionRequired, setIsSectionRequired] = useState(false);
  // Updated: 2025-10-14 - Add ref for auto-scroll to periods section
  const periodsRef = useRef<HTMLDivElement>(null);
  // Updated: 2025-10-14 - Add state for date picker in My Classes tab
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Determine initial loading state based on role
  const isFaculty = profile?.role === 'faculty';
  const isHOD = profile?.role === 'hod';
  const isAdmin =
    profile?.role === 'administrator' || profile?.role === 'principal';
  const shouldCheckStaff = isFaculty && !isUserSuperAdmin;

  const [loadingStaffId, setLoadingStaffId] = useState(shouldCheckStaff);

  // Updated: 2026-06-10 - Class incharges (any role) may mark day-wise
  // (session_wise) attendance. Detect incharge status so they reach the search
  // flow even when their role isn't faculty/hod/admin.
  const [isClassIncharge, setIsClassIncharge] = useState(false);
  const [inchargeStaffId, setInchargeStaffId] = useState<string | null>(null);
  const [checkingIncharge, setCheckingIncharge] = useState(
    !isUserSuperAdmin && !isAdmin && !isHOD
  );

  // Combined loading state - wait for both auth and permissions to load
  const isInitialLoading = authLoading || permissionsLoading;
  const [activeTab, setActiveTab] = useState<string>('quick');

  // Added: 2026-06-11 - The attendance TYPE is decided server-side from the
  // selected criteria. After an admin/HOD search, we look up whether the chosen
  // class is Day-wise (session_wise); if so we show the FN/AN marker instead of
  // the (empty) period cards — no manual Period/Day tab needed.
  const [dayClass, setDayClass] = useState<DaySessionClass | null>(null);
  const [detectingMode, setDetectingMode] = useState(false);

  useEffect(() => {
    // Only relevant for the admin/HOD search flow, only after a search, and only
    // once an institution is chosen (else a bare date-only search could match an
    // unrelated school's day-wise class).
    if (
      !(isUserSuperAdmin || isAdmin || isHOD) ||
      !showResults ||
      !searchContext.institution_id
    ) {
      setDayClass(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        setDetectingMode(true);
        const cls = await AttendanceService.getSessionWiseClassForCriteria({
          institution_id: searchContext.institution_id,
          academic_year_id: searchContext.academic_year_id,
          degree_id: searchContext.degree_id,
          program_id: searchContext.program_id,
          department_id: searchContext.department_id,
          semester_id: searchContext.semester_id,
          section_id: searchContext.section_id
        });
        if (active) setDayClass(cls);
      } catch (error) {
        logger.error('academic/attendance', 'Error detecting attendance mode', error);
        if (active) setDayClass(null);
      } finally {
        if (active) setDetectingMode(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [
    isUserSuperAdmin,
    isAdmin,
    isHOD,
    showResults,
    searchContext.institution_id,
    searchContext.academic_year_id,
    searchContext.degree_id,
    searchContext.program_id,
    searchContext.department_id,
    searchContext.semester_id,
    searchContext.section_id
  ]);

  // Updated: 2025-10-14 - Set client flag for date operations
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Check if user is faculty (has a staff record) - Skip for non-faculty roles
  useEffect(() => {
    const checkIfFaculty = async () => {
      // Skip faculty check for super admins, admin roles, and HOD roles
      if (isUserSuperAdmin || isAdmin || isHOD || !isFaculty) {
        setLoadingStaffId(false);
        return;
      }

      if (!profile?.email) {
        setLoadingStaffId(false);
        return;
      }

      try {
        setLoadingStaffId(true);
        const id = await FacultyAttendanceService.getStaffIdByEmail(
          profile.email
        );
        setStaffId(id);
      } catch (error) {
        logger.error('academic/attendance', 'Error checking faculty status', error);
      } finally {
        setLoadingStaffId(false);
      }
    };

    checkIfFaculty();
  }, [profile?.email, profile?.role, isUserSuperAdmin, isAdmin, isFaculty, isHOD]);

  // Detect whether the current user is a class incharge (eligible to mark
  // day-wise attendance). Runs for non-super-admin/admin/hod users, who would
  // otherwise be blocked by the role-based fallback below.
  useEffect(() => {
    const checkIncharge = async () => {
      if (isUserSuperAdmin || isAdmin || isHOD) {
        setCheckingIncharge(false);
        return;
      }
      if (!profile?.email) {
        setCheckingIncharge(false);
        return;
      }
      try {
        setCheckingIncharge(true);
        const id = await FacultyAttendanceService.getStaffIdByEmail(
          profile.email
        );
        if (!id) {
          setIsClassIncharge(false);
          return;
        }
        const incharge = await ClassInchargeService.isStaffIncharge(id);
        setIsClassIncharge(incharge);
        if (incharge) setInchargeStaffId(id);
      } catch (error) {
        logger.error('academic/attendance', 'Error checking incharge status', error);
        setIsClassIncharge(false);
      } finally {
        setCheckingIncharge(false);
      }
    };

    checkIncharge();
  }, [profile?.email, isUserSuperAdmin, isAdmin, isHOD]);

  // Updated: 2025-10-09 - Validate search criteria before search
  const validateSearch = (): boolean => {
    if (!searchContext.attendance_date) {
      toast.error('Please select an attendance date');
      return false;
    }

    if (isSectionRequired && !searchContext.section_id) {
      toast.error(
        'Section is required for this semester. Please select a specific section.',
        {
          icon: <Info className='h-4 w-4' />,
          duration: 5000
        }
      );
      return false;
    }

    return true;
  };

  // Updated: 2025-10-09 - Wrap onSearch with validation
  // Updated: 2025-10-14 - Add auto-scroll to periods section after search
  const handleSearch = () => {
    if (validateSearch()) {
      onSearch();
      // Scroll to periods section after a short delay to allow results to load
      setTimeout(() => {
        periodsRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 300);
    }
  };

  // Handle quick attendance period selection
  const handleQuickPeriodSelect = (
    period: AttendancePeriodOption,
    context: any
  ) => {
    // Update the search context with the auto-filled values
    onContextChange(context);

    // Select the period
    onPeriodSelect(period);
  };

  // Updated: 2025-10-14 - Handle date selection for My Classes tab
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      try {
        // Create date string in local timezone to avoid timezone issues
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const dateString = `${year}-${month}-${day}`;

        onContextChange({ attendance_date: dateString });
        setCalendarOpen(false);
      } catch (error) {
        logger.error('academic/attendance', 'Error formatting date', error);
      }
    }
  };

  // Updated: 2025-10-14 - Handle setting date to today
  const handleTodayClick = () => {
    if (isClient) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      onContextChange({ attendance_date: dateString });
    }
  };

  // Loading state - Updated: 2025-11-29 - Include initial loading to prevent premature "no permission" message
  // Updated: 2026-06-10 - Also wait for the class-incharge check so incharges
  // don't briefly see the "no permission" fallback before being admitted.
  if (isInitialLoading || loadingStaffId || checkingIncharge) {
    return (
      <div className='flex items-center justify-center py-8'>
        <Loader2 className='h-6 w-6 animate-spin mr-2' />
        <span>Loading attendance view...</span>
      </div>
    );
  }

  // For super admins, administrators, and HOD users, show the full search
  // interface. Updated: 2026-06-11 - The attendance TYPE is decided server-side
  // from the selected criteria: after Search we look up whether the chosen class
  // is Day-wise (session_wise, schools). If so we show the FN/AN day marker;
  // otherwise the period cards (colleges). No manual Period/Day tab needed.
  if (isUserSuperAdmin || isAdmin || isHOD) {
    return (
      <div className='space-y-6 flex flex-col gap-4'>
        <Alert className='flex items-center gap-2 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800'>
          <AlertDescription className='flex items-center gap-2'>
            <Info className='h-4 w-4' />
            {isUserSuperAdmin
              ? 'As a super admin, you have access to all attendance records. Use the search criteria below to find and mark attendance for any class.'
              : isHOD
              ? 'As an HOD, you can manage attendance records for classes in your department. Use the search criteria below to find and mark attendance.'
              : 'As an administrator, you can manage attendance records for your institution. Use the search criteria below to find and mark attendance.'}
          </AlertDescription>
        </Alert>

        <AttendanceFilters
          searchContext={searchContext}
          onContextChange={onContextChange}
          loading={loading}
          onSectionRequirementChange={setIsSectionRequired}
        />

        {/* Search button for admins */}
        <div className='flex justify-end'>
          <Button
            onClick={handleSearch}
            disabled={loading || !searchContext.attendance_date}
          >
            <Search className='h-4 w-4 mr-2' />
            Search Periods
          </Button>
        </div>

        {/* Results: the type is decided from the selected class. */}
        {showResults && (
          <div ref={periodsRef} className='mt-6'>
            {detectingMode ? (
              <div className='flex items-center justify-center py-8'>
                <Loader2 className='h-6 w-6 animate-spin mr-2' />
                <span>Checking attendance type…</span>
              </div>
            ) : dayClass ? (
              // Day-wise (school) class detected — mark FN/AN sessions directly.
              <div className='space-y-4'>
                <Alert className='flex items-center gap-2 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800'>
                  <AlertDescription className='flex items-center gap-2'>
                    <Info className='h-4 w-4' />
                    This class uses Day-wise attendance. Mark Forenoon (FN) &amp;
                    Afternoon (AN) sessions below — both present = full day, one =
                    half day.
                  </AlertDescription>
                </Alert>
                <DaySessionAttendance
                  staffId={null}
                  allowOverride
                  fixedClass={dayClass}
                  initialDate={searchContext.attendance_date || undefined}
                />
              </div>
            ) : (
              // Period-wise (college) class — show the period cards.
              <AvailablePeriodsCards
                periods={availablePeriods}
                onPeriodSelect={onPeriodSelect}
                loading={loading}
                selectedDate={searchContext.attendance_date || undefined}
                attendancePermissions={attendancePermissions}
                isSuperAdmin={isSuperAdmin}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // For faculty members, show tabbed interface.
  // Updated: 2026-06-11 - "My Classes" shows ALL of the faculty's attendance for
  // the day in one place: period cards for period_wise classes they teach, AND
  // the Day-wise (FN/AN) marker for any session_wise class they're incharge of.
  // session_wise periods are excluded from the period cards (they're not marked
  // per-period), so a pure school incharge sees only the day-wise marker here.
  if (staffId) {
    const facultyIsIncharge = isClassIncharge && !!inchargeStaffId;
    return (
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className='space-y-4'
      >
        <TabsList className='grid w-full max-w-md grid-cols-2'>
          <TabsTrigger value='quick' className='flex items-center gap-2'>
            <CalendarDays className='h-4 w-4' />
            My Classes
          </TabsTrigger>
          <TabsTrigger value='search' className='flex items-center gap-2'>
            <Search className='h-4 w-4' />
            Search Classes
          </TabsTrigger>
        </TabsList>

        <TabsContent value='quick' className='space-y-4'>
          {/* Updated: 2025-10-14 - Add date picker for My Classes tab */}
          <div className='flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-4 bg-muted/50 rounded-lg border'>
            <div className='flex items-center gap-2'>
              <CalendarIcon className='h-4 w-4 text-muted-foreground' />
              <span className='text-sm font-medium'>Select Date:</span>
            </div>
            <div className='flex gap-2 w-full sm:w-auto'>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant='outline'
                    className={cn(
                      'justify-start text-left font-normal flex-1 sm:w-[240px]',
                      !searchContext.attendance_date && 'text-muted-foreground'
                    )}
                    onClick={() => setCalendarOpen(true)}
                  >
                    <CalendarIcon className='mr-2 h-4 w-4' />
                    {searchContext.attendance_date && isClient ? (
                      format(
                        new Date(searchContext.attendance_date + 'T00:00:00'),
                        'PPP'
                      )
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-0' align='start'>
                  <Calendar
                    mode='single'
                    selected={
                      searchContext.attendance_date && isClient
                        ? new Date(searchContext.attendance_date + 'T00:00:00')
                        : undefined
                    }
                    onSelect={handleDateSelect}
                    initialFocus
                    disabled={
                      isClient
                        ? (date) => {
                            // Disable future dates (only allow present and past dates)
                            const today = new Date();
                            today.setHours(23, 59, 59, 999); // Set to end of today
                            return date > today;
                          }
                        : undefined
                    }
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant='outline'
                size='sm'
                onClick={handleTodayClick}
                disabled={!isClient}
                className='whitespace-nowrap'
              >
                Today
              </Button>
            </div>
          </div>

          <FacultyQuickAttendance
            staffId={staffId}
            staffName={profile?.full_name || 'Faculty'}
            onPeriodSelect={handleQuickPeriodSelect}
            selectedDate={searchContext.attendance_date || undefined}
          />

          {/* Day-wise (FN/AN) marking shown right here in "My Classes" for
              faculty who are also class incharges of a session_wise class —
              their school class isn't markable per-period, so it appears as the
              day-wise marker alongside any period classes they teach. */}
          {facultyIsIncharge && (
            <div className='space-y-4 pt-2'>
              <Alert className='flex items-center gap-2 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800'>
                <AlertDescription className='flex items-center gap-2'>
                  <Info className='h-4 w-4' />
                  As class incharge, mark day-wise (FN &amp; AN) attendance for
                  your class. Both sessions present = full day, one = half day.
                </AlertDescription>
              </Alert>
              <DaySessionAttendance
                staffId={inchargeStaffId}
                initialDate={searchContext.attendance_date || undefined}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value='search' className='space-y-4'>
          <Alert>
            <Info className='h-4 w-4' />
            <AlertDescription>
              Use this search to mark attendance for classes outside your
              regular schedule or for substitute classes.
            </AlertDescription>
          </Alert>

          <AttendanceFilters
            searchContext={searchContext}
            onContextChange={onContextChange}
            loading={loading}
            onSectionRequirementChange={setIsSectionRequired}
          />

          <div className='flex justify-end'>
            <Button
              onClick={handleSearch}
              disabled={loading || !searchContext.attendance_date}
            >
              <Search className='h-4 w-4 mr-2' />
              Search Periods
            </Button>
          </div>

          {/* Show search results in card format only when activeTab is 'search' */}
          {showResults && activeTab === 'search' && (
            <div ref={periodsRef} className='mt-6'>
              <AvailablePeriodsCards
                periods={availablePeriods}
                onPeriodSelect={onPeriodSelect}
                loading={loading}
                selectedDate={searchContext.attendance_date || undefined}
                attendancePermissions={attendancePermissions}
                isSuperAdmin={isSuperAdmin}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    );
  }

  // For class incharges (any role): auto-load their assigned class(es) — no
  // search needed. They can change the date to mark/view other days. The
  // per-slot permission gate (canMarkAttendanceForSlot) still ensures they can
  // only mark session_wise periods; period-wise stays subject-staff only.
  if (isClassIncharge && inchargeStaffId) {
    return (
      <div className='space-y-4'>
        <Alert className='flex items-center gap-2 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800'>
          <AlertDescription className='flex items-center gap-2'>
            <Info className='h-4 w-4' />
            As a class incharge, mark day-wise (FN &amp; AN) attendance for your
            class below.
          </AlertDescription>
        </Alert>

        <DaySessionAttendance staffId={inchargeStaffId} />
      </div>
    );
  }

  // For faculty without staff record or other users
  if (isFaculty && !staffId) {
    return (
      <div className='space-y-6'>
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription>
            Your faculty account is not linked to a staff record. Please contact
            the administrator to link your email ({profile?.email}) to your
            staff profile.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // For other users (students, etc.), show limited message
  return (
    <div className='space-y-6'>
      <Alert>
        <Info className='h-4 w-4' />
        <AlertDescription>
          You don&apos;t have permission to mark attendance. If you believe this
          is an error, please contact the administration.
        </AlertDescription>
      </Alert>

      <div className='flex justify-end'>
        <Button
          onClick={handleSearch}
          disabled={loading || !searchContext.attendance_date}
        >
          <Search className='h-4 w-4 mr-2' />
          Search Periods
        </Button>
      </div>
    </div>
  );
}
