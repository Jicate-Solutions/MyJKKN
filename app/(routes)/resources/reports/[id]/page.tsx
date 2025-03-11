'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import React from 'react';
import {
  ArrowLeft,
  Download,
  BarChart3,
  PieChart,
  Calendar,
  Users,
  Clock,
  Building,
  Briefcase
} from 'lucide-react';
import { toast } from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentLayout } from '@/components/layout/content-layout';
import { UsageReportService } from '@/lib/services/resource/usage-report-service';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { UsageReport } from '@/types/resources';
import { ExportDropdown } from '../_components/export-dropdown';

interface ReportDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ReportDetailsPage({ params }: ReportDetailsPageProps) {
  const router = useRouter();
  const resolvedParams = React.use(params);
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [institutionNames, setInstitutionNames] = useState<
    Record<string, string>
  >({});
  const [departmentNames, setDepartmentNames] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const fetchReport = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await UsageReportService.getUsageReport(resolvedParams.id);
        setReport(data);

        // Fetch institution names
        if (data && data.usage_by_institution) {
          const institutionIds = Object.keys(data.usage_by_institution);
          if (institutionIds.length > 0) {
            try {
              const institutions =
                await OrganizationService.getInstitutionNames();
              const namesMap: Record<string, string> = {};
              institutions.forEach((inst) => {
                namesMap[inst.id] = inst.name;
              });
              setInstitutionNames(namesMap);
            } catch (err) {
              console.error('Error fetching institution names:', err);
              // Continue even if we can't fetch institution names
            }
          }
        }

