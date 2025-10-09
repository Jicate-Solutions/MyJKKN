'use client';

import { useState, useEffect } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { FacultyQuickAttendance } from './faculty-quick-attendance';
import { AttendanceFilters } from './attendance-filters';
import { AvailablePeriodsCards } from './available-periods-cards';
import { FacultyAttendanceService } from '@/lib/services/academic/faculty-attendance-service';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search,
  CalendarDays,
  Loader2,
  Info,
  AlertTriangle
} from 'lucide-react';
import type {
  AttendanceSearchContext,
  AttendancePeriodOption
} from '@/types/attendance';
import { toast } from 'sonner';

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
  const { isSuperAdmin: isUserSuperAdmin, userProfile } = usePermissions();
  const { profile } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  // Updated: 2025-10-09 - Track if section is required for validation
  const [isSectionRequired, setIsSectionRequired] = useState(false);

  // Determine initial loading state based on role
  const isFaculty = profile?.role === 'faculty';
  const isHOD = profile?.role === 'hod';
  const isAdmin =
    profile?.role === 'administrator' || profile?.role === 'principal';
  const shouldCheckStaff = isFaculty && !isUserSuperAdmin;

  const [loadingStaffId, setLoadingStaffId] = useState(shouldCheckStaff);
  const [activeTab, setActiveTab] = useState<string>('quick');

  // Check if user is faculty (has a staff record) - Skip for non-faculty roles
  useEffect(() => {
    const checkIfFaculty = async () => {
      console.log('🎯 AttendanceViewSelector - Role Check:', {
        isUserSuperAdmin,
        isAdmin,
        isHOD,
        isFaculty,
        role: profile?.role,
        email: profile?.email
      });

      // Skip faculty check for super admins, admin roles, and HOD roles
      if (isUserSuperAdmin || isAdmin || isHOD || !isFaculty) {
        console.log('✅ Non-faculty role detected - skipping staff check');
        setLoadingStaffId(false);
        return;
      }

      if (!profile?.email) {
        console.log('⚠️ No profile email - skipping staff check');
        setLoadingStaffId(false);
        return;
      }

      try {
        setLoadingStaffId(true);
        const id = await FacultyAttendanceService.getStaffIdByEmail(
          profile.email
        );
        setStaffId(id);
        console.log('✅ Faculty staff ID found:', id);
      } catch (error) {
        console.error('Error checking faculty status:', error);
      } finally {
        setLoadingStaffId(false);
      }
    };

    checkIfFaculty();
  }, [profile?.email, isUserSuperAdmin, isAdmin, isFaculty, isHOD]);

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
          description:
            'This semester uses section-level timetables. Each section has its own timetable.'
        }
      );
      return false;
    }

    return true;
  };

  // Updated: 2025-10-09 - Wrap onSearch with validation
  const handleSearch = () => {
    if (validateSearch()) {
      onSearch();
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

  // Loading state
  if (loadingStaffId) {
    console.log('⏳ Showing loading state');
    return (
      <div className='flex items-center justify-center py-8'>
        <Loader2 className='h-6 w-6 animate-spin mr-2' />
        <span>Loading attendance view...</span>
      </div>
    );
  }

  console.log('🎨 Rendering AttendanceViewSelector:', {
    isUserSuperAdmin,
    isAdmin,
    isHOD,
    staffId,
    isFaculty,
    willShowAdminInterface: isUserSuperAdmin || isAdmin || isHOD,
    willShowFacultyInterface: !!staffId,
    willShowNoPermission: !staffId && isFaculty,
    willShowDefaultNoPermission: !isUserSuperAdmin && !isAdmin && !isHOD && !staffId
  });

  // For super admins, administrators, and HOD users, show the full search interface
  if (isUserSuperAdmin || isAdmin || isHOD) {
    console.log('✅ Rendering admin/super admin search interface');
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

        {/* Show search results for admins */}
        {showResults && (
          <div className='mt-6'>
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
      </div>
    );
  }

  // For faculty members, show tabbed interface
  if (staffId) {
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
            <div className='mt-6'>
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
