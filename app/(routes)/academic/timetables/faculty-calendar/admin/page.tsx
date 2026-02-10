'use client';

import { useState, useMemo } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar,
  Users,
  Filter,
  Download,
  RefreshCw,
  BarChart3,
  Clock,
  AlertTriangle,
  Search
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useFacultyCalendar } from '@/hooks/academic/use-faculty-calendar';
import type { FacultyCalendarFilters } from '@/types/faculty-calendar';
import { FacultyCalendarFilters as FiltersComponent } from '../_components/faculty-calendar-filters';
import { FacultyCalendar } from '../_components/faculty-calendar';

export default function AdminFacultyCalendarPage() {
  const router = useRouter();
  const { isSuperAdmin } = usePermissions();

  // State for filters
  const [filters, setFilters] = useState<FacultyCalendarFilters>({
    date_range: {
      from: new Date(),
      to: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
    },
    include_break_slots: false
  });

  const [activeTab, setActiveTab] = useState('calendar');
  const [showFilters, setShowFilters] = useState(true);
  const [showCalendar, setShowCalendar] = useState(false);

  // Use the hook to get stats data when calendar is active
  const { slots, events, courses, totalCount, isLoading, hasData, refresh } =
    useFacultyCalendar({
      viewMode: 'admin',
      filters,
      enabled: showCalendar
    });

  // Compute stats from loaded data
  const stats = useMemo(() => {
    if (!hasData || !slots.length) {
      return {
        totalFaculty: 0,
        activeClasses: 0,
        avgWorkloadHrs: 0,
        conflicts: 0
      };
    }

    // Unique faculty count
    const facultySet = new Set<string>();
    slots.forEach((slot) => {
      if (slot.staff_members) {
        slot.staff_members.forEach((staff) => facultySet.add(staff.id));
      }
    });

    // Active classes (non-break slots)
    const activeClasses = slots.filter((s) => !s.is_break_slot).length;

    // Avg workload (total hours / unique faculty)
    const totalHours = slots.reduce((acc, slot) => {
      const startTime = new Date(`2000-01-01T${slot.start_time}`);
      const endTime = new Date(`2000-01-01T${slot.end_time}`);
      const hours =
        (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);
      return acc + (isNaN(hours) ? 0 : hours);
    }, 0);
    const avgHours =
      facultySet.size > 0
        ? Math.round((totalHours / facultySet.size) * 10) / 10
        : 0;

    // Conflicts: count slots where a faculty member appears in overlapping time
    // Simple heuristic: count duplicate staff+time combinations
    const slotMap = new Map<string, number>();
    let conflictCount = 0;
    slots.forEach((slot) => {
      if (slot.staff_members) {
        slot.staff_members.forEach((staff) => {
          const key = `${staff.id}-${slot.day_of_week || slot.slot_date}-${slot.start_time}`;
          const count = (slotMap.get(key) || 0) + 1;
          slotMap.set(key, count);
          if (count === 2) conflictCount++;
        });
      }
    });

    return {
      totalFaculty: facultySet.size,
      activeClasses,
      avgWorkloadHrs: avgHours,
      conflicts: conflictCount
    };
  }, [hasData, slots]);

  // Handle filter changes
  const handleFiltersChange = (newFilters: FacultyCalendarFilters) => {
    setFilters(newFilters);
    setShowCalendar(true); // Show calendar after filters are applied
  };

  const handleFilterToggle = () => {
    setShowFilters(!showFilters);
  };

  return (
    <PermissionGuard
      module='admin'
      action='faculty'
      fallback={
        <ContentLayout title='Access Denied'>
          <div className='text-center py-8'>
            <p>You don&apos;t have permission to access faculty management.</p>
          </div>
        </ContentLayout>
      }
    >
      <ContentLayout title='Faculty Calendar Management'>
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
              <BreadcrumbItem>
                <BreadcrumbLink href='/academic/timetables/faculty-calendar'>
                  Faculty Calendar
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbPage>Administration</BreadcrumbPage>
            </BreadcrumbList>
          </Breadcrumb>

          {/* Header */}
          <div className='flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight'>
                Faculty Calendar Management
              </h1>
              <p className='text-muted-foreground'>
                Manage faculty assignments, check availability, and analyze
                workload distribution
              </p>
            </div>

            {/* Header Actions */}
            <div className='flex items-center gap-2'>
              <Button variant='outline' size='sm' onClick={handleFilterToggle}>
                <Filter className='h-4 w-4 mr-2' />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>

              <Button variant='outline' size='sm'>
                <Download className='h-4 w-4 mr-2' />
                Export
              </Button>

              <Button
                variant='outline'
                size='sm'
                onClick={() => refresh()}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
            <Card>
              <CardContent className='p-4'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-muted-foreground'>
                      Total Faculty
                    </p>
                    <p className='text-2xl font-bold'>
                      {showCalendar ? stats.totalFaculty : 0}
                    </p>
                  </div>
                  <Users className='h-8 w-8 text-blue-600' />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className='p-4'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-muted-foreground'>
                      Active Classes
                    </p>
                    <p className='text-2xl font-bold'>
                      {showCalendar ? stats.activeClasses : 0}
                    </p>
                  </div>
                  <Calendar className='h-8 w-8 text-green-600' />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className='p-4'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-muted-foreground'>
                      Avg. Workload
                    </p>
                    <p className='text-2xl font-bold'>
                      {showCalendar ? `${stats.avgWorkloadHrs}hrs` : '0hrs'}
                    </p>
                  </div>
                  <Clock className='h-8 w-8 text-purple-600' />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className='p-4'>
                <div className='flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium text-muted-foreground'>
                      Conflicts
                    </p>
                    <p className='text-2xl font-bold'>
                      {showCalendar ? stats.conflicts : 0}
                    </p>
                  </div>
                  <AlertTriangle className='h-8 w-8 text-red-600' />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className='space-y-4'
          >
            <TabsList className='grid w-full grid-cols-4'>
              <TabsTrigger value='calendar'>
                <Calendar className='h-4 w-4 mr-2' />
                Calendar View
              </TabsTrigger>
              <TabsTrigger value='availability'>
                <Users className='h-4 w-4 mr-2' />
                Availability
              </TabsTrigger>
              <TabsTrigger value='workload'>
                <BarChart3 className='h-4 w-4 mr-2' />
                Workload
              </TabsTrigger>
              <TabsTrigger value='conflicts'>
                <AlertTriangle className='h-4 w-4 mr-2' />
                Conflicts
              </TabsTrigger>
            </TabsList>

            <TabsContent value='calendar' className='space-y-4'>
              {/* Filters Section */}
              {showFilters && (
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <Filter className='h-5 w-5' />
                      Filter Options
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FiltersComponent
                      filters={filters}
                      onFiltersChange={handleFiltersChange}
                      viewMode='admin'
                    />
                  </CardContent>
                </Card>
              )}

              {/* Calendar Section */}
              {showCalendar && (
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <Calendar className='h-5 w-5' />
                      Faculty Calendar View
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FacultyCalendar viewMode='admin' filters={filters} />
                  </CardContent>
                </Card>
              )}

              {/* Show message when no filters applied */}
              {!showCalendar && !showFilters && (
                <Card>
                  <CardContent className='py-12'>
                    <div className='text-center'>
                      <Filter className='h-12 w-12 text-gray-400 mx-auto mb-4' />
                      <h3 className='text-lg font-semibold text-gray-900 mb-2'>
                        Apply Filters to View Calendar
                      </h3>
                      <p className='text-gray-600 mb-4'>
                        Use the filters above to select institutions,
                        departments, and faculty to view their calendars.
                      </p>
                      <Button onClick={() => setShowFilters(true)}>
                        <Filter className='h-4 w-4 mr-2' />
                        Show Filters
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value='availability' className='space-y-4'>
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <Users className='h-5 w-5' />
                    Faculty Availability Matrix
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AvailabilityEmptyState
                    hasFilters={showCalendar}
                    onShowFilters={() => {
                      setActiveTab('calendar');
                      setShowFilters(true);
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='workload' className='space-y-4'>
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <BarChart3 className='h-5 w-5' />
                    Faculty Workload Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <WorkloadEmptyState
                    hasFilters={showCalendar}
                    onShowFilters={() => {
                      setActiveTab('calendar');
                      setShowFilters(true);
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value='conflicts' className='space-y-4'>
              <Card>
                <CardHeader>
                  <CardTitle className='flex items-center gap-2'>
                    <AlertTriangle className='h-5 w-5' />
                    Scheduling Conflicts
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ConflictsEmptyState
                    hasFilters={showCalendar}
                    conflictCount={stats.conflicts}
                    onShowFilters={() => {
                      setActiveTab('calendar');
                      setShowFilters(true);
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

// Empty state components for tabs that require filters

function AvailabilityEmptyState({
  hasFilters,
  onShowFilters
}: {
  hasFilters: boolean;
  onShowFilters: () => void;
}) {
  if (!hasFilters) {
    return (
      <div className='flex flex-col items-center justify-center py-10 text-center'>
        <Search className='h-10 w-10 text-muted-foreground/50 mb-3' />
        <h3 className='font-medium text-foreground'>
          No Filters Applied
        </h3>
        <p className='text-sm text-muted-foreground mt-1 max-w-sm'>
          Apply filters in the Calendar View tab to select an institution and
          department, then check faculty availability here.
        </p>
        <Button variant='outline' className='mt-4' onClick={onShowFilters}>
          <Filter className='h-4 w-4 mr-2' />
          Go to Filters
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-col items-center justify-center py-10 text-center'>
      <Users className='h-10 w-10 text-muted-foreground/50 mb-3' />
      <h3 className='font-medium text-foreground'>
        No Availability Data Found
      </h3>
      <p className='text-sm text-muted-foreground mt-1 max-w-sm'>
        No faculty availability data was found for the selected filters. Try
        adjusting your institution, department, or date range selection.
      </p>
    </div>
  );
}

function WorkloadEmptyState({
  hasFilters,
  onShowFilters
}: {
  hasFilters: boolean;
  onShowFilters: () => void;
}) {
  if (!hasFilters) {
    return (
      <div className='flex flex-col items-center justify-center py-10 text-center'>
        <Search className='h-10 w-10 text-muted-foreground/50 mb-3' />
        <h3 className='font-medium text-foreground'>
          No Filters Applied
        </h3>
        <p className='text-sm text-muted-foreground mt-1 max-w-sm'>
          Apply filters in the Calendar View tab to select an institution and
          department, then view workload analysis here.
        </p>
        <Button variant='outline' className='mt-4' onClick={onShowFilters}>
          <Filter className='h-4 w-4 mr-2' />
          Go to Filters
        </Button>
      </div>
    );
  }

  return (
    <div className='flex flex-col items-center justify-center py-10 text-center'>
      <BarChart3 className='h-10 w-10 text-muted-foreground/50 mb-3' />
      <h3 className='font-medium text-foreground'>
        No Workload Data Found
      </h3>
      <p className='text-sm text-muted-foreground mt-1 max-w-sm'>
        No workload data was found for the selected filters. Try adjusting your
        institution, department, or date range selection.
      </p>
    </div>
  );
}

function ConflictsEmptyState({
  hasFilters,
  conflictCount,
  onShowFilters
}: {
  hasFilters: boolean;
  conflictCount: number;
  onShowFilters: () => void;
}) {
  if (!hasFilters) {
    return (
      <div className='flex flex-col items-center justify-center py-10 text-center'>
        <Search className='h-10 w-10 text-muted-foreground/50 mb-3' />
        <h3 className='font-medium text-foreground'>
          No Filters Applied
        </h3>
        <p className='text-sm text-muted-foreground mt-1 max-w-sm'>
          Apply filters in the Calendar View tab to select an institution and
          department, then check for scheduling conflicts here.
        </p>
        <Button variant='outline' className='mt-4' onClick={onShowFilters}>
          <Filter className='h-4 w-4 mr-2' />
          Go to Filters
        </Button>
      </div>
    );
  }

  if (conflictCount === 0) {
    return (
      <div className='flex flex-col items-center justify-center py-10 text-center'>
        <AlertTriangle className='h-10 w-10 text-green-500/50 mb-3' />
        <h3 className='font-medium text-foreground'>
          No Scheduling Conflicts
        </h3>
        <p className='text-sm text-muted-foreground mt-1 max-w-sm'>
          No scheduling overlaps or double-bookings were detected for the
          selected filters. All faculty assignments appear conflict-free.
        </p>
      </div>
    );
  }

  return (
    <div className='flex flex-col items-center justify-center py-10 text-center'>
      <AlertTriangle className='h-10 w-10 text-red-500/50 mb-3' />
      <h3 className='font-medium text-foreground'>
        {conflictCount} Conflict{conflictCount !== 1 ? 's' : ''} Detected
      </h3>
      <p className='text-sm text-muted-foreground mt-1 max-w-sm'>
        Scheduling overlaps were detected for the selected filters. Review the
        calendar view for details on affected time slots and faculty members.
      </p>
    </div>
  );
}
