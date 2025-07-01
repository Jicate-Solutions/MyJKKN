'use client';

import { useState, useMemo } from 'react';
import { format, subDays } from 'date-fns';
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  GraduationCap,
  Building,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  BarChart3,
  PieChart,
  MapPin,
  CheckCircle
} from 'lucide-react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useStudentDashboardStats } from '@/hooks/student/use-students';
import { DashboardFilters } from '@/types/student';

// Import dashboard components
import { RegistrationTrends } from './_components/registration-trends';
import { InstitutionDistribution } from './_components/institution-distribution';
import { DepartmentDistribution } from './_components/department-distribution';
import { ProgramDistribution } from './_components/program-distribution';
import { SemesterDistribution } from './_components/semester-distribution';
import { SectionDistribution } from './_components/section-distribution';
import { OverviewStats } from './_components/overview-stats';
import { DemographicAnalytics } from './_components/demographic-analytics';
import { GeographicDistribution } from './_components/geographic-distribution';
import { OnboardingFunnel } from './_components/onboarding-funnel';
import { DashboardFiltersPanel } from './_components/dashboard-filters';
import { ProfileCompletionStats } from './_components/profile-completion-stats';

export default function StudentDashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>({
    dateRange: {
      from: subDays(new Date(), 30),
      to: new Date()
    }
  });

  const {
    data: dashboardStats,
    isLoading,
    error,
    refetch
  } = useStudentDashboardStats(filters);

  const handleFilterChange = (newFilters: DashboardFilters) => {
    setFilters(newFilters);
  };

  const handleRefresh = async () => {
    await refetch();
  };

  const breadcrumbItems = [
    { label: 'Students', href: '/students' },
    { label: 'Analytics Dashboard', href: '/students/dashboard' }
  ];

  if (error) {
    return (
      <ContentLayout title='Student Analytics Dashboard'>
        <PageBreadcrumb items={breadcrumbItems} />
        <div className='flex items-center justify-center h-64'>
          <div className='text-center'>
            <div className='text-red-500 mb-4'>
              <BarChart3 className='h-12 w-12 mx-auto' />
            </div>
            <h3 className='text-lg font-semibold mb-2'>
              Failed to Load Dashboard
            </h3>
            <p className='text-muted-foreground mb-4'>
              There was an error loading the dashboard data.
            </p>
            <Button onClick={handleRefresh} variant='outline'>
              <RefreshCw className='h-4 w-4 mr-2' />
              Try Again
            </Button>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Student Analytics Dashboard'>
      <div className='space-y-6'>
        {/* Header */}
        <div>
          <PageBreadcrumb items={breadcrumbItems} />
          <div className='flex items-center justify-between mt-4'>
            <div>
              <h1 className='text-2xl font-bold tracking-tight'>
                Student Analytics Dashboard
              </h1>
              <p className='text-muted-foreground'>
                Comprehensive insights into student enrollment, demographics,
                and onboarding
              </p>
            </div>
            <div className='flex items-center gap-2'>
              <Button
                variant='outline'
                size='sm'
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>
              <Button variant='outline' size='sm'>
                <Download className='h-4 w-4 mr-2' />
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* Filters */}
        <DashboardFiltersPanel
          filters={filters}
          onFiltersChange={handleFilterChange}
          isLoading={isLoading}
        />

        {/* Main Dashboard Content */}
        <Tabs defaultValue='overview' className='space-y-6'>
          <TabsList className='grid w-full grid-cols-6'>
            <TabsTrigger value='overview' className='flex items-center gap-2'>
              <BarChart3 className='h-4 w-4' />
              Overview
            </TabsTrigger>
            <TabsTrigger
              value='organizational'
              className='flex items-center gap-2'
            >
              <Building className='h-4 w-4' />
              Organizational
            </TabsTrigger>
            <TabsTrigger
              value='demographics'
              className='flex items-center gap-2'
            >
              <Users className='h-4 w-4' />
              Demographics
            </TabsTrigger>
            <TabsTrigger value='geographic' className='flex items-center gap-2'>
              <MapPin className='h-4 w-4' />
              Geographic
            </TabsTrigger>
            <TabsTrigger value='onboarding' className='flex items-center gap-2'>
              <CheckCircle className='h-4 w-4' />
              Onboarding
            </TabsTrigger>
            <TabsTrigger value='trends' className='flex items-center gap-2'>
              <TrendingUp className='h-4 w-4' />
              Trends
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value='overview' className='space-y-6'>
            <OverviewStats
              data={dashboardStats?.overview}
              isLoading={isLoading}
            />
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              <RegistrationTrends
                data={dashboardStats?.registrationTrends}
                isLoading={isLoading}
              />
              <ProfileCompletionStats
                data={dashboardStats?.overview}
                isLoading={isLoading}
              />
            </div>
          </TabsContent>

          {/* Organizational Tab */}
          <TabsContent value='organizational' className='space-y-6'>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              <InstitutionDistribution
                data={dashboardStats?.institutionStats}
                isLoading={isLoading}
              />
              <DepartmentDistribution
                data={dashboardStats?.departmentStats}
                isLoading={isLoading}
              />
            </div>
            <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
              <ProgramDistribution
                data={dashboardStats?.programStats}
                isLoading={isLoading}
              />
              <SemesterDistribution
                data={dashboardStats?.semesterStats}
                isLoading={isLoading}
              />
            </div>
            <SectionDistribution
              data={dashboardStats?.sectionStats}
              isLoading={isLoading}
            />
          </TabsContent>

          {/* Demographics Tab */}
          <TabsContent value='demographics' className='space-y-6'>
            <DemographicAnalytics
              data={dashboardStats?.demographicStats}
              isLoading={isLoading}
            />
          </TabsContent>

          {/* Geographic Tab */}
          <TabsContent value='geographic' className='space-y-6'>
            <GeographicDistribution
              data={dashboardStats?.geographicStats}
              isLoading={isLoading}
            />
          </TabsContent>

          {/* Onboarding Tab */}
          <TabsContent value='onboarding' className='space-y-8'>
            {/* Header Section */}
            <div className='flex items-center justify-between'>
              <div>
                <h2 className='text-3xl font-bold tracking-tight'>
                  Student Onboarding Analytics
                </h2>
                <p className='text-muted-foreground mt-1'>
                  Comprehensive analysis of student profile completion and
                  onboarding effectiveness
                </p>
              </div>
              <div className='flex items-center gap-3'>
                <Badge variant='outline' className='text-sm px-3 py-1'>
                  <Clock className='h-4 w-4 mr-1' />
                  Real-time Data
                </Badge>
                <Button variant='outline' size='sm'>
                  <Download className='h-4 w-4 mr-2' />
                  Export Report
                </Button>
              </div>
            </div>

            {/* Key Metrics Overview */}
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6'>
              <Card className='bg-gradient-to-br from-green-50 to-green-100 border-green-200'>
                <CardContent className='p-6'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <p className='text-sm font-medium text-green-700 mb-1'>
                        Completion Rate
                      </p>
                      <p className='text-3xl font-bold text-green-800'>
                        {dashboardStats?.overview?.profileCompletionRate?.toFixed(
                          1
                        ) || '0.0'}
                        %
                      </p>
                      <p className='text-xs text-green-600 mt-1'>
                        {dashboardStats?.overview?.completeProfiles?.toLocaleString() ||
                          '0'}{' '}
                        completed profiles
                      </p>
                    </div>
                    <div className='p-3 bg-green-200 rounded-full'>
                      <CheckCircle className='h-6 w-6 text-green-700' />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className='bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200'>
                <CardContent className='p-6'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <p className='text-sm font-medium text-blue-700 mb-1'>
                        Active Onboarding
                      </p>
                      <p className='text-3xl font-bold text-blue-800'>
                        {dashboardStats?.overview?.incompleteProfiles?.toLocaleString() ||
                          '0'}
                      </p>
                      <p className='text-xs text-blue-600 mt-1'>
                        Students in progress
                      </p>
                    </div>
                    <div className='p-3 bg-blue-200 rounded-full'>
                      <UserCheck className='h-6 w-6 text-blue-700' />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className='bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200'>
                <CardContent className='p-6'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <p className='text-sm font-medium text-purple-700 mb-1'>
                        Avg. Completion Time
                      </p>
                      <p className='text-3xl font-bold text-purple-800'>
                        {dashboardStats?.onboardingStats?.timeToComplete?.average?.toFixed(
                          1
                        ) || '0.0'}
                      </p>
                      <p className='text-xs text-purple-600 mt-1'>
                        Days to complete
                      </p>
                    </div>
                    <div className='p-3 bg-purple-200 rounded-full'>
                      <Clock className='h-6 w-6 text-purple-700' />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className='bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200'>
                <CardContent className='p-6'>
                  <div className='flex items-center justify-between'>
                    <div>
                      <p className='text-sm font-medium text-orange-700 mb-1'>
                        Total Students
                      </p>
                      <p className='text-3xl font-bold text-orange-800'>
                        {dashboardStats?.overview?.totalStudents?.toLocaleString() ||
                          '0'}
                      </p>
                      <p className='text-xs text-orange-600 mt-1'>
                        All registered students
                      </p>
                    </div>
                    <div className='p-3 bg-orange-200 rounded-full'>
                      <Users className='h-6 w-6 text-orange-700' />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Completion Funnel & Profile Stats Section */}
            <div className='space-y-6'>
              <div className='flex items-center gap-3'>
                <div className='h-8 w-1 bg-primary rounded-full'></div>
                <div>
                  <h3 className='text-xl font-semibold'>
                    Onboarding Process Analysis
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    Detailed analysis of completion funnel and profile
                    statistics
                  </p>
                </div>
              </div>

              <OnboardingFunnel
                data={dashboardStats?.onboardingStats}
                isLoading={isLoading}
              />
            </div>

            <Separator className='my-8' />

            {/* Profile Completion & Effectiveness Section */}
            <div className='space-y-6'>
              <div className='flex items-center gap-3'>
                <div className='h-8 w-1 bg-green-500 rounded-full'></div>
                <div>
                  <h3 className='text-xl font-semibold'>
                    Profile Completion Effectiveness
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    Comprehensive breakdown of profile completion rates and
                    quality metrics
                  </p>
                </div>
              </div>

              <div className='grid grid-cols-1 xl:grid-cols-2 gap-8'>
                <ProfileCompletionStats
                  data={dashboardStats?.overview}
                  isLoading={isLoading}
                />

                {/* Quick Actions Card */}
                <Card className='bg-gradient-to-br from-slate-50 to-slate-100'>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <TrendingUp className='h-5 w-5 text-primary' />
                      Onboarding Optimization
                    </CardTitle>
                    <CardDescription>
                      Quick actions to improve onboarding completion rates
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-4'>
                    <div className='space-y-3'>
                      <div className='flex items-start gap-3 p-3 bg-background rounded-lg border'>
                        <div className='p-2 bg-blue-100 rounded-lg'>
                          <CheckCircle className='h-4 w-4 text-blue-600' />
                        </div>
                        <div className='flex-1'>
                          <h4 className='font-medium text-sm'>
                            Send Reminder Emails
                          </h4>
                          <p className='text-xs text-muted-foreground mt-1'>
                            Automatically remind students with incomplete
                            profiles
                          </p>
                          <Button size='sm' variant='outline' className='mt-2'>
                            Configure Reminders
                          </Button>
                        </div>
                      </div>

                      <div className='flex items-start gap-3 p-3 bg-background rounded-lg border'>
                        <div className='p-2 bg-green-100 rounded-lg'>
                          <BarChart3 className='h-4 w-4 text-green-600' />
                        </div>
                        <div className='flex-1'>
                          <h4 className='font-medium text-sm'>
                            Optimize Form Fields
                          </h4>
                          <p className='text-xs text-muted-foreground mt-1'>
                            Simplify forms based on completion analytics
                          </p>
                          <Button size='sm' variant='outline' className='mt-2'>
                            View Recommendations
                          </Button>
                        </div>
                      </div>

                      <div className='flex items-start gap-3 p-3 bg-background rounded-lg border'>
                        <div className='p-2 bg-purple-100 rounded-lg'>
                          <Users className='h-4 w-4 text-purple-600' />
                        </div>
                        <div className='flex-1'>
                          <h4 className='font-medium text-sm'>
                            Support Outreach
                          </h4>
                          <p className='text-xs text-muted-foreground mt-1'>
                            Contact students stuck in onboarding process
                          </p>
                          <Button size='sm' variant='outline' className='mt-2'>
                            Generate Contact List
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <Separator className='my-8' />

            {/* Performance Insights Section */}
            <div className='space-y-6'>
              <div className='flex items-center gap-3'>
                <div className='h-8 w-1 bg-blue-500 rounded-full'></div>
                <div>
                  <h3 className='text-xl font-semibold'>
                    Performance Insights & Trends
                  </h3>
                  <p className='text-sm text-muted-foreground'>
                    Historical trends and patterns in student onboarding
                    behavior
                  </p>
                </div>
              </div>

              <div className='grid grid-cols-1 lg:grid-cols-2 gap-8'>
                <RegistrationTrends
                  data={dashboardStats?.registrationTrends}
                  isLoading={isLoading}
                />

                {/* Onboarding Health Score */}
                <Card>
                  <CardHeader>
                    <CardTitle className='flex items-center gap-2'>
                      <TrendingUp className='h-5 w-5 text-green-600' />
                      Onboarding Health Score
                    </CardTitle>
                    <CardDescription>
                      Overall effectiveness of your onboarding process
                    </CardDescription>
                  </CardHeader>
                  <CardContent className='space-y-6'>
                    {/* Overall Health Score */}
                    <div className='text-center p-6 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200'>
                      <div className='text-4xl font-bold text-green-700 mb-2'>
                        {dashboardStats?.overview?.profileCompletionRate
                          ? Math.round(
                              dashboardStats.overview.profileCompletionRate
                            )
                          : 85}
                      </div>
                      <div className='text-sm font-medium text-green-600 mb-1'>
                        Health Score
                      </div>
                      <div className='text-xs text-green-500'>
                        {dashboardStats?.overview?.profileCompletionRate &&
                        dashboardStats.overview.profileCompletionRate > 80
                          ? 'Excellent'
                          : dashboardStats?.overview?.profileCompletionRate &&
                            dashboardStats.overview.profileCompletionRate > 60
                          ? 'Good'
                          : 'Needs Improvement'}
                      </div>
                    </div>

                    {/* Health Metrics */}
                    <div className='space-y-4'>
                      <div className='flex items-center justify-between p-3 border rounded-lg'>
                        <div className='flex items-center gap-2'>
                          <div className='w-2 h-2 bg-green-500 rounded-full'></div>
                          <span className='text-sm font-medium'>
                            Completion Rate
                          </span>
                        </div>
                        <Badge variant='secondary'>
                          {dashboardStats?.overview?.profileCompletionRate?.toFixed(
                            1
                          ) || '0.0'}
                          %
                        </Badge>
                      </div>

                      <div className='flex items-center justify-between p-3 border rounded-lg'>
                        <div className='flex items-center gap-2'>
                          <div className='w-2 h-2 bg-blue-500 rounded-full'></div>
                          <span className='text-sm font-medium'>
                            Avg. Time to Complete
                          </span>
                        </div>
                        <Badge variant='secondary'>
                          {dashboardStats?.onboardingStats?.timeToComplete?.average?.toFixed(
                            1
                          ) || '0.0'}{' '}
                          days
                        </Badge>
                      </div>

                      <div className='flex items-center justify-between p-3 border rounded-lg'>
                        <div className='flex items-center gap-2'>
                          <div className='w-2 h-2 bg-purple-500 rounded-full'></div>
                          <span className='text-sm font-medium'>
                            Active Students
                          </span>
                        </div>
                        <Badge variant='secondary'>
                          {dashboardStats?.overview?.incompleteProfiles?.toLocaleString() ||
                            '0'}
                        </Badge>
                      </div>
                    </div>

                    {/* Recommendations */}
                    <div className='mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200'>
                      <h4 className='font-medium text-blue-800 mb-2'>
                        💡 Recommendations
                      </h4>
                      <ul className='text-xs text-blue-700 space-y-1'>
                        <li>
                          • Follow up with students after 3 days of inactivity
                        </li>
                        <li>
                          • Simplify mandatory fields to reduce abandonment
                        </li>
                        <li>
                          • Add progress indicators to encourage completion
                        </li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Trends Tab */}
          <TabsContent value='trends' className='space-y-6'>
            <RegistrationTrends
              data={dashboardStats?.registrationTrends}
              isLoading={isLoading}
            />
            {/* Add more trend charts here */}
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
