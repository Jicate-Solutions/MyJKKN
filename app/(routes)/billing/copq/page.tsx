'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import { usePermissions } from '@/hooks/use-permissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BeatLoader } from 'react-spinners';
import { PageBreadcrumb } from '@/components/navigation/Breadcrumbs';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart3,
  TrendingDown,
  AlertTriangle,
  RefreshCw,
  Plus,
  List
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useUserInstitutionAccess } from '@/hooks/use-user-institution-access';
import { COPQDashboard } from '../_components/copq-dashboard';
import { COPQIncidentForm } from '../_components/copq-incident-form';
import { COPQIceberg } from '../_components/copq-iceberg';
import { COPQTrendChart } from '../_components/copq-trend-chart';
import { useCOPQDashboard, useCOPQIceberg } from '@/hooks/billing/use-billing-copq';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export default function BillingCOPQPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [year, setYear] = useState(new Date().getFullYear());
  const [isFormOpen, setIsFormOpen] = useState(false);

  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions();
  const { institutions } = useUserInstitutionAccess();

  // Get the first accessible institution ID as default
  const defaultInstitutionId = institutions?.[0]?.institution_id || '';

  const [selectedInstitutionId, setSelectedInstitutionId] = useState<string>('');

  // Use selected or default institution
  const institutionId = selectedInstitutionId || defaultInstitutionId;

  const {
    dashboard,
    loading: dashboardLoading,
    error: dashboardError,
    refetch: refetchDashboard
  } = useCOPQDashboard(institutionId, year);

  const {
    iceberg,
    loading: icebergLoading,
    error: icebergError,
    refetch: refetchIceberg
  } = useCOPQIceberg(institutionId, year);

  // Check permissions
  const canViewCOPQ = isSuperAdmin || canAccess('billing.reports', 'view');

  // Generate year options (current year and 5 years back)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='Cost of Poor Quality'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!canViewCOPQ) {
    return (
      <ContentLayout title='Cost of Poor Quality'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view COPQ reports.
          </p>
        </div>
      </ContentLayout>
    );
  }

  const handleRefresh = () => {
    refetchDashboard();
    refetchIceberg();
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
    handleRefresh();
  };

  return (
    <ContentLayout title='Cost of Poor Quality'>
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Billing', href: '/billing/schedule' },
          { label: 'Cost of Poor Quality', href: '/billing/copq' }
        ]}
      />

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start'>
          <div>
            <h1 className='text-2xl font-bold py-1'>Cost of Poor Quality (COPQ)</h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              Track and analyze hidden costs in billing operations
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button variant='outline' asChild>
              <Link href='/billing/copq/incidents'>
                <List className='mr-2 h-4 w-4' />
                View All Incidents
              </Link>
            </Button>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className='mr-2 h-4 w-4' />
                  Log Incident
                </Button>
              </DialogTrigger>
              <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
                <DialogHeader>
                  <DialogTitle>Log COPQ Incident</DialogTitle>
                </DialogHeader>
                <COPQIncidentForm
                  institutionId={institutionId}
                  onSuccess={handleFormSuccess}
                  onCancel={() => setIsFormOpen(false)}
                />
              </DialogContent>
            </Dialog>
            <Button
              variant='outline'
              onClick={handleRefresh}
              disabled={dashboardLoading || icebergLoading}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  dashboardLoading || icebergLoading ? 'animate-spin' : ''
                }`}
              />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className='p-4'>
            <div className='flex flex-wrap gap-4 items-end'>
              {institutions && institutions.length > 1 && (
                <div className='space-y-2'>
                  <Label>Institution</Label>
                  <Select
                    value={selectedInstitutionId}
                    onValueChange={setSelectedInstitutionId}
                  >
                    <SelectTrigger className='w-[250px]'>
                      <SelectValue placeholder='Select institution' />
                    </SelectTrigger>
                    <SelectContent>
                      {institutions.map((inst) => (
                        <SelectItem key={inst.institution_id} value={inst.institution_id}>
                          {inst.institution_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className='space-y-2'>
                <Label>Year</Label>
                <Select
                  value={year.toString()}
                  onValueChange={(v) => setYear(parseInt(v))}
                >
                  <SelectTrigger className='w-[120px]'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y.toString()}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {(dashboardError || icebergError) && (
          <Card className='border-destructive'>
            <CardContent className='flex flex-col items-center justify-center py-8'>
              <AlertTriangle className='h-12 w-12 text-destructive mb-4' />
              <h3 className='text-lg font-semibold mb-2'>Error Loading Data</h3>
              <p className='text-muted-foreground text-center max-w-md mb-4'>
                {dashboardError || icebergError}
              </p>
              <Button variant='outline' onClick={handleRefresh}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        {!dashboardError && !icebergError && (
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className='space-y-4'
          >
            <TabsList className='grid w-full grid-cols-3'>
              <TabsTrigger value='dashboard' className='flex items-center gap-2'>
                <BarChart3 className='h-4 w-4' />
                Dashboard
              </TabsTrigger>
              <TabsTrigger value='iceberg' className='flex items-center gap-2'>
                <TrendingDown className='h-4 w-4' />
                Iceberg Analysis
              </TabsTrigger>
              <TabsTrigger value='trends' className='flex items-center gap-2'>
                <BarChart3 className='h-4 w-4' />
                Trends
              </TabsTrigger>
            </TabsList>

            <TabsContent value='dashboard'>
              <COPQDashboard
                dashboard={dashboard}
                loading={dashboardLoading}
                institutionId={institutionId}
                year={year}
              />
            </TabsContent>

            <TabsContent value='iceberg'>
              <COPQIceberg iceberg={iceberg} loading={icebergLoading} />
            </TabsContent>

            <TabsContent value='trends'>
              <COPQTrendChart
                trend={dashboard?.trend || []}
                loading={dashboardLoading}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </ContentLayout>
  );
}
