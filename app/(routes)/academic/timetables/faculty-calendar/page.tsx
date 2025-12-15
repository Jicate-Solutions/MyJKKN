'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Calendar,
  Clock,
  User,
  Users,
  Settings,
  Download,
  RefreshCw,
  AlertCircle,
  Filter,
  Calendar as CalendarIcon
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useCurrentUserStaff,
  useFacultyCalendar
} from '@/hooks/academic/use-faculty-calendar';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { FacultyCalendar } from './_components/faculty-calendar';
import { FacultyCalendarFilters } from './_components/faculty-calendar-filters';
import type {
  FacultyCalendarFilters as FacultyCalendarFiltersType,
  FacultySlot
} from '@/types/faculty-calendar';
import Loading from '@/components/Loading/Loading';

export default function FacultyCalendarPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();
  const {
    staffRecord,
    isLoading: loadingStaff,
    isFaculty
  } = useCurrentUserStaff();

  // State for view mode
  const [viewMode, setViewMode] = useState<'faculty' | 'admin'>(
    isSuperAdmin ? 'admin' : 'faculty'
  );

  // Type assertion to fix comparison errors in conditional branches
  const safeViewMode = viewMode as 'faculty' | 'admin';

  // Redirect non-faculty users to admin view if they have permission
  if (profile && !isFaculty && !isSuperAdmin) {
    return (
      <div className='flex items-center justify-center min-h-[400px]'>
        <Card className='w-full max-w-md'>
          <CardContent className='p-6 text-center'>
            <AlertCircle className='h-12 w-12 text-red-500 mx-auto mb-4' />
            <h2 className='text-lg font-semibold mb-2'>Access Denied</h2>
            <p className='text-gray-600 mb-4'>
              You need to be a faculty member or administrator to access the
              faculty calendar.
            </p>
            <Button
              variant='outline'
              onClick={() => router.push('/academic/timetables')}
            >
              Back to Timetables
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show loading while checking staff record
  if (loadingStaff) {
    return <Loading title='Loading faculty information...' />;
  }

  // Show error if faculty user has no staff record
  if (isFaculty && !staffRecord) {
    return (
      <div className='flex items-center justify-center min-h-[400px]'>
        <Card className='w-full max-w-md'>
          <CardContent className='p-6 text-center'>
            <User className='h-12 w-12 text-amber-500 mx-auto mb-4' />
            <h2 className='text-lg font-semibold mb-2'>
              Staff Record Not Found
            </h2>
            <p className='text-gray-600 mb-4'>
              Your account is marked as faculty, but no staff record was found.
              Please contact your administrator to link your account to a staff
              profile.
            </p>
            <Button
              variant='outline'
              onClick={() => router.push('/academic/timetables')}
            >
              Back to Timetables
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pageTitle =
    safeViewMode === 'faculty'
      ? 'My Timetable Calendar'
      : 'Faculty Calendar Management';
  const pageDescription =
    safeViewMode === 'faculty'
      ? 'View your personal teaching schedule and class assignments'
      : 'Manage and view all faculty timetable assignments';

  // Skip permission guard if user is faculty viewing their own calendar
  if (Boolean(safeViewMode === 'faculty' && isFaculty)) {
    return (
      <ContentLayout title={pageTitle}>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic'>Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic/timetables'>
                  Timetables
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbPage>Faculty Calendar</BreadcrumbPage>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className='flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight'>{pageTitle}</h1>
              <p className='text-muted-foreground'>{pageDescription}</p>

              {/* Faculty Info for personal view */}
              {safeViewMode === 'faculty' && staffRecord && (
                <div className='flex items-center gap-2 mt-2'>
                  <Badge variant='outline' className='text-xs'>
                    <User className='h-3 w-3 mr-1' />
                    {staffRecord.first_name} {staffRecord.last_name}
                  </Badge>
                  {staffRecord.department && (
                    <Badge variant='secondary' className='text-xs'>
                      {staffRecord.department.department_name}
                    </Badge>
                  )}
                  {staffRecord.staff_id && (
                    <Badge variant='outline' className='text-xs'>
                      ID: {staffRecord.staff_id}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Header Actions */}
            <div className='flex items-center gap-2'>
              {/* View Mode Toggle for Super Admin */}
              {isSuperAdmin && (
                <div className='flex items-center border rounded-lg p-1'>
                  <Button
                    variant={safeViewMode === 'faculty' ? 'default' : 'ghost'}
                    size='sm'
                    onClick={() => setViewMode('faculty')}
                    className='text-xs'
                  >
                    <User className='h-3 w-3 mr-1' />
                    Faculty View
                  </Button>
                  <Button
                    variant={
                      Boolean(safeViewMode === 'admin') ? 'default' : 'ghost'
                    }
                    size='sm'
                    onClick={() => setViewMode('admin')}
                    className='text-xs'
                  >
                    <Users className='h-3 w-3 mr-1' />
                    Admin View
                  </Button>
                </div>
              )}

              {/* Action Buttons */}
              <Button variant='outline' size='sm'>
                <Download className='h-4 w-4 mr-2' />
                Export
              </Button>

              <Button variant='outline' size='sm'>
                <RefreshCw className='h-4 w-4 mr-2' />
                Refresh
              </Button>

              {Boolean(safeViewMode === 'admin') && (
                <Button variant='outline' size='sm'>
                  <Settings className='h-4 w-4 mr-2' />
                  Settings
                </Button>
              )}
            </div>
          </div>

          {/* Calendar Component */}
          <FacultyCalendarContainer
            viewMode={viewMode}
            staffId={staffRecord?.id}
          />
        </div>
      </ContentLayout>
    );
  }

  return (
    <PermissionGuard
      module='admin'
      action='faculty'
      fallback={
        <ContentLayout title='Access Denied'>
          <div className='text-center py-8'>
            <p>You don&apos;t have permission to access this page.</p>
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title={pageTitle}>
        <div className='space-y-6'>
          {/* Breadcrumb */}
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic'>Academic</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic/timetables'>
                  Timetables
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbPage>Faculty Calendar</BreadcrumbPage>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className='flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight'>{pageTitle}</h1>
              <p className='text-muted-foreground'>{pageDescription}</p>

              {/* Faculty Info for personal view */}
              {safeViewMode === 'faculty' && staffRecord && (
                <div className='flex items-center gap-2 mt-2'>
                  <Badge variant='outline' className='text-xs'>
                    <User className='h-3 w-3 mr-1' />
                    {staffRecord.first_name} {staffRecord.last_name}
                  </Badge>
                  {staffRecord.department && (
                    <Badge variant='secondary' className='text-xs'>
                      {staffRecord.department.department_name}
                    </Badge>
                  )}
                  {staffRecord.staff_id && (
                    <Badge variant='outline' className='text-xs'>
                      ID: {staffRecord.staff_id}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            {/* Header Actions */}
            <div className='flex items-center gap-2'>
              {/* View Mode Toggle for Super Admin */}
              {isSuperAdmin && (
                <div className='flex items-center border rounded-lg p-1'>
                  <Button
                    variant={safeViewMode === 'faculty' ? 'default' : 'ghost'}
                    size='sm'
                    onClick={() => setViewMode('faculty')}
                    className='text-xs'
                  >
                    <User className='h-3 w-3 mr-1' />
                    Faculty View
                  </Button>
                  <Button
                    variant={
                      Boolean(safeViewMode === 'admin') ? 'default' : 'ghost'
                    }
                    size='sm'
                    onClick={() => setViewMode('admin')}
                    className='text-xs'
                  >
                    <Users className='h-3 w-3 mr-1' />
                    Admin View
                  </Button>
                </div>
              )}

              {/* Action Buttons */}
              <Button variant='outline' size='sm'>
                <Download className='h-4 w-4 mr-2' />
                Export
              </Button>

              <Button variant='outline' size='sm'>
                <RefreshCw className='h-4 w-4 mr-2' />
                Refresh
              </Button>

              {Boolean(safeViewMode === 'admin') && (
                <Button variant='outline' size='sm'>
                  <Settings className='h-4 w-4 mr-2' />
                  Settings
                </Button>
              )}
            </div>
          </div>

          {/* Calendar Component */}
          <FacultyCalendarContainer
            viewMode={viewMode}
            staffId={staffRecord?.id}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

// Container component that handles the calendar logic
function FacultyCalendarContainer({
  viewMode,
  staffId
}: {
  viewMode: 'faculty' | 'admin';
  staffId?: string;
}) {
  const [filters, setFilters] = useState<FacultyCalendarFiltersType>({
    date_range: {
      from: new Date(),
      to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    },
    include_break_slots: viewMode === 'faculty'
  });

  const [hasAppliedFilters, setHasAppliedFilters] = useState(
    viewMode === 'faculty'
  );

  const handleSlotClick = (slot: FacultySlot) => {
    // Handle slot click - could open edit dialog, navigate to details, etc.
  };

  const handleDateClick = (date: Date) => {
    // Handle date click - could open create dialog for new slot
  };

  const handleFiltersApply = (newFilters: FacultyCalendarFiltersType) => {
    setFilters(newFilters);
    setHasAppliedFilters(true);
  };

  const handleClearFilters = () => {
    setFilters({
      date_range: {
        from: new Date(),
        to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      },
      include_break_slots: false
    });
    setHasAppliedFilters(false);
  };

  // Admin view with filter-first approach
  if (viewMode === 'admin') {
    return (
      <div className='space-y-6'>
        {/* Filter Section */}
        <Card className='border-2 border-dashed border-primary/20 bg-gradient-to-r from-blue-50 to-indigo-50'>
          <CardHeader className='pb-4'>
            <div className='flex items-center justify-between'>
              <div>
                <CardTitle className='flex items-center gap-2 text-lg'>
                  <Filter className='h-5 w-5 text-primary' />
                  Faculty Calendar Filters
                </CardTitle>
                <p className='text-sm text-muted-foreground mt-1'>
                  Select filters to view faculty timetable data efficiently
                </p>
              </div>
              {hasAppliedFilters && (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={handleClearFilters}
                  className='text-xs'
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <FacultyCalendarFilters
              filters={filters}
              onFiltersChange={handleFiltersApply}
              viewMode={viewMode}
            />
          </CardContent>
        </Card>

        {/* Calendar Section - Only show after filters applied */}
        {hasAppliedFilters ? (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <CalendarIcon className='h-5 w-5' />
                Faculty Calendar
                <Badge variant='secondary' className='text-xs'>
                  Filtered View
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className='p-0'>
              <FacultyCalendar
                viewMode={viewMode}
                staffId={staffId}
                filters={filters}
                onSlotClick={handleSlotClick}
                onDateClick={handleDateClick}
                height={600}
              />
            </CardContent>
          </Card>
        ) : (
          <Card className='border-2 border-dashed border-gray-300'>
            <CardContent className='p-12'>
              <div className='text-center'>
                <div className='flex justify-center mb-4'>
                  <div className='relative'>
                    <CalendarIcon className='h-16 w-16 text-gray-300' />
                    <div className='absolute -top-2 -right-2 h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center'>
                      <Filter className='h-4 w-4 text-blue-600' />
                    </div>
                  </div>
                </div>
                <h3 className='text-xl font-semibold text-gray-700 mb-2'>
                  Ready to View Faculty Calendar
                </h3>
                <p className='text-gray-500 mb-6 max-w-md mx-auto'>
                  Apply filters above to load and display faculty timetable
                  data. This approach ensures optimal performance for large
                  datasets.
                </p>
                <div className='flex items-center justify-center gap-4 text-sm text-gray-400'>
                  <div className='flex items-center gap-1'>
                    <div className='w-2 h-2 bg-blue-400 rounded-full'></div>
                    <span>Institution Filter</span>
                  </div>
                  <div className='flex items-center gap-1'>
                    <div className='w-2 h-2 bg-green-400 rounded-full'></div>
                    <span>Date Range</span>
                  </div>
                  <div className='flex items-center gap-1'>
                    <div className='w-2 h-2 bg-purple-400 rounded-full'></div>
                    <span>Faculty Selection</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // Faculty view - show calendar immediately
  return (
    <div className='space-y-6'>
      <FacultyCalendar
        viewMode={viewMode}
        staffId={staffId}
        filters={filters}
        onSlotClick={handleSlotClick}
        onDateClick={handleDateClick}
        height={600}
      />
    </div>
  );
}
