'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import Link from 'next/link';
import { Edit, ArrowLeft } from 'lucide-react';
import { BeatLoader } from 'react-spinners';

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
import { ContentLayout } from '@/components/layout/content-layout';
import { toast } from 'react-hot-toast';
import { Badge } from '@/components/ui/badge';

interface Application {
  id: string;
  name: string;
  description: string;
  url: string;
  category: string;
  subcategory: string;
  integration_type: string;
  authentication_method: string;
  display_order: number;
  is_active: boolean;
  tags: string[];
  access_permissions: string[];
  support_contact: {
    name: string;
    email: string;
    phone?: string;
  };
  supported_platforms: string;
  application_type: string;
  data_sensitivity_level: string;
  api_endpoints?: Array<{
    name: string;
    endpoint: string;
    method: string;
    description?: string;
  }>;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export default function ApplicationDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [application, setApplication] = useState<Application | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchApplication = async () => {
      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('applications')
          .select('*')
          .eq('id', params.id)
          .single();

        if (error) throw error;
        setApplication(data);
      } catch (error) {
        console.error('Error fetching application:', error);
        toast.error('Failed to load application details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchApplication();
  }, [params.id, supabase]);

  if (isLoading) {
    return (
      <ContentLayout title='Application Details'>
        <div className='flex items-center justify-center h-screen w-full'>
          <BeatLoader color='#00e902' />
        </div>
      </ContentLayout>
    );
  }

  if (!application) {
    return (
      <ContentLayout title='Application Details'>
        <div className='flex flex-col items-center justify-center h-screen'>
          <h2 className='text-xl font-semibold mb-2'>Application Not Found</h2>
          <Button asChild>
            <Link href='/applications'>Back to Applications</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <ContentLayout title={application.name}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/applications'>Applications</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{application.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 py-4'>
        {/* Header */}
        <div className='flex justify-between items-center'>
          <Button variant='ghost' asChild className='gap-2'>
            <Link href='/applications'>
              <ArrowLeft className='h-4 w-4' />
              Back
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/applications/${application.id}/edit`}>
              <Edit className='mr-2 h-4 w-4' />
              Edit Application
            </Link>
          </Button>
        </div>

        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Application details and configuration
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              <div>
                <h3 className='font-medium'>Application Name</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.name}
                </p>
              </div>
              <div>
                <h3 className='font-medium'>Status</h3>
                <Badge
                  variant={application.is_active ? 'default' : 'secondary'}
                >
                  {application.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className='col-span-2'>
                <h3 className='font-medium'>Description</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.description}
                </p>
              </div>
              <div>
                <h3 className='font-medium'>URL</h3>
                <a
                  href={application.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-sm text-primary hover:underline'
                >
                  {application.url}
                </a>
              </div>
              <div>
                <h3 className='font-medium'>Display Order</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.display_order}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Classification */}
        <Card>
          <CardHeader>
            <CardTitle>Classification</CardTitle>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              <div>
                <h3 className='font-medium'>Category</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.category}
                </p>
              </div>
              <div>
                <h3 className='font-medium'>Subcategory</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.subcategory}
                </p>
              </div>
              <div>
                <h3 className='font-medium'>Tags</h3>
                <div className='flex flex-wrap gap-2 mt-1'>
                  {application.tags.map((tag, index) => (
                    <Badge key={index} variant='outline'>
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <h3 className='font-medium'>Access Permissions</h3>
                <div className='flex flex-wrap gap-2 mt-1'>
                  {application.access_permissions.map((permission, index) => (
                    <Badge key={index} variant='secondary'>
                      {permission}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technical Details */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              <div>
                <h3 className='font-medium'>Integration Type</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.integration_type}
                </p>
              </div>
              <div>
                <h3 className='font-medium'>Authentication Method</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.authentication_method}
                </p>
              </div>
              <div>
                <h3 className='font-medium'>Supported Platforms</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.supported_platforms}
                </p>
              </div>
              <div>
                <h3 className='font-medium'>Data Sensitivity Level</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.data_sensitivity_level}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* API Endpoints */}
        {application.api_endpoints && application.api_endpoints.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>API Endpoints</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                {application.api_endpoints.map((endpoint, index) => (
                  <div key={index} className='border p-4 rounded-lg'>
                    <div className='flex justify-between items-start mb-2'>
                      <h3 className='font-medium'>{endpoint.name}</h3>
                      <Badge>{endpoint.method}</Badge>
                    </div>
                    <p className='text-sm text-muted-foreground mb-2'>
                      {endpoint.endpoint}
                    </p>
                    {endpoint.description && (
                      <p className='text-sm text-muted-foreground'>
                        {endpoint.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Support Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Support Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
              <div>
                <h3 className='font-medium'>Name</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.support_contact.name}
                </p>
              </div>
              <div>
                <h3 className='font-medium'>Email</h3>
                <p className='text-sm text-muted-foreground'>
                  {application.support_contact.email}
                </p>
              </div>
              {application.support_contact.phone && (
                <div>
                  <h3 className='font-medium'>Phone</h3>
                  <p className='text-sm text-muted-foreground'>
                    {application.support_contact.phone}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              <div>
                <h3 className='font-medium'>Created At</h3>
                <p className='text-sm text-muted-foreground'>
                  {formatDate(application.created_at)}
                </p>
              </div>
              <div>
                <h3 className='font-medium'>Last Updated</h3>
                <p className='text-sm text-muted-foreground'>
                  {formatDate(application.updated_at)}
                </p>
              </div>
              {application.created_by && (
                <div>
                  <h3 className='font-medium'>Created By</h3>
                  <p className='text-sm text-muted-foreground'>
                    {application.created_by}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
