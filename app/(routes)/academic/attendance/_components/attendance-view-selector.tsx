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
  CalendarCheck,
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
  const { isSuperAdmin: isUserSuperAdmin, userProfile, isLoading: permissionsLoading, canAccess } = usePermissions();
  const { profile, isLoading: authLoading } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  // Updated: 2025-10-09 - Track if section is required for validation
  const [isSectionRequired, setIsSectionRequired] = useState(false);
  // Updated: 2025-10-14 - Add ref for auto-scroll to periods section
  const periodsRef = useRef<HTMLDivElement>(null);
  // Updated: 2025-10-14 - Add state for date picker in My Classes tab
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Determine initial loading state based on role.
  // Updated: 2026-06-17 — Honor multi-role / merged permissions. A user's PRIMARY
  // profiles.role may not be 'faculty' (e.g. a 'staff_counselor' who also holds a
  // secondary 'faculty' role), but if they were granted academic.attendance.mark
  // they are faculty-capable and must reach the period-marking flow. Gating on the
  // single role string alone wrongly denied such users (their real staff record
  // still resolves by email below, routing them into "My Classes").
  const canMarkAttendance = canAccess('academic.attendance', 'mark');
  const isFaculty = profile?.role === 'faculty' || canMarkAttendance;
  const isHOD = profile?.role === 'hod';
  // Updated: 2026-06-22 — principal is split out of isAdmin into its own flag so
  // it can follow the teaching-aware HOD path (My Classes tab) instead of the
  // admin search-only path. isAdmin now means a pure administrator.
  const isPrincipal = profile?.role === 'principal';
  const isAdmin = profile?.role === 'administrator';
  // Updated: 2026-06-22 — HODs and principals are also teaching staff. Resolve
  // their staff record too so they can reach the "My Classes" tab for the
  // periods they personally teach, in addition to the dept/institution search.
  const shouldCheckStaff =
    (isFaculty || isHOD || isPrincipal) && !isUserSuperAdmin;

  const [loadingStaffId, setLoadingStaffId] = useState(shouldCheckStaff);
  // Tracks whether the staff-record lookup has finished. Permission-based faculty
  // only become isFaculty=true AFTER permissions load, so without this flag they
  // would briefly flash the "not linked to a staff record" / "no permission"
  // fallback in the render window before their staffId resolves.
  const [staffChecked, setStaffChecked] = useState(false);
  /**
   * The staff lookup FAILED, as opposed to finding nothing (BUG-005820).
   * Kept separate from `staffId === null` because the two demand opposite
   * responses: an absent staff record is the user's administrator's problem, a
   * failed lookup is ours. Conflating them is what printed "your account is not
   * linked to a staff record" over a timeout and sent an admin off to change
   * data that was already correct.
   */
  const [staffLookupError, setStaffLookupError] = useState<string | null>(null);
  /** Bumped by the Retry button to re-run the staff lookup. */
  const [staffRetry, setStaffRetry] = useState(0);

  // Updated: 2026-06-10 - Class incharges (any role) may mark day-wise
  // (session_wise) attendance. Detect incharge status so they reach the search
  // flow even when their role isn't faculty/hod/admin.
  const [isClassIncharge, setIsClassIncharge] = useState(false);
  const [inchargeStaffId, setInchargeStaffId] = useState<string | null>(null);
  const [checkingIncharge, setCheckingIncharge] = useState(
    !isUserSuperAdmin && !isAdmin && !isHOD && !isPrincipal
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
    // Relevant for the admin/HOD search flow AND the faculty "Search Classes"
    // tab (staffId set). Only after a search, and only once an institution is
    // chosen (else a bare date-only search could match an unrelated school's
    // day-wise class).
    if (
      !(isUserSuperAdmin || isAdmin || isHOD || isPrincipal || !!staffId) ||
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
    isPrincipal,
    staffId,
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
      // Skip the staff lookup for super admins and pure admin roles only.
      // Updated: 2026-06-22 — HODs and principals are included so their teaching
      // staff record resolves, unlocking the "My Classes" tab. A non-teaching
      // HOD/principal simply gets a null staffId and falls back to the search.
      if (
        isUserSuperAdmin ||
        isAdmin ||
        (!isFaculty && !isHOD && !isPrincipal)
      ) {
        setLoadingStaffId(false);
        setStaffChecked(true);
        return;
      }

      if (!profile?.email) {
        setLoadingStaffId(false);
        setStaffChecked(true);
        return;
      }

      try {
        setLoadingStaffId(true);
        setStaffLookupError(null);
        const id = await FacultyAttendanceService.getStaffIdByEmail(
          profile.email
        );
        setStaffId(id);
      } catch (error) {
        logger.error('academic/attendance', 'Error checking faculty status', error);
        // Record it. Before BUG-005820 this catch swallowed the failure and left
        // staffId null, which the render below reported as "your account is not
        // linked to a staff record" — a false statement, and an instruction to
        // an administrator to fix data that was never wrong.
        setStaffId(null);
        setStaffLookupError(
          (error as { message?: string })?.message ?? 'The lookup did not complete.'
        );
      } finally {
        setLoadingStaffId(false);
        setStaffChecked(true);
      }
    };

    checkIfFaculty();
  }, [profile?.email, profile?.role, isUserSuperAdmin, isAdmin, isFaculty, isHOD, isPrincipal, staffRetry]);

  // Detect whether the current user is a class incharge (eligible to mark
  // day-wise attendance). Runs for non-super-admin/admin/hod users, who would
  // otherwise be blocked by the role-based fallback below.
  useEffect(() => {
    const checkIncharge = async () => {
      if (isUserSuperAdmin || isAdmin || isHOD || isPrincipal) {
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
  }, [profile?.email, isUserSuperAdmin, isAdmin, isHOD, isPrincipal]);

  // Faculty-incharges land on the "Day Attendance" tab by default — their
  // "My Classes" period list is empty for schools, so day-wise is what they want.
  useEffect(() => {
    if (staffId && isClassIncharge && inchargeStaffId) setActiveTab('day');
  }, [staffId, isClassIncharge, inchargeStaffId]);

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
  if (
    isInitialLoading ||
    loadingStaffId ||
    checkingIncharge ||
    // Permission-based faculty (non-admin): wait for the staff lookup to finish
    // so we don't flash a denial before staffId resolves. Added: 2026-06-17.
    (isFaculty && !isUserSuperAdmin && !isAdmin && !isHOD && !staffChecked)
  ) {
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
  // Updated: 2026-06-22 — An HOD or principal who teaches (has a staffId) falls
  // through to the tabbed interface below so they get a "My Classes" tab; only
  // non-teaching HODs/principals stay on this search-only view.
  if (isUserSuperAdmin || isAdmin || ((isHOD || isPrincipal) && !staffId)) {
    return (
      <div className='space-y-6 flex flex-col gap-4'>
        <Alert className='flex items-center gap-2 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800'>
          <AlertDescription className='flex items-center gap-2'>
            <Info className='h-4 w-4' />
            {isUserSuperAdmin
              ? 'As a super admin, you have access to all attendance records. Use the search criteria below to find and mark attendance for any class.'
              : isHOD
              ? 'As an HOD, you can manage attendance records for classes in your department. Use the search criteria below to find and mark attendance.'
              : isPrincipal
              ? 'As the principal, you can manage attendance records for your institution. Use the search criteria below to find and mark attendance.'
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

  // For faculty AND teaching HODs (staff record resolved): tabbed interface.
  //   My Classes  — period classes they teach (period_wise)
  //   Day Attendance — FN/AN marking for the class they're incharge of (only
  //                    shown when they are a class incharge)
  //   Search Periods — find any class to mark (department-wide for HODs)
  if (staffId) {
    const facultyIsIncharge = isClassIncharge && !!inchargeStaffId;
    return (
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className='space-y-4'
      >
        <TabsList
          className={cn(
            'grid w-full',
            facultyIsIncharge ? 'max-w-xl grid-cols-3' : 'max-w-md grid-cols-2'
          )}
        >
          <TabsTrigger value='quick' className='flex items-center gap-2'>
            <CalendarDays className='h-4 w-4' />
            My Classes
          </TabsTrigger>
          {facultyIsIncharge && (
            <TabsTrigger value='day' className='flex items-center gap-2'>
              <CalendarCheck className='h-4 w-4' />
              Day Attendance
            </TabsTrigger>
          )}
          <TabsTrigger value='search' className='flex items-center gap-2'>
            <Search className='h-4 w-4' />
            Search Periods
          </TabsTrigger>
        </TabsList>

        {/* Day Attendance — FN/AN marking for the incharge's class */}
        {facultyIsIncharge && (
          <TabsContent value='day' className='space-y-4'>
            <Alert className='flex items-center gap-2 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800'>
              <AlertDescription className='flex items-center gap-2'>
                <Info className='h-4 w-4' />
                As class incharge, mark day-wise (FN &amp; AN) attendance for
                your class. Both sessions present = full day, one = half day.
              </AlertDescription>
            </Alert>
            <DaySessionAttendance staffId={inchargeStaffId} />
          </TabsContent>
        )}

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
        </TabsContent>

        <TabsContent value='search' className='space-y-4'>
          <Alert>
            <Info className='h-4 w-4' />
            <AlertDescription>
              {isHOD
                ? 'As an HOD, search for any class in your department to find and mark attendance.'
                : isPrincipal
                ? 'As the principal, search for any class in your institution to find and mark attendance.'
                : 'Use this search to mark attendance for classes outside your regular schedule or for substitute classes.'}
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

          {/* Show search results when activeTab is 'search'. The attendance type
              is decided from the selected class: a Day-wise (session_wise) class
              shows the FN/AN marker (save still requires the user be its
              incharge); otherwise the period cards. */}
          {showResults && activeTab === 'search' && (
            <div ref={periodsRef} className='mt-6'>
              {detectingMode ? (
                <div className='flex items-center justify-center py-8'>
                  <Loader2 className='h-6 w-6 animate-spin mr-2' />
                  <span>Checking attendance type…</span>
                </div>
              ) : dayClass ? (
                <div className='space-y-4'>
                  <Alert className='flex items-center gap-2 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800'>
                    <AlertDescription className='flex items-center gap-2'>
                      <Info className='h-4 w-4' />
                      This class uses Day-wise attendance. Mark Forenoon (FN) &amp;
                      Afternoon (AN) below
                      {isHOD || isPrincipal
                        ? ' — both present = full day, one = half day.'
                        : ' — you must be the class incharge to save.'}
                    </AlertDescription>
                  </Alert>
                  <DaySessionAttendance
                    staffId={null}
                    allowOverride={isHOD || isPrincipal}
                    fixedClass={dayClass}
                    initialDate={searchContext.attendance_date || undefined}
                  />
                </div>
              ) : (
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
        </TabsContent>
      </Tabs>
    );
  }

  // Non-faculty class incharges (no staff/teaching record, e.g. a facilitator
  // role) get the clean day-wise panel — they only mark FN/AN for their class.
  if (isClassIncharge && inchargeStaffId) {
    return (
      <div className='space-y-4'>
        <Alert className='flex items-center gap-2 border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800'>
          <AlertDescription className='flex items-center gap-2'>
            <Info className='h-4 w-4' />
            As class incharge, mark day-wise (FN &amp; AN) attendance for your
            class. Both sessions present = full day, one = half day.
          </AlertDescription>
        </Alert>
        <DaySessionAttendance staffId={inchargeStaffId} />
      </div>
    );
  }

  // The lookup FAILED. Checked before the "not linked" branch below, because
  // both arrive here with staffId === null and only one of them is the user's
  // problem. Says what broke and offers a retry — never blames the account.
  if (isFaculty && staffLookupError) {
    return (
      <div className='space-y-6'>
        <Alert variant='destructive'>
          <AlertTriangle className='h-4 w-4' />
          <AlertDescription className='space-y-3'>
            <p>
              We could not check your team member record just now, so your
              sessions cannot be listed. This is a problem on our side, not with
              your account — nothing needs changing.
            </p>
            <p className='text-xs opacity-80'>{staffLookupError}</p>
            <Button
              size='sm'
              variant='outline'
              onClick={() => setStaffRetry((n) => n + 1)}
              disabled={loadingStaffId}
            >
              {loadingStaffId ? 'Checking…' : 'Try again'}
            </Button>
          </AlertDescription>
        </Alert>
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
            {/* Names the column that is actually searched, and the failure mode
                that caused BUG-005820: a record DID exist for this person, with
                a misspelled institution email, so it could not be found. The old
                wording ("link your email to your profile") read as "create the
                link", and an administrator created a SECOND record — which
                resolved this screen and still showed no sessions, because the
                timetable assignments stayed on the original row. */}
            No team member record was found with the institution email{' '}
            <strong>{profile?.email}</strong>, so your sessions cannot be listed.
            Please ask the administrator to check whether a team member record
            already exists for you under a different or misspelled institution
            email and correct that one — creating a new record will not carry
            your timetable across.
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
