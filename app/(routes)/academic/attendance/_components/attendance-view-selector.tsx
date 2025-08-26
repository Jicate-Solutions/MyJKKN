'use client';

import { useState, useEffect } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useAuth } from '@/hooks/use-auth';
import { FacultyQuickAttendance } from './faculty-quick-attendance';
import { AttendanceFilters } from './attendance-filters';
import { FacultyAttendanceService } from '@/lib/services/academic/faculty-attendance-service';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, CalendarDays, Loader2, Info, AlertTriangle } from 'lucide-react';
import type { AttendanceSearchContext, AttendancePeriodOption } from '@/types/attendance';

interface AttendanceViewSelectorProps {
  searchContext: AttendanceSearchContext;
  onContextChange: (context: Partial<AttendanceSearchContext>) => void;
  availablePeriods: AttendancePeriodOption[];
  selectedPeriod: string | null;
  onPeriodSelect: (period: AttendancePeriodOption) => void;
  loading: boolean;
  onSearch: () => void;
}

export function AttendanceViewSelector({
  searchContext,
  onContextChange,
  availablePeriods,
  selectedPeriod,
  onPeriodSelect,
  loading,
  onSearch
}: AttendanceViewSelectorProps) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const { profile } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  
  // Determine initial loading state based on role
  const isFaculty = profile?.role === 'faculty';
  const isAdmin = profile?.role === 'administrator' || profile?.role === 'principal';
  const shouldCheckStaff = isFaculty && !isSuperAdmin;
  
  const [loadingStaffId, setLoadingStaffId] = useState(shouldCheckStaff);
  const [activeTab, setActiveTab] = useState<string>('quick');

  // Check if user is faculty (has a staff record) - Skip for non-faculty roles
  useEffect(() => {
    const checkIfFaculty = async () => {
      // Skip faculty check for super admins and other admin roles
      if (isSuperAdmin || isAdmin || !isFaculty) {
        setLoadingStaffId(false);
        return;
      }

      if (!profile?.email) {
        setLoadingStaffId(false);
        return;
      }

      try {
        setLoadingStaffId(true);
        const id = await FacultyAttendanceService.getStaffIdByEmail(profile.email);
        setStaffId(id);
      } catch (error) {
        console.error('Error checking faculty status:', error);
      } finally {
        setLoadingStaffId(false);
      }
    };

    checkIfFaculty();
  }, [profile?.email, isSuperAdmin, isAdmin, isFaculty]);

  // Handle quick attendance period selection
  const handleQuickPeriodSelect = (period: AttendancePeriodOption, context: any) => {
    // Update the search context with the auto-filled values
    onContextChange(context);
    
    // Select the period
    onPeriodSelect(period);
  };

  // Loading state
  if (loadingStaffId) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span>Loading attendance view...</span>
      </div>
    );
  }

  // For super admins and administrators, show the full search interface
  if (isSuperAdmin || isAdmin) {
    return (
      <div className="space-y-6">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {isSuperAdmin 
              ? "As a super admin, you have access to all attendance records. Use the search criteria below to find and mark attendance for any class."
              : "As an administrator, you can manage attendance records for your institution. Use the search criteria below to find and mark attendance."}
          </AlertDescription>
        </Alert>
        
        <AttendanceFilters
          searchContext={searchContext}
          onContextChange={onContextChange}
          availablePeriods={availablePeriods}
          selectedPeriod={selectedPeriod}
          onPeriodSelect={onPeriodSelect}
          loading={loading}
        />
        
        {/* Search button for admins */}
        <div className="flex justify-end">
          <Button 
            onClick={onSearch}
            disabled={loading || !searchContext.attendance_date}
          >
            <Search className="h-4 w-4 mr-2" />
            Search Periods
          </Button>
        </div>
      </div>
    );
  }

  // For faculty members, show tabbed interface
  if (staffId) {
    return (
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="quick" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            My Classes
          </TabsTrigger>
          <TabsTrigger value="search" className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Search Classes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="quick" className="space-y-4">
          <FacultyQuickAttendance
            staffId={staffId}
            staffName={profile?.full_name || 'Faculty'}
            onPeriodSelect={handleQuickPeriodSelect}
            selectedDate={searchContext.attendance_date || undefined}
          />
        </TabsContent>

        <TabsContent value="search" className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Use this search to mark attendance for classes outside your regular schedule or for substitute classes.
            </AlertDescription>
          </Alert>
          
          <AttendanceFilters
            searchContext={searchContext}
            onContextChange={onContextChange}
            availablePeriods={availablePeriods}
            selectedPeriod={selectedPeriod}
            onPeriodSelect={onPeriodSelect}
            loading={loading}
          />
          
          <div className="flex justify-end">
            <Button 
              onClick={onSearch}
              disabled={loading || !searchContext.attendance_date}
            >
              <Search className="h-4 w-4 mr-2" />
              Search Periods
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    );
  }

  // For faculty without staff record or other users
  if (isFaculty && !staffId) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Your faculty account is not linked to a staff record. Please contact the administrator to link your email ({profile?.email}) to your staff profile.
          </AlertDescription>
        </Alert>
      </div>
    );
  }
  
  // For other users (students, etc.), show limited message
  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          You don&apos;t have permission to mark attendance. If you believe this is an error, please contact the administration.
        </AlertDescription>
      </Alert>
      
      <div className="flex justify-end">
        <Button 
          onClick={onSearch}
          disabled={loading || !searchContext.attendance_date}
        >
          <Search className="h-4 w-4 mr-2" />
          Search Periods
        </Button>
      </div>
    </div>
  );
}