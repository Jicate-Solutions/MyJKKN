'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { useStaffDashboardStats } from '@/hooks/staff/use-staff';
import { StaffDashboardFilters } from '@/types/staff';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import { CategoryService } from '@/lib/services/staff/category-service';

// Dashboard Components
import { DashboardFilters } from './_components/dashboard-filters';
import { OverviewStats } from './_components/overview-stats';
import { RegistrationTrends } from './_components/registration-trends';
import { InstitutionDistribution } from './_components/institution-distribution';
import { DepartmentDistribution } from './_components/department-distribution';
import { CategoryDistribution } from './_components/category-distribution';
import { GeographicDistribution } from './_components/geographic-distribution';
import { DemographicAnalytics } from './_components/demographic-analytics';
import { TenureAnalytics } from './_components/tenure-analytics';
import { ProfileAnalytics } from './_components/profile-analytics';

export default function StaffDashboardPage() {
  const [filters, setFilters] = useState<StaffDashboardFilters>({});

  // State for filter options
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{
      id: string;
      department_name: string;
      institution_id: string;
    }>
  >([]);
  const [categories, setCategories] = useState<
    Array<{ id: string; category_name: string }>
  >([]);

  const {
    data: dashboardData,
    isLoading,
    error,
    refetch
  } = useStaffDashboardStats(filters);

  // Load institutions on mount
  useEffect(() => {
    async function loadInstitutions() {
      try {
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (error) {
        console.error('Error loading institutions:', error);
      }
    }
    loadInstitutions();
  }, []);

  // Load departments when institution changes
  useEffect(() => {
    if (filters.institutionId) {
      async function loadDepartments() {
        try {
          const { data } = await DepartmentService.getDepartments({
            institution_id: filters.institutionId,
            isActive: true
          });
          setDepartments(data);
        } catch (error) {
          console.error('Error loading departments:', error);
        }
      }
      loadDepartments();
    } else {
      setDepartments([]);
    }
  }, [filters.institutionId]);

  // Load categories on mount
  useEffect(() => {
    async function loadCategories() {
      try {
        const { data } = await CategoryService.getCategories({
          isActive: true,
          limit: 100 // Get all active categories
        });
        setCategories(data);
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    }
    loadCategories();
  }, []);

  const resetFilters = () => {
    setFilters({});
  };

  const handleRefresh = () => {
    refetch();
  };

  if (error) {
    console.error('[StaffDashboardPage] Render Error:', error);
    return (
      <ContentLayout title='Facilitators Dashboard'>
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
                  <Link href='/Facilitators/list'>Facilitators</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Analytics Dashboard</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className='text-center'>
            <h1 className='text-2xl font-bold text-red-600 mb-4'>
              Error Loading Dashboard
            </h1>
            <p className='text-muted-foreground mb-4'>
              {error.message || 'An unexpected error occurred'}
            </p>
            <Button onClick={handleRefresh}>Try Again</Button>
          </div>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Facilitators Dashboard'>
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
                <Link href='/Facilitators/list'>Facilitators</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Analytics Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className='flex items-center justify-between'>
          <div>
            <h1 className='text-3xl font-bold flex items-center gap-3'>
              <BarChart3 className='h-8 w-8 text-primary' />
              Facilitators Analytics Dashboard
            </h1>
            <p className='text-muted-foreground mt-1'>
              Comprehensive Facilitators analytics and insights for data-driven
              HR decisions
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='hidden sm:flex'>
              Real-time Data
            </Badge>
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
          </div>
        </div>

        {/* Filters */}
        <DashboardFilters
          key={JSON.stringify(filters)}
          filters={filters}
          onFiltersChange={setFilters}
          onReset={resetFilters}
          institutions={institutions}
          departments={departments}
          categories={categories}
          isLoading={isLoading}
        />

        {/* Dashboard Content */}
        <Tabs defaultValue='overview' className='space-y-6'>
          <TabsList className='grid w-full grid-cols-2 lg:grid-cols-6'>
            <TabsTrigger value='overview'>Overview</TabsTrigger>
            <TabsTrigger value='organizational'>Organizational</TabsTrigger>
            <TabsTrigger value='demographics'>Demographics</TabsTrigger>
            <TabsTrigger value='geographic'>Geographic</TabsTrigger>
            <TabsTrigger value='tenure'>Tenure</TabsTrigger>
            <TabsTrigger value='profiles'>Profiles</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value='overview' className='space-y-6'>
            <div className='space-y-6'>
              {/* Overview Header */}
              <div className='border-l-4 border-primary pl-4'>
                <h2 className='text-2xl font-bold'>Overview Analytics</h2>
                <p className='text-muted-foreground'>
                  Key performance indicators and summary metrics for
                  Facilitators management
                </p>
              </div>

              {/* KPI Cards */}
              <OverviewStats
                data={dashboardData?.overview}
                isLoading={isLoading}
              />

              {/* Hiring Trends */}
              <RegistrationTrends
                data={dashboardData?.registrationTrends}
                isLoading={isLoading}
              />

              {/* Quick Analytics */}
              <div className='grid gap-6 md:grid-cols-2'>
                <InstitutionDistribution
                  data={dashboardData?.institutionStats}
                  isLoading={isLoading}
                />
                <CategoryDistribution
                  data={dashboardData?.categoryStats}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </TabsContent>

          {/* Organizational Tab */}
          <TabsContent value='organizational' className='space-y-6'>
            <div className='space-y-6'>
              {/* Organizational Header */}
              <div className='border-l-4 border-blue-500 pl-4'>
                <h2 className='text-2xl font-bold'>Organizational Analytics</h2>
                <p className='text-muted-foreground'>
                  Facilitators distribution across institutions, departments,
                  and employment categories
                </p>
              </div>

              <div className='grid gap-6'>
                <InstitutionDistribution
                  data={dashboardData?.institutionStats}
                  isLoading={isLoading}
                />
                <DepartmentDistribution
                  data={dashboardData?.departmentStats}
                  isLoading={isLoading}
                />
                <CategoryDistribution
                  data={dashboardData?.categoryStats}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </TabsContent>

          {/* Demographics Tab */}
          <TabsContent value='demographics' className='space-y-6'>
            <div className='space-y-6'>
              {/* Demographics Header */}
              <div className='border-l-4 border-green-500 pl-4'>
                <h2 className='text-2xl font-bold'>Demographic Analytics</h2>
                <p className='text-muted-foreground'>
                  Facilitators demographics breakdown including gender, age
                  groups, and diversity metrics
                </p>
              </div>

              <DemographicAnalytics
                data={dashboardData?.demographicStats}
                isLoading={isLoading}
              />
            </div>
          </TabsContent>

          {/* Geographic Tab */}
          <TabsContent value='geographic' className='space-y-6'>
            <div className='space-y-6'>
              {/* Geographic Header */}
              <div className='border-l-4 border-orange-500 pl-4'>
                <h2 className='text-2xl font-bold'>Geographic Analytics</h2>
                <p className='text-muted-foreground'>
                  Facilitators distribution across states, districts, and
                  geographic regions
                </p>
              </div>

              <GeographicDistribution
                data={dashboardData?.geographicStats}
                isLoading={isLoading}
              />
            </div>
          </TabsContent>

          {/* Tenure Tab */}
          <TabsContent value='tenure' className='space-y-6'>
            <div className='space-y-6'>
              {/* Tenure Header */}
              <div className='border-l-4 border-purple-500 pl-4'>
                <h2 className='text-2xl font-bold'>Tenure Analytics</h2>
                <p className='text-muted-foreground'>
                  Facilitators tenure distribution, hiring trends, and retention
                  analysis
                </p>
              </div>

              <TenureAnalytics
                data={dashboardData?.tenureAnalytics}
                isLoading={isLoading}
              />
            </div>
          </TabsContent>

          {/* Profiles Tab */}
          <TabsContent value='profiles' className='space-y-6'>
            <div className='space-y-6'>
              {/* Profiles Header */}
              <div className='border-l-4 border-pink-500 pl-4'>
                <h2 className='text-2xl font-bold'>Profile Analytics</h2>
                <p className='text-muted-foreground'>
                  Facilitators profile completion analysis and missing field
                  insights
                </p>
              </div>

              <ProfileAnalytics
                data={dashboardData?.profileAnalytics}
                isLoading={isLoading}
                filters={filters}
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Loading Overlay */}
        {isLoading && (
          <div className='fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center'>
            <div className='flex items-center gap-2'>
              <RefreshCw className='h-6 w-6 animate-spin' />
              <span className='text-lg font-medium'>Loading Dashboard...</span>
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
