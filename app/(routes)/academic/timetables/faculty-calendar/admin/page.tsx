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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar,
  Users,
  Filter,
  Download,
  RefreshCw,
  BarChart3,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { usePermissions } from '@/hooks/use-permissions';
import { PermissionGuard } from '@/components/auth/permission-guard';
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

  // We don't need to use the hook here as the FacultyCalendar component handles its own data fetching

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

              <Button variant='outline' size='sm'>
                <RefreshCw className='h-4 w-4 mr-2' />
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
                    <p className='text-2xl font-bold'>--</p>
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
                    <p className='text-2xl font-bold'>--</p>
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
                    <p className='text-2xl font-bold'>--hrs</p>
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
                    <p className='text-2xl font-bold'>--</p>
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
                  <AvailabilityMatrixPlaceholder />
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
                  <WorkloadAnalysisPlaceholder />
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
                  <ConflictsPlaceholder />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

// Placeholder components for other tabs

function AvailabilityMatrixPlaceholder() {
  return (
    <div className='flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg'>
      <div className='text-center'>
        <Users className='h-12 w-12 text-gray-400 mx-auto mb-4' />
        <h3 className='text-lg font-semibold text-gray-900 mb-2'>
          Availability Matrix
        </h3>
        <p className='text-gray-600 mb-4'>
          Real-time faculty availability for scheduling
        </p>
        <Badge variant='secondary'>Coming Soon</Badge>
      </div>
    </div>
  );
}

function WorkloadAnalysisPlaceholder() {
  return (
    <div className='flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg'>
      <div className='text-center'>
        <BarChart3 className='h-12 w-12 text-gray-400 mx-auto mb-4' />
        <h3 className='text-lg font-semibold text-gray-900 mb-2'>
          Workload Distribution
        </h3>
        <p className='text-gray-600 mb-4'>
          Faculty workload analytics and utilization charts
        </p>
        <Badge variant='secondary'>Coming Soon</Badge>
      </div>
    </div>
  );
}

function ConflictsPlaceholder() {
  return (
    <div className='flex items-center justify-center h-64 border-2 border-dashed border-gray-300 rounded-lg'>
      <div className='text-center'>
        <AlertTriangle className='h-12 w-12 text-gray-400 mx-auto mb-4' />
        <h3 className='text-lg font-semibold text-gray-900 mb-2'>
          Conflict Detection
        </h3>
        <p className='text-gray-600 mb-4'>
          Automatic detection and resolution of scheduling conflicts
        </p>
        <Badge variant='secondary'>Coming Soon</Badge>
      </div>
    </div>
  );
}
