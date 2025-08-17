'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  Edit,
  ExternalLink,
  ImageIcon,
  Shield,
  Key,
  Clock,
  Globe,
  Users,
  Info,
  Copy,
  Check
} from 'lucide-react';
import { ApplicationService } from '@/lib/services/application/application-service';
import { Application } from '@/types/applications';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import Image from 'next/image';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { toast } from 'react-hot-toast';
import { Skeleton } from '@/components/ui/skeleton';
import React from 'react';

interface ApplicationDetailsPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function ApplicationDetailsPage({
  params: paramsPromise
}: ApplicationDetailsPageProps) {
  const params = React.use(paramsPromise);
  const [application, setApplication] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [screenshotIndex, setScreenshotIndex] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const fetchApplication = async () => {
      try {
        setLoading(true);
        const data = await ApplicationService.getApplicationById(params.id);
        setApplication(data);
      } catch (error) {
        toast.error('Failed to load application details');
      } finally {
        setLoading(false);
      }
    };

    fetchApplication();
  }, [params.id]);

  useEffect(() => {
    if (application && !application.category) {
      setApplication((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          category: { id: '', name: 'Uncategorized', description: null }
        };
      });
    }
  }, [application]);

  const hasScreenshots =
    application?.screenshots && application.screenshots.length > 0;

  if (loading) {
    return (
      <ContentLayout title='Application Details'>
        <Breadcrumb className='mb-6'>
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
              <BreadcrumbPage>
                <Skeleton className='h-4 w-24' />
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='flex items-center justify-between mb-6'>
          <div>
            <Skeleton className='h-8 w-64 mb-2' />
            <Skeleton className='h-4 w-40' />
          </div>
          <div className='flex gap-2'>
            <Skeleton className='h-10 w-24' />
            <Skeleton className='h-10 w-24' />
          </div>
        </div>

        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className='mb-6'>
            <CardHeader>
              <Skeleton className='h-6 w-40' />
              <Skeleton className='h-4 w-72' />
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-3/4' />
                <Skeleton className='h-4 w-5/6' />
              </div>
            </CardContent>
          </Card>
        ))}
      </ContentLayout>
    );
  }

  if (!application) {
    return (
      <ContentLayout title='Application Not Found'>
        <div className='flex flex-col items-center justify-center py-12'>
          <h2 className='text-2xl font-bold mb-2'>Application Not Found</h2>
          <p className='text-muted-foreground mb-6'>
            The requested application could not be found
          </p>
          <Button asChild>
            <Link href='/applications'>
              <ChevronLeft className='mr-2 h-4 w-4' />
              Back to Applications
            </Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={application.name}>
      <Breadcrumb className='mb-6'>
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
            <BreadcrumbPage>{application.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='flex flex-col md:flex-row md:items-center gap-4 justify-between mb-6'>
        <div className='flex items-center gap-4'>
          <div className='flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border bg-muted'>
            {application.icon_path ? (
              <Image
                src={application.icon_path}
                alt={application.name}
                width={64}
                height={64}
                className='w-full h-full object-cover'
              />
            ) : (
              <div className='w-full h-full flex items-center justify-center'>
                <ImageIcon className='h-8 w-8 text-muted-foreground' />
              </div>
            )}
          </div>
          <div>
            <h1 className='text-2xl font-bold'>{application.name}</h1>
            <div className='flex items-center gap-2 mt-1'>
              <Badge variant={application.is_active ? 'default' : 'secondary'}>
                {application.is_active ? 'Active' : 'Inactive'}
              </Badge>
              <span className='text-sm text-muted-foreground'>
                {application.category?.name || 'Uncategorized'}
              </span>
            </div>
          </div>
        </div>
        <div className='flex gap-2 self-end md:self-auto'>
          <Button variant='outline' asChild>
            <Link href={`/applications/${application.id}/edit`}>
              <Edit className='mr-2 h-4 w-4' />
              Edit
            </Link>
          </Button>
          <Button asChild>
            <Link
              href={application.url}
              target='_blank'
              rel='noopener noreferrer'
            >
              <ExternalLink className='mr-2 h-4 w-4' />
              Open Application
            </Link>
          </Button>
        </div>
      </div>

      <div className='space-y-6'>
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
            <CardDescription>
              Core details about the application
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div>
              <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                URL
              </h3>
              <p className='text-sm'>
                <Link
                  href={application.url}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='text-primary hover:underline flex items-center'
                >
                  {application.url}
                  <ExternalLink className='ml-1 h-3 w-3' />
                </Link>
              </p>
            </div>
            <div>
              <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                Description
              </h3>
              <p className='text-sm'>
                {application.description || 'No description provided'}
              </p>
            </div>
            <div>
              <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                Display Order
              </h3>
              <p className='text-sm'>{application.display_order}</p>
            </div>
          </CardContent>
        </Card>

        {/* Classification */}
        <Card>
          <CardHeader>
            <CardTitle>Classification</CardTitle>
            <CardDescription>Categorization and organization</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                  Category
                </h3>
                <p className='text-sm'>
                  {application.category?.name || 'Uncategorized'}
                </p>
              </div>
              {application.subcategory_id && (
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                    Subcategory
                  </h3>
                  <div className='text-sm'>
                    {application.subcategory
                      ? application.subcategory.name
                      : 'Unknown subcategory'}
                  </div>
                </div>
              )}
            </div>
            <div>
              <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                Tags
              </h3>
              <div className='flex flex-wrap gap-2 mt-1'>
                {application.tags && application.tags.length > 0 ? (
                  application.tags.map((tag, index) => (
                    <Badge key={`${tag}-${index}`} variant='secondary'>
                      {tag}
                    </Badge>
                  ))
                ) : (
                  <p className='text-sm text-muted-foreground'>No tags</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Access Control */}
        <Card>
          <CardHeader>
            <CardTitle>Access Control</CardTitle>
            <CardDescription>Access and security settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div>
              <h3 className='text-sm font-medium text-muted-foreground mb-2'>
                Roles with Access
              </h3>
              <div className='flex flex-wrap gap-2'>
                {application.roles_access &&
                application.roles_access.length > 0 ? (
                  application.roles_access.map((role) => (
                    <Badge key={role} variant='outline'>
                      {role}
                    </Badge>
                  ))
                ) : (
                  <p className='text-sm text-muted-foreground'>
                    No roles specified
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technical Information */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Information</CardTitle>
            <CardDescription>
              Technical configuration and details
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                  Integration Type
                </h3>
                <p className='text-sm capitalize'>
                  {application.integration_type}
                </p>
              </div>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                  Authentication Method
                </h3>
                <p className='text-sm capitalize'>
                  {application.auth_method.replace('_', ' ')}
                </p>
              </div>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                  Application Type
                </h3>
                <p className='text-sm capitalize'>
                  {application.application_type}
                </p>
              </div>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                  Supported Platforms
                </h3>
                <p className='text-sm capitalize'>
                  {application.supported_platforms}
                </p>
              </div>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                  Data Sensitivity
                </h3>
                <p className='text-sm capitalize'>
                  {application.data_sensitivity}
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
              <CardDescription>Application API configuration</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-4'>
                {application.api_endpoints.map((endpoint, index) => (
                  <div key={index} className='p-4 border rounded-md'>
                    <div className='flex items-center justify-between mb-2'>
                      <h3 className='font-medium'>{endpoint.name}</h3>
                      <Badge
                        variant={endpoint.is_active ? 'default' : 'secondary'}
                      >
                        {endpoint.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className='grid grid-cols-1 md:grid-cols-2 gap-2 text-sm'>
                      <div>
                        <span className='text-muted-foreground'>URL: </span>
                        <Link
                          href={endpoint.url}
                          target='_blank'
                          rel='noopener noreferrer'
                          className='text-primary hover:underline'
                        >
                          {endpoint.url}
                        </Link>
                      </div>
                      <div>
                        <span className='text-muted-foreground'>Method: </span>
                        <span>{endpoint.method}</span>
                      </div>
                      {endpoint.description && (
                        <div className='col-span-2'>
                          <span className='text-muted-foreground'>
                            Description:{' '}
                          </span>
                          <span>{endpoint.description}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Parent Authentication Settings */}
        {application.uses_parent_auth && (
          <Card>
            <CardHeader>
              <CardTitle className='flex items-center gap-2'>
                <Shield className='h-5 w-5 text-primary' />
                Parent App Authentication
              </CardTitle>
              <CardDescription>
                This application uses MyJKKN authentication
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='space-y-6'>
                {/* App ID */}
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                    Application ID
                  </h3>
                  <div className='flex items-center gap-2'>
                    <code className='text-sm bg-muted px-2 py-1 rounded'>
                      {application.app_id || 'Not configured'}
                    </code>
                  </div>
                </div>

                {/* API Key Status */}
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                    API Key
                  </h3>
                  <div className='flex items-center gap-2'>
                    <Badge
                      variant={
                        application.api_key_hash ? 'default' : 'secondary'
                      }
                    >
                      <Key className='h-3 w-3 mr-1' />
                      {application.api_key_hash ? 'Configured' : 'Not Set'}
                    </Badge>
                    {application.api_key_hash && (
                      <span className='text-xs text-muted-foreground'>
                        (Hash stored securely)
                      </span>
                    )}
                  </div>
                </div>

                {/* Redirect URIs */}
                {application.allowed_redirect_uris &&
                  application.allowed_redirect_uris.length > 0 && (
                    <div>
                      <h3 className='text-sm font-medium text-muted-foreground mb-2'>
                        Allowed Redirect URIs
                      </h3>
                      <div className='space-y-1'>
                        {application.allowed_redirect_uris.map((uri, index) => (
                          <div key={index} className='flex items-center gap-2'>
                            <Globe className='h-3 w-3 text-muted-foreground' />
                            <code className='text-xs bg-muted px-2 py-1 rounded'>
                              {uri}
                            </code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Permission Scopes */}
                {application.allowed_scopes &&
                  application.allowed_scopes.length > 0 && (
                    <div>
                      <h3 className='text-sm font-medium text-muted-foreground mb-2'>
                        Permission Scopes
                      </h3>
                      <div className='flex flex-wrap gap-2'>
                        {application.allowed_scopes.map((scope) => (
                          <Badge key={scope} variant='outline'>
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                {/* Rate Limiting */}
                <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                  <div>
                    <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                      Rate Limit
                    </h3>
                    <p className='text-sm'>
                      {application.rate_limit_requests || 1000} requests per{' '}
                      {application.rate_limit_window_minutes || 60} minutes
                    </p>
                  </div>
                  {application.last_auth_activity && (
                    <div>
                      <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                        Last Authentication Activity
                      </h3>
                      <div className='flex items-center gap-2 text-sm'>
                        <Clock className='h-3 w-3 text-muted-foreground' />
                        {new Date(
                          application.last_auth_activity
                        ).toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>

                {/* Access Control Note */}
                <div className='rounded-lg border bg-blue-50 dark:bg-blue-950/20 p-3'>
                  <div className='flex gap-2'>
                    <Info className='h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5' />
                    <div className='text-sm text-blue-900 dark:text-blue-100'>
                      <strong>Access Control:</strong> This application uses the
                      roles configured in the &quot;Access Control&quot; section
                      above.
                      {application.roles_access &&
                      application.roles_access.length > 0 ? (
                        <span>
                          {' '}
                          Only users with the following roles can authenticate:{' '}
                          {application.roles_access.join(', ')}.
                        </span>
                      ) : (
                        <span>
                          {' '}
                          All authenticated users can access this application.
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Auth Enablement Info */}
                {application.auth_enabled_at && (
                  <div className='text-xs text-muted-foreground'>
                    Authentication enabled on{' '}
                    {new Date(application.auth_enabled_at).toLocaleString()}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Support Contact */}
        {application.support_contact && (
          <Card>
            <CardHeader>
              <CardTitle>Support Contact</CardTitle>
              <CardDescription>Who to contact for help</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                    Name
                  </h3>
                  <p className='text-sm'>{application.support_contact.name}</p>
                </div>
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                    Email
                  </h3>
                  <Link
                    href={`mailto:${application.support_contact.email}`}
                    className='text-sm text-primary hover:underline'
                  >
                    {application.support_contact.email}
                  </Link>
                </div>
                {application.support_contact.phone && (
                  <div>
                    <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                      Phone
                    </h3>
                    <Link
                      href={`tel:${application.support_contact.phone}`}
                      className='text-sm text-primary hover:underline'
                    >
                      {application.support_contact.phone}
                    </Link>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Screenshots */}
        {hasScreenshots && application.screenshots && (
          <Card>
            <CardHeader>
              <CardTitle>Screenshots</CardTitle>
              <CardDescription>
                Visual previews of the application
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3'>
                {application.screenshots.map(
                  (screenshot: string, index: number) => (
                    <Dialog key={index}>
                      <DialogTrigger asChild>
                        <div className='relative aspect-video rounded-md overflow-hidden border cursor-pointer hover:opacity-90 transition-opacity'>
                          <Image
                            src={screenshot}
                            alt={`${application.name} screenshot ${index + 1}`}
                            fill
                            className='object-cover'
                          />
                        </div>
                      </DialogTrigger>
                      <DialogContent className='sm:max-w-[800px]'>
                        <DialogHeader>
                          <DialogTitle>
                            {application.name} Screenshot
                          </DialogTitle>
                          <DialogDescription>
                            Screenshot {index + 1} of{' '}
                            {application.screenshots?.length || 0}
                          </DialogDescription>
                        </DialogHeader>
                        <div className='relative aspect-video w-full overflow-hidden rounded-lg mt-4'>
                          <Image
                            src={screenshot}
                            alt={`${application.name} screenshot ${index + 1}`}
                            fill
                            className='object-contain'
                          />
                        </div>
                      </DialogContent>
                    </Dialog>
                  )
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
            <CardDescription>Additional system information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-1 md:grid-cols-3 gap-4 text-sm'>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                  Created At
                </h3>
                <p>{new Date(application.created_at).toLocaleString()}</p>
              </div>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                  Last Updated
                </h3>
                <p>{new Date(application.updated_at).toLocaleString()}</p>
              </div>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                  Application ID
                </h3>
                <p className='font-mono'>{application.id}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
