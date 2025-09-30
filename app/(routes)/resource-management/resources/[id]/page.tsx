// app/(routes)/resource-management/resources/[id]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Package,
  MapPin,
  Calendar,
  Users,
  Settings,
  Image as ImageIcon,
  BarChart3,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  useResource,
  useResourceOperations
} from '@/hooks/resource-management/use-resources';
import { useResourceUsageStats } from '@/hooks/resource-management/use-resources';
import { formatDate } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import Image from 'next/image';

// Import tab components
import {
  OverviewTab,
  LocationTab,
  BookingConfigTab,
  ApprovalConfigTab,
  CustomAttributesTab,
  ImagesTab,
  UsageStatsTab
} from './_components';

interface ResourceDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function ResourceDetailsPage({
  params
}: ResourceDetailsPageProps) {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);

  // Unwrap params
  useEffect(() => {
    params.then((resolvedParams) => {
      setId(resolvedParams.id);
    });
  }, [params]);

  const { resource, loading, error } = useResource(id || undefined);
  const { deleteResource, loading: deleting } = useResourceOperations();
  const { stats, loading: loadingStats } = useResourceUsageStats(
    id || undefined
  );

  const handleDelete = async () => {
    if (!resource) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete "${resource.name}"? This action cannot be undone.`
    );

    if (confirmed && id) {
      const success = await deleteResource(id);
      if (success) {
        router.push('/resource-management/resources');
        router.refresh();
      }
    }
  };

  if (loading) {
    return (
      <ContentLayout title='Resource Details'>
        <div className='flex min-h-[400px] items-center justify-center py-6'>
          <Card className='p-8 text-center'>
            <Loader2 className='h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground' />
            <p className='text-muted-foreground'>Loading resource details...</p>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  if (error || !resource) {
    return (
      <ContentLayout title='Resource Details'>
        <div className='flex min-h-[400px] items-center justify-center py-6'>
          <Card className='p-8 text-center'>
            <XCircle className='h-12 w-12 text-destructive mx-auto mb-4' />
            <h2 className='text-xl font-semibold mb-2'>Resource Not Found</h2>
            <p className='text-muted-foreground mb-4'>
              {error || 'The resource you are looking for does not exist'}
            </p>
            <Button
              onClick={() => router.push('/resource-management/resources')}
            >
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back to Resources
            </Button>
          </Card>
        </div>
      </ContentLayout>
    );
  }

  const getStatusIcon = () => {
    switch (resource.status) {
      case 'available':
        return <CheckCircle2 className='h-5 w-5 text-green-600' />;
      case 'occupied':
        return <Clock className='h-5 w-5 text-blue-600' />;
      case 'maintenance':
        return <AlertCircle className='h-5 w-5 text-yellow-600' />;
      case 'retired':
        return <XCircle className='h-5 w-5 text-gray-600' />;
      default:
        return <Package className='h-5 w-5' />;
    }
  };

  const getStatusColor = () => {
    switch (resource.status) {
      case 'available':
        return 'bg-green-100 text-green-800';
      case 'occupied':
        return 'bg-blue-100 text-blue-800';
      case 'maintenance':
        return 'bg-yellow-100 text-yellow-800';
      case 'retired':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

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
              <Link href='/resource-management'>Resource Management</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resource-management/resources'>Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{resource.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='space-y-6 mt-4'>
        {/* Header */}
        <div className='flex items-start justify-between'>
          <div className='flex items-start gap-4'>
            {/* Resource Image */}
            {resource.image_urls && resource.image_urls.length > 0 ? (
              <Image
                src={resource.image_urls[0]}
                alt={resource.name}
                className='h-20 w-20 rounded-lg object-cover border'
                width={80}
                height={80}
              />
            ) : (
              <div className='flex h-20 w-20 items-center justify-center rounded-lg bg-gray-100 border'>
                <Package className='h-10 w-10 text-gray-400' />
              </div>
            )}

            <div className='space-y-2'>
              <div className='flex items-center gap-3'>
                <h1 className='text-3xl font-bold tracking-tight'>
                  {resource.name}
                </h1>
                <Badge className={getStatusColor()}>
                  <div className='flex items-center gap-1'>
                    {getStatusIcon()}
                    {resource.status}
                  </div>
                </Badge>
              </div>

              {resource.description && (
                <p className='text-muted-foreground max-w-2xl'>
                  {resource.description}
                </p>
              )}

              <div className='flex items-center gap-4 text-sm text-muted-foreground'>
                <div className='flex items-center gap-1'>
                  <MapPin className='h-4 w-4' />
                  {resource.institution?.name}
                  {resource.department &&
                    ` - ${resource.department.department_name}`}
                </div>
                <div className='flex items-center gap-1'>
                  <Calendar className='h-4 w-4' />
                  Created {formatDate(resource.created_at)}
                </div>
              </div>
            </div>
          </div>

          <div className='flex items-center gap-2'>
            <Button variant='outline' onClick={() => router.back()}>
              <ArrowLeft className='mr-2 h-4 w-4' />
              Back
            </Button>
            <Link href={`/resource-management/resources/${id}/edit`}>
              <Button variant='outline'>
                <Edit className='mr-2 h-4 w-4' />
                Edit
              </Button>
            </Link>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              ) : (
                <Trash2 className='mr-2 h-4 w-4' />
              )}
              Delete
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>
                Current Stock
              </CardTitle>
              <Package className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {resource.current_stock_quantity || 0}
              </div>
              <p className='text-xs text-muted-foreground'>
                of {resource.initial_stock_quantity || 0} initial
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>
                Total Reservations
              </CardTitle>
              <Calendar className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {stats?.totalReservations || 0}
              </div>
              <p className='text-xs text-muted-foreground'>
                {stats?.completedReservations || 0} completed
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>
                Utilization Rate
              </CardTitle>
              <BarChart3 className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {stats?.utilizationRate?.toFixed(1) || 0}%
              </div>
              <p className='text-xs text-muted-foreground'>
                Based on completed bookings
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className='flex flex-row items-center justify-between pb-2'>
              <CardTitle className='text-sm font-medium'>Usage Count</CardTitle>
              <Users className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {resource.usage_count || 0}
              </div>
              <p className='text-xs text-muted-foreground'>Total uses</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue='overview' className='space-y-6'>
          <TabsList className='grid w-full grid-cols-7'>
            <TabsTrigger value='overview'>
              <Package className='h-4 w-4 mr-2' />
              Overview
            </TabsTrigger>
            <TabsTrigger value='location'>
              <MapPin className='h-4 w-4 mr-2' />
              Location
            </TabsTrigger>
            <TabsTrigger value='booking'>
              <Calendar className='h-4 w-4 mr-2' />
              Booking
            </TabsTrigger>
            <TabsTrigger value='approval'>
              <CheckCircle2 className='h-4 w-4 mr-2' />
              Approval
            </TabsTrigger>
            <TabsTrigger value='attributes'>
              <Settings className='h-4 w-4 mr-2' />
              Attributes
            </TabsTrigger>
            <TabsTrigger value='images'>
              <ImageIcon className='h-4 w-4 mr-2' />
              Images
            </TabsTrigger>
            <TabsTrigger value='stats'>
              <BarChart3 className='h-4 w-4 mr-2' />
              Statistics
            </TabsTrigger>
          </TabsList>

          <TabsContent value='overview'>
            <OverviewTab resource={resource} />
          </TabsContent>

          <TabsContent value='location'>
            <LocationTab resource={resource} />
          </TabsContent>

          <TabsContent value='booking'>
            <BookingConfigTab resource={resource} />
          </TabsContent>

          <TabsContent value='approval'>
            <ApprovalConfigTab resource={resource} />
          </TabsContent>

          <TabsContent value='attributes'>
            <CustomAttributesTab resource={resource} />
          </TabsContent>

          <TabsContent value='images'>
            <ImagesTab resource={resource} />
          </TabsContent>

          <TabsContent value='stats'>
            <UsageStatsTab
              resource={resource}
              stats={stats}
              loading={loadingStats}
            />
          </TabsContent>
        </Tabs>
      </div>
    </ContentLayout>
  );
}
