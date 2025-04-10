'use client';

import { useState } from 'react';
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
import { AlertCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useApiKey } from '@/app/hooks/crm/use-api-key';

export default function CrmPage() {
  const [activeTab, setActiveTab] = useState('sources');
  const { apiKey, loading, error } = useApiKey();

  if (loading) {
    return (
      <ContentLayout title='CRM'>
        <div className='flex flex-col items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin text-primary mb-4' />
          <p className='text-muted-foreground'>Loading CRM data...</p>
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='CRM'>
        <Alert variant='destructive'>
          <AlertCircle className='h-4 w-4' />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error.message ||
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
          <CardHeader>
            <CardTitle>Enquiry Management</CardTitle>
            <CardDescription>
              View and manage all admission enquiries from various sources
            </CardDescription>
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

              <TabsContent value='sources'>
                <SourcesTab apiKey={apiKey} />
              </TabsContent>

              <TabsContent value='forms'>
                <FormsTab apiKey={apiKey} />
              </TabsContent>

              <TabsContent value='responses'>
                <ResponsesTab apiKey={apiKey} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
