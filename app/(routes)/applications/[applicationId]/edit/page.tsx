'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'react-hot-toast';
import { use } from 'react';
import { ArrowLeft } from 'lucide-react';
import BeatLoader from 'react-spinners/BeatLoader';

import { Button } from '@/components/ui/button';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { ContentLayout } from '@/components/layout/content-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApplicationForm } from '@/components/applications/application-form';
import { Application, ApplicationFormData } from '@/types/applications';
import { useAuth } from '@/providers/auth-provider';

interface EditApplicationPageProps {
  params: Promise<{
    applicationId: string;
  }>;
}

export default function EditApplicationPage({
  params
}: EditApplicationPageProps) {
  const resolvedParams = use(params);
  const applicationId = resolvedParams.applicationId;

  const router = useRouter();
  const supabase = createClientComponentClient();
  const { user } = useAuth();
  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchApplication = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('applications')
        .select('*')
        .eq('id', applicationId)
        .single();

      if (error) throw error;
      setApplication(data);
    } catch (error) {
      console.error('Error fetching application:', error);
      toast.error('Failed to load application');
      router.push('/applications');
    } finally {
      setIsLoading(false);
    }
  }, [applicationId, router, supabase]);

  useEffect(() => {
    fetchApplication();
  }, [fetchApplication]);

  const handleSubmit = async (data: ApplicationFormData) => {
    try {
      setIsSaving(true);

      if (!user) {
        throw new Error('You must be logged in to update an application');
      }

      // Check if name is unique (excluding current application)
      const { data: existingApp, error: checkError } = await supabase
        .from('applications')
        .select('id')
        .eq('name', data.name)
        .neq('id', applicationId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingApp) {
        toast.error('An application with this name already exists');
        return;
      }

      // Update application
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          name: data.name,
          description: data.description,
          url: data.url,
          category: data.category,
          subcategory: data.subcategory,
          integration_type: data.integration_type,
          authentication_method: data.authentication_method,
          display_order: data.display_order,
          is_active: data.is_active,
          tags: data.tags,
          access_permissions: data.access_permissions,
          support_contact: data.support_contact,
          supported_platforms: data.supported_platforms,
          application_type: data.application_type,
          data_sensitivity_level: data.data_sensitivity_level,
          api_endpoints: data.api_endpoints,
          updated_at: new Date().toISOString()
        })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      toast.success('Application updated successfully');
      router.push('/applications');
      router.refresh();
    } catch (error: any) {
      console.error('Error updating application:', error);
      toast.error(error.message || 'Failed to update application');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <ContentLayout title='Loading...'>
        <div className='flex items-center justify-center min-h-[400px]'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!application) {
    return (
      <ContentLayout title='Not Found'>
        <div className='text-center'>
          <h2 className='text-lg font-semibold'>Application not found</h2>
          <p className='text-muted-foreground mt-1'>
            The application you&apos;re trying to edit doesn&apos;t exist.
          </p>
          <Button
            variant='outline'
            className='mt-4'
            onClick={() => router.push('/applications')}
          >
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back to Applications
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit ${application.name}`}>
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
              <Link href='/applications'>Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/applications/${applicationId}`}>
                {application.name}
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 p-6'>
        <Card>
          <CardHeader>
            <CardTitle>Edit Application</CardTitle>
          </CardHeader>
          <CardContent>
            <ApplicationForm
              initialData={application}
              onSubmit={handleSubmit}
              isLoading={isSaving}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
