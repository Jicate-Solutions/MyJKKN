'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Loader2,
  PenSquare,
  Trash2,
  Calendar,
  Share2,
  Building2,
  Tag
} from 'lucide-react';
import { ResourceService } from '@/lib/services/resource/resource-service';
import type { Resource } from '@/types/resources';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

interface ResourceDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function ResourceDetailsPage({
  params
}: ResourceDetailsPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resource, setResource] = useState<Resource | null>(null);

  useEffect(() => {
    async function fetchResource() {
      try {
        setLoading(true);
        setError(null);
        const result = await ResourceService.getResource(id);
        setResource(result);
      } catch (err) {
        console.error('Error fetching resource:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch resource'
        );
      } finally {
        setLoading(false);
      }
    }

    fetchResource();
  }, [id]);

  const handleDelete = async () => {
    if (!resource) return;

    if (
      window.confirm(
        `Are you sure you want to delete "${resource.resource_name}"?`
      )
    ) {
      try {
        setLoading(true);
        await ResourceService.deleteResource(id);
        toast.success('Resource deleted successfully');
        router.push('/resources/resources');
      } catch (err) {
        console.error('Error deleting resource:', err);
        toast.error('Failed to delete resource');
        setLoading(false);
      }
    }
  };

  const getConditionBadge = (condition: string) => {
    const colorMap: Record<string, string> = {
      excellent: 'bg-green-100 text-green-800',
      good: 'bg-blue-100 text-blue-800',
      fair: 'bg-yellow-100 text-yellow-800',
      poor: 'bg-red-100 text-red-800'
    };

    return (
      <Badge className={colorMap[condition] || 'bg-gray-100 text-gray-800'}>
        {condition.charAt(0).toUpperCase() + condition.slice(1)}
      </Badge>
    );
  };

  const formatDate = (date?: string) => {
    if (!date) return 'N/A';
    return format(new Date(date), 'MMM d, yyyy');
  };

  if (loading) {
    return (
      <ContentLayout title='Resource Details'>
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
                <Link href='/resources/resources'>Resources</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Resource Details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='flex items-center justify-center min-h-[400px]'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      </ContentLayout>
    );
  }

  if (error) {
    return (
      <ContentLayout title='Resource Details'>
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
                <Link href='/resources/resources'>Resources</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Resource Details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>{error}</p>
          <Button variant='outline' asChild>
            <Link href='/resources/resources'>Back to Resources</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  if (!resource) {
    return (
      <ContentLayout title='Resource Details'>
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
                <Link href='/resources/resources'>Resources</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Resource Details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className='text-center py-8'>
          <p className='text-destructive mb-4'>Resource not found</p>
          <Button variant='outline' asChild>
            <Link href='/resources/resources'>Back to Resources</Link>
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Resource: ${resource.resource_name}`}>
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
              <Link href='/resources/resources'>Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{resource.resource_name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        <div className='flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4'>
          <div>
            <h1 className='text-2xl font-bold py-1'>
              {resource.resource_name}
            </h1>
            <p className='text-sm sm:text-base text-muted-foreground'>
              {resource.resource_type.charAt(0).toUpperCase() +
                resource.resource_type.slice(1)}{' '}
              • {resource.category?.category_name || 'Uncategorized'}
            </p>
          </div>
          <div className='flex space-x-2'>
            <Link href={`/resources/${resource.id}/edit`}>
              <Button variant='outline'>
                <PenSquare className='h-4 w-4 mr-2' />
                Edit
              </Button>
            </Link>
            <Button variant='destructive' onClick={handleDelete}>
              <Trash2 className='h-4 w-4 mr-2' />
              Delete
            </Button>
          </div>
        </div>

        <div className='grid grid-cols-1 md:grid-cols-3 gap-6'>
          {/* Main Details */}
          <Card className='md:col-span-2'>
            <CardHeader>
              <CardTitle>Resource Details</CardTitle>
            </CardHeader>
            <CardContent className='space-y-6'>
              {resource.description && (
                <div>
                  <h3 className='text-lg font-medium mb-2'>Description</h3>
                  <p className='text-muted-foreground'>
                    {resource.description}
                  </p>
                </div>
              )}

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                    Type
                  </h3>
                  <p>
                    {resource.resource_type.charAt(0).toUpperCase() +
                      resource.resource_type.slice(1)}
                  </p>
                </div>
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                    Category
                  </h3>
                  <div className='flex items-center'>
                    <Tag className='h-4 w-4 mr-2 text-muted-foreground' />
                    <Link
                      href={`/resources/categories/${resource.category_id}`}
                      className='hover:underline'
                    >
                      {resource.category?.category_name || 'Uncategorized'}
                    </Link>
                  </div>
                </div>
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                    Condition
                  </h3>
                  {getConditionBadge(resource.condition)}
                </div>
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                    Shareable
                  </h3>
                  {resource.is_shareable ? (
                    <Badge variant='outline' className='bg-green-50'>
                      <Share2 className='h-3 w-3 mr-1' />
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant='outline' className='bg-red-50'>
                      No
                    </Badge>
                  )}
                </div>
                {resource.value !== undefined && (
                  <div>
                    <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                      Value
                    </h3>
                    <p>
                      {typeof resource.value === 'number'
                        ? `$${resource.value.toLocaleString()}`
                        : 'N/A'}
                    </p>
                  </div>
                )}
                {resource.acquisition_date && (
                  <div>
                    <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                      Acquisition Date
                    </h3>
                    <div className='flex items-center'>
                      <Calendar className='h-4 w-4 mr-2 text-muted-foreground' />
                      {formatDate(resource.acquisition_date)}
                    </div>
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <h3 className='text-lg font-medium mb-2'>Location</h3>
                <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                  <div>
                    <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                      Institution
                    </h3>
                    <div className='flex items-center'>
                      <Building2 className='h-4 w-4 mr-2 text-muted-foreground' />
                      <Link
                        href={`/organizations/institutions/${resource.institution_id}`}
                        className='hover:underline'
                      >
                        {resource.institution?.name || 'N/A'}
                      </Link>
                    </div>
                  </div>
                  {resource.department && (
                    <div>
                      <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                        Department
                      </h3>
                      <Link
                        href={`/organizations/institutions/${resource.institution_id}/departments/${resource.department_id}`}
                        className='hover:underline'
                      >
                        {resource.department.department_name}
                      </Link>
                    </div>
                  )}
                  {resource.building && (
                    <div>
                      <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                        Building
                      </h3>
                      <p>{resource.building}</p>
                    </div>
                  )}
                  {resource.room && (
                    <div>
                      <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                        Room
                      </h3>
                      <p>{resource.room}</p>
                    </div>
                  )}
                </div>
              </div>

              {resource.specifications &&
                Object.keys(resource.specifications).length > 0 && (
                  <>
                    <Separator />
                    <div>
                      <h3 className='text-lg font-medium mb-2'>
                        Specifications
                      </h3>
                      <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
                        {Object.entries(resource.specifications).map(
                          ([key, value]) => (
                            <div key={key}>
                              <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                                {key}
                              </h3>
                              <p>{value}</p>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </>
                )}
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className='space-y-6'>
            <Card>
              <CardHeader>
                <CardTitle>Ownership</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-4'>
                  <div>
                    <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                      Owner Type
                    </h3>
                    <p>
                      {resource.owner_type.charAt(0).toUpperCase() +
                        resource.owner_type.slice(1)}
                    </p>
                  </div>
                  <div>
                    <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                      Owner
                    </h3>
                    {resource.owner_type === 'institution' &&
                    resource.institution ? (
                      <Link
                        href={`/organizations/institutions/${resource.owner_id}`}
                        className='hover:underline'
                      >
                        {resource.institution.name}
                      </Link>
                    ) : resource.owner_type === 'department' &&
                      resource.department ? (
                      <Link
                        href={`/organizations/institutions/${resource.institution_id}/departments/${resource.owner_id}`}
                        className='hover:underline'
                      >
                        {resource.department.department_name}
                      </Link>
                    ) : (
                      <p>{resource.owner_id}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-4'>
                  <div>
                    <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                      Status
                    </h3>
                    {resource.is_active ? (
                      <Badge variant='outline' className='bg-green-50'>
                        Active
                      </Badge>
                    ) : (
                      <Badge variant='outline' className='bg-red-50'>
                        Inactive
                      </Badge>
                    )}
                  </div>
                  <div>
                    <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                      Created
                    </h3>
                    <p>{formatDate(resource.created_at)}</p>
                  </div>
                  <div>
                    <h3 className='text-sm font-medium text-muted-foreground mb-1'>
                      Last Updated
                    </h3>
                    <p>{formatDate(resource.updated_at)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className='space-y-2'>
                  <Link
                    href={`/resources/reservations/new?resource_id=${resource.id}`}
                  >
                    <Button className='w-full'>
                      <Calendar className='h-4 w-4 mr-2' />
                      Reserve
                    </Button>
                  </Link>
                  <Link href={`/resources/${resource.id}/edit`}>
                    <Button variant='outline' className='w-full'>
                      <PenSquare className='h-4 w-4 mr-2' />
                      Edit
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ContentLayout>
  );
}