        // Fetch department names
        if (data && data.usage_by_department) {
          const departmentIds = Object.keys(data.usage_by_department);
          if (departmentIds.length > 0) {
            try {
              const departmentsResult = await DepartmentService.getDepartments({
                limit: 1000 // Get a large number to ensure we get all departments
              });
              const departments = departmentsResult.data;
              const deptNamesMap: Record<string, string> = {};
              departments.forEach((dept) => {
                deptNamesMap[dept.id] = dept.department_name;
              });
              setDepartmentNames(deptNamesMap);
            } catch (err) {
              console.error('Error fetching department names:', err);
              // Continue even if we can't fetch department names
            }
          }
        }
      } catch (err) {
        console.error('Error fetching report:', err);
        setError('Failed to load report details');
        toast.error('Failed to load report details');
      } finally {
        setLoading(false);
      }
    };

    fetchReport();
  }, [resolvedParams.id]);

  const formatDate = (date: string) => {
    return format(new Date(date), 'MMMM d, yyyy');
  };

  if (loading) {
    return (
      <ContentLayout title='Report Details'>
        <div className='flex h-[600px] items-center justify-center'>
          <div className='text-center'>
            <div className='animate-spin h-8 w-8 border-t-2 border-primary rounded-full mx-auto mb-4'></div>
            <p className='text-muted-foreground'>Loading report details...</p>
          </div>
        </div>
      </ContentLayout>
    );
  }

  if (error || !report) {
    return (
      <ContentLayout title='Report Details'>
        <div className='flex h-[600px] items-center justify-center'>
          <div className='text-center'>
            <p className='text-destructive mb-4'>
              {error || 'Report not found'}
            </p>
            <Button asChild>
              <Link href='/resources/reports'>Back to Reports</Link>
            </Button>
          </div>
        </div>
      </ContentLayout>
    );
  }

  // Get top institutions by usage
  const topInstitutions = Object.entries(report?.usage_by_institution || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Get top departments by usage
  const topDepartments = Object.entries(report?.usage_by_department || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Get peak usage times
  const peakTimes = Object.entries(report?.peak_usage_times || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const reportTitle = report.resource?.resource_name || 'Unknown Resource';

  return (
    <ContentLayout title={`Usage Report: ${reportTitle}`}>
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
              <Link href='/resources'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/reports'>Usage Reports</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{reportTitle}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>{reportTitle}</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Report for period: {formatDate(report.start_date)} -{' '}
              {formatDate(report.end_date)}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' className='h-9 gap-1' asChild>
              <Link href='/resources/reports'>
                <ArrowLeft className='h-4 w-4' />
                <span>Back to Reports</span>
              </Link>
            </Button>
            <ExportDropdown reports={[]} singleReport={report} />
          </div>
        </div>

        <div className='grid grid-cols-1 gap-6 md:grid-cols-4'>
          <Card className='md:col-span-1'>
            <CardHeader>
              <CardTitle>Report Summary</CardTitle>
              <CardDescription>Key metrics for this report</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                <div className='flex items-center gap-3'>
                  <Calendar className='h-5 w-5 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-medium'>Report Period</p>
                    <p className='text-sm text-muted-foreground'>
                      {formatDate(report.start_date)} -{' '}
                      {formatDate(report.end_date)}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className='flex items-center gap-3'>
                  <BarChart3 className='h-5 w-5 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-medium'>Utilization Rate</p>
                    <p className='text-sm text-muted-foreground'>
                      {report.metrics.utilization_percentage.toFixed(1)}%
                    </p>
                  </div>
                </div>

                <Separator />

                <div className='flex items-center gap-3'>
                  <Clock className='h-5 w-5 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-medium'>Total Hours Used</p>
                    <p className='text-sm text-muted-foreground'>
                      {report.metrics.total_hours_used.toFixed(1)} hours
                    </p>
                  </div>
                </div>

                <Separator />

                <div className='flex items-center gap-3'>
                  <Users className='h-5 w-5 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-medium'>Unique Users</p>
                    <p className='text-sm text-muted-foreground'>
                      {report.metrics.unique_users} users
                    </p>
                  </div>
                </div>

                <Separator />

                <div className='flex items-center gap-3'>
                  <Building className='h-5 w-5 text-muted-foreground' />
                  <div>
                    <p className='text-sm font-medium'>
                      Cross-Institution Usage
                    </p>
                    <p className='text-sm text-muted-foreground'>
                      {report.metrics.cross_institution_usage || 0}%
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className='md:col-span-3'>
            <CardHeader>
              <CardTitle>Detailed Analysis</CardTitle>
              <CardDescription>
                Detailed breakdown of resource usage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue='usage'>
                <TabsList className='mb-6'>
                  <TabsTrigger value='usage'>Usage Metrics</TabsTrigger>
                  <TabsTrigger value='institutions'>
                    Institution Usage
                  </TabsTrigger>
                  <TabsTrigger value='departments'>
                    Department Usage
                  </TabsTrigger>
                  <TabsTrigger value='peak'>Peak Usage Times</TabsTrigger>
                </TabsList>

                <TabsContent value='usage' className='space-y-6'>
                  <div className='grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3'>
                    <Card>
                      <CardHeader className='pb-2'>
                        <CardTitle className='text-base'>
                          Utilization Rate
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className='text-3xl font-bold'>
                          {report.metrics.utilization_percentage.toFixed(1)}%
                        </div>
                        <p className='text-sm text-muted-foreground mt-1'>
                          Of available time
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className='pb-2'>
                        <CardTitle className='text-base'>
                          Total Reservations
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className='text-3xl font-bold'>
                          {report.metrics.reservation_count}
                        </div>
                        <p className='text-sm text-muted-foreground mt-1'>
                          During report period
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className='pb-2'>
                        <CardTitle className='text-base'>
                          Unique Users
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className='text-3xl font-bold'>
                          {report.metrics.unique_users}
                        </div>
                        <p className='text-sm text-muted-foreground mt-1'>
                          Used this resource
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className='text-base'>Usage Trend</CardTitle>
                      <CardDescription>
                        Resource usage over the report period
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='h-[300px] flex items-center justify-center'>
                      <div className='text-center text-muted-foreground'>
                        <PieChart className='h-12 w-12 mx-auto mb-2 opacity-50' />
                        <p>Usage trend visualization would appear here</p>
                        <p className='text-sm'>
                          (Chart implementation required)
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value='institutions' className='space-y-6'>
                  <Card>
                    <CardHeader>
                      <CardTitle className='text-base'>
                        Top Institutions by Usage
                      </CardTitle>
                      <CardDescription>
                        Institutions with the highest resource usage
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {topInstitutions.length > 0 ? (
                        <div className='space-y-4'>
                          {topInstitutions.map(
                            ([institutionId, hours], index) => (
                              <div
                                key={institutionId}
                                className='flex items-center justify-between'
                              >
                                <div className='flex items-center gap-2'>
                                  <div className='flex h-8 w-8 items-center justify-center rounded-full bg-primary/10'>
                                    {index + 1}
                                  </div>
                                  <span>
                                    {institutionNames[institutionId] ||
                                      `Institution ${institutionId.substring(
                                        0,
                                        8
                                      )}...`}
                                  </span>
                                </div>
                                <span className='font-medium'>
                                  {hours.toFixed(1)} hours
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <div className='text-center py-8 text-muted-foreground'>
                          <p>No institution usage data available</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className='text-base'>
                        Institution Distribution
                      </CardTitle>
                      <CardDescription>
                        Usage distribution across institutions
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='h-[300px] flex items-center justify-center'>
                      <div className='text-center text-muted-foreground'>
                        <PieChart className='h-12 w-12 mx-auto mb-2 opacity-50' />
                        <p>Institution distribution chart would appear here</p>
                        <p className='text-sm'>
                          (Chart implementation required)
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value='departments' className='space-y-6'>
                  <Card>
                    <CardHeader>
                      <CardTitle className='text-base'>
                        Top Departments by Usage
                      </CardTitle>
                      <CardDescription>
                        Departments with the highest resource usage
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {topDepartments.length > 0 ? (
                        <div className='space-y-4'>
                          {topDepartments.map(
                            ([departmentId, hours], index) => (
                              <div
                                key={departmentId}
                                className='flex items-center justify-between'
                              >
                                <div className='flex items-center gap-2'>
                                  <div className='flex h-8 w-8 items-center justify-center rounded-full bg-primary/10'>
                                    {index + 1}
                                  </div>
                                  <span>
                                    {departmentNames[departmentId] ||
                                      `Department ${departmentId.substring(
                                        0,
                                        8
                                      )}...`}
                                  </span>
                                </div>
                                <span className='font-medium'>
                                  {hours.toFixed(1)} hours
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      ) : (
                        <div className='text-center py-8 text-muted-foreground'>
                          <p>No department usage data available</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className='text-base'>
                        Department Distribution
                      </CardTitle>
                      <CardDescription>
                        Usage distribution across departments
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='h-[300px] flex items-center justify-center'>
                      <div className='text-center text-muted-foreground'>
                        <PieChart className='h-12 w-12 mx-auto mb-2 opacity-50' />
                        <p>Department distribution chart would appear here</p>
                        <p className='text-sm'>
                          (Chart implementation required)
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value='peak' className='space-y-6'>
                  <Card>
                    <CardHeader>
                      <CardTitle className='text-base'>
                        Peak Usage Times
                      </CardTitle>
                      <CardDescription>
                        Times with highest resource utilization
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {peakTimes.length > 0 ? (
                        <div className='space-y-4'>
                          {peakTimes.map(([timeSlot, hours], index) => (
                            <div
                              key={timeSlot}
                              className='flex items-center justify-between'
                            >
                              <div className='flex items-center gap-2'>
                                <div className='flex h-8 w-8 items-center justify-center rounded-full bg-primary/10'>
                                  {index + 1}
                                </div>
                                <span>{timeSlot}</span>
                              </div>
                              <span className='font-medium'>
                                {hours.toFixed(1)} hours
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className='text-center py-8 text-muted-foreground'>
                          <p>No peak usage data available</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className='text-base'>
                        Usage by Time of Day
                      </CardTitle>
                      <CardDescription>
                        Resource usage distribution across different times
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='h-[300px] flex items-center justify-center'>
                      <div className='text-center text-muted-foreground'>
                        <BarChart3 className='h-12 w-12 mx-auto mb-2 opacity-50' />
                        <p>Time of day usage chart would appear here</p>
                        <p className='text-sm'>
                          (Chart implementation required)
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </ContentLayout>
  );
}
