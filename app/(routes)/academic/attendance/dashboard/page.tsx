'use client';

import { Suspense, useState, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { StatisticsCards } from './_components/statistics-cards';
import { PendingAttendanceDataTable } from './_components/pending-attendance-data-table';
import { createClientSupabaseClient } from '@/lib/supabase/client';

interface Institution {
  id: string;
  name: string;
}

function AttendanceDashboardContent() {
  const { profile } = useAuth();
  const { canAccess } = usePermissions();
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [loading, setLoading] = useState(true);

  // Check if user can view all institutions
  const canViewAllInstitutions = canAccess(
    'academic.attendance.dashboard',
    'view_all_institutions'
  );

  // Fetch institutions for super admin
  useEffect(() => {
    async function fetchInstitutions() {
      if (!canViewAllInstitutions) {
        setLoading(false);
        return;
      }

      try {
        const supabase = createClientSupabaseClient();
        const { data, error } = await supabase
          .from('institutions')
          .select('id, name')
          .eq('is_active', true)
          .order('name');

        if (error) {
          console.error('Error fetching institutions:', error);
        } else {
          setInstitutions(data || []);
        }
      } catch (error) {
        console.error('Error fetching institutions:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchInstitutions();
  }, [canViewAllInstitutions]);

  if (loading) {
    return (
      <ContentLayout title='Attendance Dashboard'>
        <div className='space-y-6'>
          <Skeleton className='h-6 w-48' />
          <Skeleton className='h-32 w-full' />
          <Skeleton className='h-64 w-full' />
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Attendance Dashboard'>
      <div className='space-y-6'>
        {/* Breadcrumb */}
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
              <BreadcrumbLink asChild>
                <Link href='/academic/attendance'>Attendance</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header with Institution Filter for Super Admin */}
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight'>
              Attendance Dashboard
            </h1>
            <p className='text-muted-foreground'>
              Real-time overview of today&apos;s attendance statistics and
              pending periods
            </p>
          </div>

          {canViewAllInstitutions && institutions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant='outline' className='gap-2'>
                  All Institutions
                  <ChevronDown className='h-4 w-4' />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-56'>
                <DropdownMenuItem>All Institutions</DropdownMenuItem>
                {institutions.map((institution) => (
                  <DropdownMenuItem key={institution.id}>
                    {institution.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="statistics" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="statistics">Today&apos;s Statistics</TabsTrigger>
            <TabsTrigger value="pending">Pending Attendance</TabsTrigger>
          </TabsList>

          <TabsContent value="statistics" className="space-y-4">
            <div>
              <h2 className='text-xl font-semibold mb-4'>
                Today&apos;s Attendance Statistics
              </h2>
              <p className='text-muted-foreground mb-6'>
                Real-time overview of today&apos;s attendance statistics across institutions, departments, and sections.
              </p>
              <Suspense fallback={<StatisticsCardsSkeleton />}>
                <StatisticsCards
                  userInstitutionId={profile?.institution_id || undefined}
                  canViewAllInstitutions={canViewAllInstitutions}
                  institutions={institutions}
                />
              </Suspense>
            </div>
          </TabsContent>

          <TabsContent value="pending" className="space-y-4">
            <div>
              <h2 className='text-xl font-semibold mb-4'>Pending Attendance</h2>
              <p className='text-muted-foreground mb-6'>
                Periods scheduled for today that haven&apos;t been marked yet. Take action to ensure complete attendance tracking.
              </p>
              <Card>
                <CardHeader>
                  <CardTitle>Unmarked Periods</CardTitle>
                  <CardDescription>
                    Periods scheduled for today that require attendance marking
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Suspense fallback={<PendingAttendanceTableSkeleton />}>
                    <PendingAttendanceDataTable
                      userInstitutionId={profile?.institution_id || undefined}
                      canViewAllInstitutions={canViewAllInstitutions}
                    />
                  </Suspense>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}

// Loading Skeletons
function StatisticsCardsSkeleton() {
  return (
    <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <Skeleton className='h-4 w-20' />
            <Skeleton className='h-4 w-4' />
          </CardHeader>
          <CardContent>
            <Skeleton className='h-7 w-16 mb-1' />
            <Skeleton className='h-3 w-24' />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PendingAttendanceTableSkeleton() {
  return (
    <div className='space-y-4'>
      {/* Filters */}
      <div className='flex items-center gap-4'>
        <Skeleton className='h-9 w-48' />
        <Skeleton className='h-9 w-36' />
        <Skeleton className='h-9 w-32' />
      </div>

      {/* Table */}
      <div className='space-y-2'>
        <Skeleton className='h-10 w-full' />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className='h-12 w-full' />
        ))}
      </div>

      {/* Pagination */}
      <div className='flex items-center justify-between'>
        <Skeleton className='h-4 w-32' />
        <div className='flex items-center space-x-2'>
          <Skeleton className='h-8 w-20' />
          <Skeleton className='h-8 w-8' />
          <Skeleton className='h-8 w-8' />
          <Skeleton className='h-8 w-20' />
        </div>
      </div>
    </div>
  );
}

export default function AttendanceDashboardPage() {
  return (
    <PermissionGuard module='academic.attendance.dashboard' action='view'>
      <AttendanceDashboardContent />
    </PermissionGuard>
  );
}
