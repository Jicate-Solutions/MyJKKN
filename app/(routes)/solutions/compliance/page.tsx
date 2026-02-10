'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { useComplianceDashboard } from '@/hooks/solutions/use-compliance-dashboard';
import { OrganizationService } from '@/lib/services/organization/organization-service';
import { DepartmentService } from '@/lib/services/organization/department-service';
import type { ComplianceFilters } from '@/types/compliance';

// Dashboard Components
import { ComplianceOverview } from './_components/compliance-overview';
import { DepartmentBreakdown } from './_components/department-breakdown';
import { LearnerComplianceTable } from './_components/learner-compliance-table';
import { SolutionTeamsView } from './_components/solution-teams-view';

export default function ComplianceDashboardPage() {
  const [filters, setFilters] = useState<ComplianceFilters>({});

  // Filter options
  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [departments, setDepartments] = useState<
    Array<{ id: string; department_name: string; institution_id: string }>
  >([]);

  const {
    data: dashboardData,
    isLoading,
    error,
    refetch
  } = useComplianceDashboard(filters);

  // Load institutions on mount
  useEffect(() => {
    async function loadInstitutions() {
      try {
        const data = await OrganizationService.getInstitutionNames(true);
        setInstitutions(data);
      } catch (err) {
        console.error('[solutions/compliance] Error loading institutions:', err);
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
        } catch (err) {
          console.error('[solutions/compliance] Error loading departments:', err);
        }
      }
      loadDepartments();
    } else {
      setDepartments([]);
      if (filters.departmentId) {
        setFilters((prev) => ({ ...prev, departmentId: undefined }));
      }
    }
  }, [filters.institutionId]);

  const handleRefresh = () => {
    refetch();
  };

  if (error) {
    return (
      <ContentLayout title='AI-Solution Compliance'>
        <div className='space-y-6'>
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
                  <Link href='/solutions'>Solutions Hub</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Compliance</BreadcrumbPage>
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
    <ContentLayout title='AI-Solution Compliance'>
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
                <Link href='/solutions'>Solutions Hub</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Compliance</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
          <div>
            <h1 className='text-3xl font-bold flex items-center gap-3'>
              <ShieldCheck className='h-8 w-8 text-primary' />
              AI-Solution Graduation Gate
            </h1>
            <p className='text-muted-foreground mt-1'>
              Tracking learner compliance for the AI-collaboration solution requirement (June 2026+)
            </p>
          </div>
          <div className='flex items-center gap-2'>
            <Badge variant='outline' className='hidden sm:flex'>
              Graduation Requirement
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
        <div className='flex flex-col sm:flex-row gap-3'>
          <Select
            value={filters.institutionId ?? 'all'}
            onValueChange={(v) =>
              setFilters((prev) => ({
                ...prev,
                institutionId: v === 'all' ? undefined : v,
                departmentId: undefined
              }))
            }
          >
            <SelectTrigger className='w-full sm:w-[280px]'>
              <SelectValue placeholder='All Institutions' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All Institutions</SelectItem>
              {institutions.map((inst) => (
                <SelectItem key={inst.id} value={inst.id}>
                  {inst.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {filters.institutionId && departments.length > 0 && (
            <Select
              value={filters.departmentId ?? 'all'}
              onValueChange={(v) =>
                setFilters((prev) => ({
                  ...prev,
                  departmentId: v === 'all' ? undefined : v
                }))
              }
            >
              <SelectTrigger className='w-full sm:w-[280px]'>
                <SelectValue placeholder='All Departments' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Departments</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.department_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(filters.institutionId || filters.departmentId) && (
            <Button
              variant='ghost'
              size='sm'
              onClick={() => setFilters({})}
              className='self-start'
            >
              Clear filters
            </Button>
          )}
        </div>

        {/* Dashboard Content */}
        <Tabs defaultValue='overview' className='space-y-6'>
          <TabsList className='grid w-full grid-cols-2 lg:grid-cols-4'>
            <TabsTrigger value='overview'>Overview</TabsTrigger>
            <TabsTrigger value='departments'>Departments</TabsTrigger>
            <TabsTrigger value='learners'>Learners</TabsTrigger>
            <TabsTrigger value='solutions'>Solutions</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value='overview' className='space-y-6'>
            <div className='space-y-6'>
              <div className='border-l-4 border-primary pl-4'>
                <h2 className='text-2xl font-bold'>Clearance Overview</h2>
                <p className='text-muted-foreground'>
                  How many graduating learners have fulfilled the AI-solution requirement
                </p>
              </div>

              <ComplianceOverview
                data={dashboardData?.overview}
                isLoading={isLoading}
              />
            </div>
          </TabsContent>

          {/* Departments Tab */}
          <TabsContent value='departments' className='space-y-6'>
            <div className='space-y-6'>
              <div className='border-l-4 border-blue-500 pl-4'>
                <h2 className='text-2xl font-bold'>Department Breakdown</h2>
                <p className='text-muted-foreground'>
                  Clearance rates by department — identify departments needing attention
                </p>
              </div>

              <DepartmentBreakdown
                data={dashboardData?.departments}
                isLoading={isLoading}
              />
            </div>
          </TabsContent>

          {/* Learners Tab */}
          <TabsContent value='learners' className='space-y-6'>
            <div className='space-y-6'>
              <div className='border-l-4 border-green-500 pl-4'>
                <h2 className='text-2xl font-bold'>Individual Learners</h2>
                <p className='text-muted-foreground'>
                  Track each learner&apos;s journey from registration to clearance
                </p>
              </div>

              <LearnerComplianceTable
                data={dashboardData?.learners}
                isLoading={isLoading}
                filters={filters}
                onFiltersChange={setFilters}
              />
            </div>
          </TabsContent>

          {/* Solutions Tab */}
          <TabsContent value='solutions' className='space-y-6'>
            <div className='space-y-6'>
              <div className='border-l-4 border-purple-500 pl-4'>
                <h2 className='text-2xl font-bold'>Solution Teams</h2>
                <p className='text-muted-foreground'>
                  Solutions built by graduating learners — team composition and status
                </p>
              </div>

              <SolutionTeamsView
                data={dashboardData?.solutions}
                isLoading={isLoading}
              />
            </div>
          </TabsContent>
        </Tabs>

        {/* Loading Overlay */}
        {isLoading && (
          <div className='fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center'>
            <div className='flex items-center gap-2'>
              <RefreshCw className='h-6 w-6 animate-spin' />
              <span className='text-lg font-medium'>
                Loading Compliance Dashboard...
              </span>
            </div>
          </div>
        )}
      </div>
    </ContentLayout>
  );
}
