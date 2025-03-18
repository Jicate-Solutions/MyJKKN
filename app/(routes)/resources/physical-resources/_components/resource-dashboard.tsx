'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Building2,
  Calendar,
  ClipboardList,
  FileBarChart,
  FolderTree,
  Settings,
  AlertCircle,
  CheckCircle2,
  Clock,
  Car,
  Building,
  Briefcase,
  BarChart4,
  Percent
} from 'lucide-react';
import { useResources } from '@/hooks/resource/physical/use-resources';
import { useReservations } from '@/hooks/resource/physical/use-reservations';
import { useResourceRequests } from '@/hooks/resource/physical/use-resource-requests';
import { useResourceCategories } from '@/hooks/resource/physical/use-resource-categories';
import { useSharingPolicies } from '@/hooks/resource/physical/use-sharing-policies';
import { useUsageReports } from '@/hooks/resource/physical/use-usage-reports';

export function ResourceDashboard() {
  // Fetch data for statistics
  const { resources, loading: resourcesLoading } = useResources({ limit: 100 });
  const { reservations, loading: reservationsLoading } = useReservations({
    limit: 100
  });
  const { requests, loading: requestsLoading } = useResourceRequests({
    limit: 100
  });
  const { categories, loading: categoriesLoading } = useResourceCategories({
    limit: 100
  });
  const { policies, loading: policiesLoading } = useSharingPolicies({
    limit: 100
  });
  const { reports, loading: reportsLoading } = useUsageReports({ limit: 100 });

  // Calculate statistics
  const resourceStats = {
    total: resources.length,
    active: resources.filter((r) => r.is_active).length,
    equipment: resources.filter((r) => r.resource_type === 'equipment').length,
    facility: resources.filter((r) => r.resource_type === 'facility').length,
    vehicle: resources.filter((r) => r.resource_type === 'vehicle').length,
    other: resources.filter((r) => r.resource_type === 'other').length,
    shareable: resources.filter((r) => r.is_shareable).length,
    excellent: resources.filter((r) => r.condition === 'excellent').length,
    good: resources.filter((r) => r.condition === 'good').length,
    fair: resources.filter((r) => r.condition === 'fair').length,
    poor: resources.filter((r) => r.condition === 'poor').length
  };

  const reservationStats = {
    total: reservations.length,
    pending: reservations.filter((r) => r.status === 'pending').length,
    approved: reservations.filter((r) => r.status === 'approved').length,
    rejected: reservations.filter((r) => r.status === 'rejected').length,
    canceled: reservations.filter((r) => r.status === 'canceled').length,
    completed: reservations.filter((r) => r.status === 'completed').length,
    upcoming: reservations.filter(
      (r) => r.status === 'approved' && new Date(r.start_datetime) > new Date()
    ).length,
    active: reservations.filter(
      (r) =>
        r.status === 'approved' &&
        new Date(r.start_datetime) <= new Date() &&
        new Date(r.end_datetime) >= new Date()
    ).length
  };

  const requestStats = {
    total: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
    acquired: requests.filter((r) => r.status === 'acquired').length,
    highPriority: requests.filter((r) => r.priority === 'high').length,
    mediumPriority: requests.filter((r) => r.priority === 'medium').length,
    lowPriority: requests.filter((r) => r.priority === 'low').length
  };

  // Calculate utilization rate
  const utilizationRate =
    reservations.length > 0 && resources.length > 0
      ? Math.round(
          (reservations.filter(
            (r) => r.status === 'completed' || r.status === 'approved'
          ).length /
            resources.length) *
            100
        )
      : 0;

  // Loading state for statistics
  const isLoading =
    resourcesLoading ||
    reservationsLoading ||
    requestsLoading ||
    categoriesLoading ||
    policiesLoading ||
    reportsLoading;

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-2'>
        <h2 className='text-2xl font-bold'>Resource Management Dashboard</h2>
        <p className='text-muted-foreground'>
          Overview of all resources, reservations, and requests across your
          organization
        </p>
      </div>

      {/* Summary Cards */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        <Card className='bg-blue-50 dark:bg-blue-950/30'>
          <CardContent className='p-4 flex flex-col items-center justify-center'>
            {isLoading ? (
              <Skeleton className='h-12 w-12 rounded-full' />
            ) : (
              <>
                <div className='rounded-full bg-blue-100 dark:bg-blue-900 p-2 mb-2'>
                  <Building2 className='h-6 w-6 text-blue-600 dark:text-blue-400' />
                </div>
                <div className='text-2xl font-bold'>{resourceStats.total}</div>
                <p className='text-sm text-muted-foreground'>Total Resources</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className='bg-green-50 dark:bg-green-950/30'>
          <CardContent className='p-4 flex flex-col items-center justify-center'>
            {isLoading ? (
              <Skeleton className='h-12 w-12 rounded-full' />
            ) : (
              <>
                <div className='rounded-full bg-green-100 dark:bg-green-900 p-2 mb-2'>
                  <Calendar className='h-6 w-6 text-green-600 dark:text-green-400' />
                </div>
                <div className='text-2xl font-bold'>
                  {reservationStats.total}
                </div>
                <p className='text-sm text-muted-foreground'>
                  Total Reservations
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className='bg-amber-50 dark:bg-amber-950/30'>
          <CardContent className='p-4 flex flex-col items-center justify-center'>
            {isLoading ? (
              <Skeleton className='h-12 w-12 rounded-full' />
            ) : (
              <>
                <div className='rounded-full bg-amber-100 dark:bg-amber-900 p-2 mb-2'>
                  <ClipboardList className='h-6 w-6 text-amber-600 dark:text-amber-400' />
                </div>
                <div className='text-2xl font-bold'>{requestStats.total}</div>
                <p className='text-sm text-muted-foreground'>
                  Resource Requests
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className='bg-purple-50 dark:bg-purple-950/30'>
          <CardContent className='p-4 flex flex-col items-center justify-center'>
            {isLoading ? (
              <Skeleton className='h-12 w-12 rounded-full' />
            ) : (
              <>
                <div className='rounded-full bg-purple-100 dark:bg-purple-900 p-2 mb-2'>
                  <Percent className='h-6 w-6 text-purple-600 dark:text-purple-400' />
                </div>
                <div className='text-2xl font-bold'>{utilizationRate}%</div>
                <p className='text-sm text-muted-foreground'>
                  Utilization Rate
                </p>
              </>
            )}
          </CardContent>
        </Card>
        </div>

      {/* Detailed Statistics */}
      <div className='grid gap-6 md:grid-cols-2 lg:grid-cols-3'>
        {/* Resource Statistics Card */}
        <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-lg font-medium'>
              Resource Overview
                  </CardTitle>
                  <Building2 className='h-5 w-5 text-muted-foreground' />
                </CardHeader>
                <CardContent>
            {isLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-3/4' />
                <Skeleton className='h-4 w-4/5' />
              </div>
            ) : (
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm text-muted-foreground'>
                    Total Resources
                  </span>
                  <span className='text-xl font-bold'>
                    {resourceStats.total}
                  </span>
                </div>
                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center'>
                      <Briefcase className='mr-1 h-4 w-4' />
                      Equipment
                    </span>
                    <span>{resourceStats.equipment}</span>
                  </div>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center'>
                      <Building className='mr-1 h-4 w-4' />
                      Facility
                    </span>
                    <span>{resourceStats.facility}</span>
                  </div>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center'>
                      <Car className='mr-1 h-4 w-4' />
                      Vehicle
                    </span>
                    <span>{resourceStats.vehicle}</span>
                  </div>
                </div>
                <div className='pt-2'>
                  <div className='text-sm text-muted-foreground mb-1'>
                    Resource Condition
                  </div>
                  <div className='space-y-1'>
                    <div className='flex items-center gap-2'>
                      <div className='text-xs w-16'>Excellent</div>
                      <Progress
                        value={
                          (resourceStats.excellent / resourceStats.total) * 100
                        }
                        className='h-2'
                      />
                      <div className='text-xs'>{resourceStats.excellent}</div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <div className='text-xs w-16'>Good</div>
                      <Progress
                        value={(resourceStats.good / resourceStats.total) * 100}
                        className='h-2'
                      />
                      <div className='text-xs'>{resourceStats.good}</div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <div className='text-xs w-16'>Fair</div>
                      <Progress
                        value={(resourceStats.fair / resourceStats.total) * 100}
                        className='h-2'
                      />
                      <div className='text-xs'>{resourceStats.fair}</div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <div className='text-xs w-16'>Poor</div>
                      <Progress
                        value={(resourceStats.poor / resourceStats.total) * 100}
                        className='h-2'
                      />
                      <div className='text-xs'>{resourceStats.poor}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
                </CardContent>
          <CardFooter>
            <Link
              href='/resources/resources'
              className='text-sm text-blue-600 hover:underline w-full text-center'
            >
              View all resources
            </Link>
          </CardFooter>
              </Card>

        {/* Reservation Statistics Card */}
        <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-lg font-medium'>
              Reservation Status
                  </CardTitle>
                  <Calendar className='h-5 w-5 text-muted-foreground' />
                </CardHeader>
                <CardContent>
            {isLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-3/4' />
                <Skeleton className='h-4 w-4/5' />
              </div>
            ) : (
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm text-muted-foreground'>
                    Total Reservations
                  </span>
                  <span className='text-xl font-bold'>
                    {reservationStats.total}
                  </span>
                </div>
                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center'>
                      <Clock className='mr-1 h-4 w-4 text-amber-500' />
                      Pending
                    </span>
                    <span>{reservationStats.pending}</span>
                  </div>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center'>
                      <CheckCircle2 className='mr-1 h-4 w-4 text-green-500' />
                      Approved
                    </span>
                    <span>{reservationStats.approved}</span>
                  </div>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center'>
                      <AlertCircle className='mr-1 h-4 w-4 text-red-500' />
                      Rejected
                    </span>
                    <span>{reservationStats.rejected}</span>
                  </div>
                </div>
                <div className='pt-2'>
                  <div className='text-sm text-muted-foreground mb-1'>
                    Current Activity
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <Card className='p-2 bg-muted/50'>
                      <div className='text-xs text-muted-foreground'>
                        Active Now
                      </div>
                      <div className='text-lg font-semibold'>
                        {reservationStats.active}
                      </div>
                    </Card>
                    <Card className='p-2 bg-muted/50'>
                      <div className='text-xs text-muted-foreground'>
                        Upcoming
                      </div>
                      <div className='text-lg font-semibold'>
                        {reservationStats.upcoming}
                      </div>
              </Card>
                  </div>
                </div>
              </div>
            )}
                </CardContent>
          <CardFooter>
            <Link
              href='/resources/reservations'
              className='text-sm text-blue-600 hover:underline w-full text-center'
            >
              View all reservations
            </Link>
          </CardFooter>
              </Card>

        {/* Request Statistics Card */}
        <Card>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-lg font-medium'>
                    Resource Requests
                  </CardTitle>
                  <ClipboardList className='h-5 w-5 text-muted-foreground' />
                </CardHeader>
                <CardContent>
            {isLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-3/4' />
                <Skeleton className='h-4 w-4/5' />
              </div>
            ) : (
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm text-muted-foreground'>
                    Total Requests
                  </span>
                  <span className='text-xl font-bold'>
                    {requestStats.total}
                  </span>
                </div>
                <div className='space-y-2'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center'>
                      <Clock className='mr-1 h-4 w-4 text-amber-500' />
                      Pending
                    </span>
                    <span>{requestStats.pending}</span>
                  </div>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center'>
                      <CheckCircle2 className='mr-1 h-4 w-4 text-green-500' />
                      Approved
                    </span>
                    <span>{requestStats.approved}</span>
                  </div>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='flex items-center'>
                      <AlertCircle className='mr-1 h-4 w-4 text-red-500' />
                      Rejected
                    </span>
                    <span>{requestStats.rejected}</span>
                  </div>
                </div>
                <div className='pt-2'>
                  <div className='text-sm text-muted-foreground mb-1'>
                    Request Priority
                  </div>
                  <div className='space-y-1'>
                    <div className='flex items-center gap-2'>
                      <div className='text-xs w-16'>High</div>
                      <Progress
                        value={
                          (requestStats.highPriority / requestStats.total) * 100
                        }
                        className='h-2 bg-muted'
                      />
                      <div className='text-xs'>{requestStats.highPriority}</div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <div className='text-xs w-16'>Medium</div>
                      <Progress
                        value={
                          (requestStats.mediumPriority / requestStats.total) *
                          100
                        }
                        className='h-2 bg-muted'
                      />
                      <div className='text-xs'>
                        {requestStats.mediumPriority}
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <div className='text-xs w-16'>Low</div>
                      <Progress
                        value={
                          (requestStats.lowPriority / requestStats.total) * 100
                        }
                        className='h-2 bg-muted'
                      />
                      <div className='text-xs'>{requestStats.lowPriority}</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
                </CardContent>
          <CardFooter>
            <Link
              href='/resources/requests'
              className='text-sm text-blue-600 hover:underline w-full text-center'
            >
              View all requests
            </Link>
          </CardFooter>
        </Card>

        {/* Additional Statistics */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-lg font-medium'>
              Categories & Policies
            </CardTitle>
            <FolderTree className='h-5 w-5 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-3/4' />
              </div>
            ) : (
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm'>Total Categories</span>
                  <span className='font-medium'>{categories.length}</span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-sm'>Active Sharing Policies</span>
                  <span className='font-medium'>
                    {policies.filter((p) => p.is_active).length}
                  </span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-sm'>Shareable Resources</span>
                  <span className='font-medium'>{resourceStats.shareable}</span>
                </div>
                <div className='flex items-center justify-between'>
                  <span className='text-sm'>Generated Reports</span>
                  <span className='font-medium'>{reports.length}</span>
                </div>
          </div>
            )}
          </CardContent>
          <CardFooter className='flex justify-between'>
            <Link
              href='/resources/categories'
              className='text-sm text-blue-600 hover:underline'
            >
              View categories
            </Link>
            <Link
              href='/resources/policies'
              className='text-sm text-blue-600 hover:underline'
            >
              View policies
            </Link>
          </CardFooter>
        </Card>

        {/* Resource Utilization Card */}
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-lg font-medium'>
              Resource Utilization
            </CardTitle>
            <BarChart4 className='h-5 w-5 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className='space-y-2'>
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-3/4' />
              </div>
            ) : (
              <div className='space-y-4'>
                <div className='flex items-center justify-between'>
                  <span className='text-sm'>Utilization Rate</span>
                  <span className='font-medium'>{utilizationRate}%</span>
                </div>
                <Progress value={utilizationRate} className='h-3' />
                <div className='pt-2 space-y-2'>
                  <div className='flex items-center justify-between'>
                    <span className='text-sm'>Completed Reservations</span>
                    <span className='font-medium'>
                      {reservationStats.completed}
                    </span>
                  </div>
                  <div className='flex items-center justify-between'>
                    <span className='text-sm'>Active Resources</span>
                    <span className='font-medium'>{resourceStats.active}</span>
          </div>
                  <div className='flex items-center justify-between'>
                    <span className='text-sm'>Inactive Resources</span>
                    <span className='font-medium'>
                      {resourceStats.total - resourceStats.active}
                    </span>
          </div>
          </div>
          </div>
            )}
          </CardContent>
          <CardFooter>
            <Link
              href='/resources/reports'
              className='text-sm text-blue-600 hover:underline w-full text-center'
            >
              View usage reports
            </Link>
          </CardFooter>
        </Card>
          </div>
    </div>
  );
}
