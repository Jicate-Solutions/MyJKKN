'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { SourcesTab } from './_components/sources-tab';
import { FormsTab } from './_components/forms-tab';
import { ResponsesTab } from './_components/responses-tab';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useApiKey } from '@/hooks/crm/use-api-key';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';
import { BeatLoader } from 'react-spinners';

export default function CrmPage() {
  const [activeTab, setActiveTab] = useState('sources');
  const { apiKey, loading: apiKeyLoading, error: apiKeyError } = useApiKey();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  // Load permissions with waitForLoad to ensure they're fully loaded
  const {
    canAccess,
    isSuperAdmin,
    isLoading: permissionsLoading
  } = usePermissions([], { waitForLoad: true });

  // Check if user has permission to view CRM
  const canViewCrm = isSuperAdmin || canAccess('admissions.crm', 'view');

  // Track when permissions are loaded
  useEffect(() => {
    if (!permissionsLoading) {
      console.log('CRM permissions debug:', {
        isSuperAdmin,
        canViewCrm: canAccess('admissions.crm', 'view')
      });
      setPermissionsLoaded(true);
    }
  }, [permissionsLoading, isSuperAdmin, canAccess]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    // Increment the key to force the child components to remount and refetch data
    setRefreshKey((prevKey) => prevKey + 1);
    // Reset the refreshing state after a short delay
    setTimeout(() => {
      setIsRefreshing(false);
    }, 1000);
  };

  // Show loading state while permissions are loading
  if (permissionsLoading) {
    return (
      <ContentLayout title='CRM'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  // Check if user has permission to view CRM
  if (!canViewCrm) {
    return (
      <ContentLayout title='CRM'>
        <div className='text-center py-8'>
          <p className='text-destructive'>
            You don&apos;t have permission to view the CRM
          </p>
          <Button variant='outline' asChild className='mt-4'>
            <Link href='/admissions'>Back to Admissions</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (apiKeyLoading) {
    return (
      <ContentLayout title='CRM'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
          <p className='text-muted-foreground'>Loading CRM data...</p>
        </div>
      </ContentLayout>
    );
  }

  if (apiKeyError) {
    return (
      <ContentLayout title='CRM'>
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {apiKeyError.message ||
              'Failed to load API key configuration. Please check your server setup.'}
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  if (!apiKey) {
    return (
      <ContentLayout title='CRM'>
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>API Key Not Configured</AlertTitle>
          <AlertDescription>
            The CRM API key has not been configured in the environment
            variables. Please contact the system administrator.
          </AlertDescription>
        </Alert>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Admissions CRM'>
      <div className='space-y-6'>
        <PageBreadcrumb
          items={[
            { label: 'Home', href: '/' },
            { label: 'Admissions', href: '/admissions' },
            { label: 'CRM' }
          ]}
        />

        <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-4'>
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>
              Admissions CRM
            </h1>
            <p className='text-muted-foreground'>
              Manage admission enquiries, forms, and responses
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between pb-2'>
            <div className='flex flex-col gap-2 py-2'>
              <CardTitle>Enquiry Management</CardTitle>
              <CardDescription>
                View and manage all admission enquiries from various sources
              </CardDescription>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            <Tabs
              defaultValue='sources'
              value={activeTab}
              onValueChange={setActiveTab}
            >
              <TabsList className='mb-4'>
                <TabsTrigger value='sources'>Sources</TabsTrigger>
                <TabsTrigger value='forms'>Forms</TabsTrigger>
                <TabsTrigger value='responses'>Responses</TabsTrigger>
              </TabsList>

              <TabsContent value='sources' key={`sources-${refreshKey}`}>
                <SourcesTab apiKey={apiKey} />
              </TabsContent>

              <TabsContent value='forms' key={`forms-${refreshKey}`}>
                <FormsTab apiKey={apiKey} />
              </TabsContent>

              <TabsContent value='responses' key={`responses-${refreshKey}`}>
                <ResponsesTab apiKey={apiKey} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
