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
import { BeatLoader } from 'react-spinners';

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
      `⚠️ DELETE RESOURCE: "${resource.name}"\n\n` +
      `This will permanently delete:\n` +
      `• The resource and all its details\n` +
      `• All reservations (pending, approved, completed)\n` +
      `• All approval records\n` +
      `• All usage history and logs\n` +
      `• All uploaded images\n\n` +
      `This action CANNOT be undone.\n\n` +
      `Are you sure you want to proceed?`
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
      <div className='flex justify-center items-center p-6'>
        <BeatLoader color='#00e902' />
      </div>
    );
  }

  if (error || !resource) {
    return (
      <ContentLayout title='Resource Details'>
        <div className='flex justify-center items-center p-6'>
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

      <div className='space-y-6 mt-6'>
        {/* Header Card */}
        <Card>
          <CardContent className='p-6'>
            <div className='flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between'>
              <div className='flex flex-col gap-6 sm:flex-row sm:items-start flex-1'>
                {/* Resource Image */}
                <div className='shrink-0'>
                  {resource.image_urls && resource.image_urls.length > 0 ? (
                    <Image
                      src={resource.image_urls[0]}
                      alt={resource.name}
                      className='h-24 w-24 rounded-xl object-cover border-2 border-border shadow-sm'
                      width={500}
                      height={500}
                    />
                  ) : (
                    <div className='flex h-24 w-24 items-center justify-center rounded-xl bg-muted border-2 border-border'>
                      <Package className='h-12 w-12 text-muted-foreground' />
                    </div>
                  )}
                </div>

                {/* Resource Info */}
                <div className='space-y-3 flex-1 min-w-0'>
                  <div className='space-y-2'>
                    <div className='flex flex-wrap items-center gap-3'>
                      <h1 className='text-2xl sm:text-3xl font-bold tracking-tight'>
                        {resource.name}
                      </h1>
                      <Badge className={getStatusColor()}>
                        <div className='flex items-center gap-1.5'>
                          {getStatusIcon()}
                          <span className='capitalize'>{resource.status}</span>
                        </div>
                      </Badge>
                    </div>

                    {resource.description && (
                      <p className='text-sm sm:text-base text-muted-foreground line-clamp-2'>
                        {resource.description}
                      </p>
                    )}
                  </div>

                  <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4 text-sm text-muted-foreground'>
                    <div className='flex items-center gap-2'>
                      <MapPin className='h-4 w-4 shrink-0' />
                      <span className='truncate'>
                        {resource.institution?.name}
                        {resource.department &&
                          ` - ${resource.department.department_name}`}
                      </span>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Calendar className='h-4 w-4 shrink-0' />
                      <span>Created {formatDate(resource.created_at)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className='flex flex-row gap-2 sm:gap-3 lg:flex-col xl:flex-row lg:shrink-0'>
                <Button
                  variant='outline'
                  onClick={() => router.back()}
                  className='flex-1 lg:flex-none'
                >
                  <ArrowLeft className='mr-2 h-4 w-4' />
                  <span className='hidden sm:inline'>Back</span>
                </Button>
                <Link
                  href={`/resource-management/resources/${id}/edit`}
                  className='flex-1 lg:flex-none'
                >
                  <Button variant='outline' className='w-full'>
                    <Edit className='mr-2 h-4 w-4' />
                    <span className='hidden sm:inline'>Edit</span>
                  </Button>
                </Link>
                <Button
                  variant='destructive'
                  onClick={handleDelete}
                  disabled={deleting}
                  className='flex-1 lg:flex-none'
                >
                  {deleting ? (
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  ) : (
                    <Trash2 className='mr-2 h-4 w-4' />
                  )}
                  <span className='hidden sm:inline'>Delete</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Card className='hover:shadow-md transition-shadow'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-3'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Current Stock
              </CardTitle>
              <div className='h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center'>
                <Package className='h-5 w-5 text-primary' />
              </div>
            </CardHeader>
            <CardContent className='space-y-1'>
              <div className='text-3xl font-bold'>
                {resource.current_stock_quantity || 0}
              </div>
              <p className='text-xs text-muted-foreground'>
                of {resource.initial_stock_quantity || 0} initial
              </p>
            </CardContent>
          </Card>

          <Card className='hover:shadow-md transition-shadow'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-3'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Total Reservations
              </CardTitle>
              <div className='h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center'>
                <Calendar className='h-5 w-5 text-blue-600' />
              </div>
            </CardHeader>
            <CardContent className='space-y-1'>
              <div className='text-3xl font-bold'>
                {stats?.totalReservations || 0}
              </div>
              <p className='text-xs text-muted-foreground'>
                {stats?.completedReservations || 0} completed
              </p>
            </CardContent>
          </Card>

          <Card className='hover:shadow-md transition-shadow'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-3'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Utilization Rate
              </CardTitle>
              <div className='h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center'>
                <BarChart3 className='h-5 w-5 text-green-600' />
              </div>
            </CardHeader>
            <CardContent className='space-y-1'>
              <div className='text-3xl font-bold'>
                {stats?.utilizationRate?.toFixed(1) || 0}%
              </div>
              <p className='text-xs text-muted-foreground'>
                Based on completed bookings
              </p>
            </CardContent>
          </Card>

          <Card className='hover:shadow-md transition-shadow'>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-3'>
              <CardTitle className='text-sm font-medium text-muted-foreground'>
                Usage Count
              </CardTitle>
              <div className='h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center'>
                <Users className='h-5 w-5 text-orange-600' />
              </div>
            </CardHeader>
            <CardContent className='space-y-1'>
              <div className='text-3xl font-bold'>
                {resource.usage_count || 0}
              </div>
              <p className='text-xs text-muted-foreground'>Total uses</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue='overview' className='space-y-6'>
          <TabsList className='w-full grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 h-auto gap-2 bg-muted/50 p-1'>
            <TabsTrigger
              value='overview'
              className='flex items-center gap-2 data-[state=active]:bg-background'
            >
              <Package className='h-4 w-4' />
              <span className='hidden sm:inline'>Overview</span>
            </TabsTrigger>
            <TabsTrigger
              value='location'
              className='flex items-center gap-2 data-[state=active]:bg-background'
            >
              <MapPin className='h-4 w-4' />
              <span className='hidden sm:inline'>Location</span>
            </TabsTrigger>
            <TabsTrigger
              value='booking'
              className='flex items-center gap-2 data-[state=active]:bg-background'
            >
              <Calendar className='h-4 w-4' />
              <span className='hidden sm:inline'>Booking</span>
            </TabsTrigger>
            <TabsTrigger
              value='approval'
              className='flex items-center gap-2 data-[state=active]:bg-background'
            >
              <CheckCircle2 className='h-4 w-4' />
              <span className='hidden sm:inline'>Approval</span>
            </TabsTrigger>
            <TabsTrigger
              value='attributes'
              className='flex items-center gap-2 data-[state=active]:bg-background'
            >
              <Settings className='h-4 w-4' />
              <span className='hidden sm:inline'>Attributes</span>
            </TabsTrigger>
            <TabsTrigger
              value='images'
              className='flex items-center gap-2 data-[state=active]:bg-background'
            >
              <ImageIcon className='h-4 w-4' />
              <span className='hidden sm:inline'>Images</span>
            </TabsTrigger>
            <TabsTrigger
              value='stats'
              className='flex items-center gap-2 data-[state=active]:bg-background'
            >
              <BarChart3 className='h-4 w-4' />
              <span className='hidden sm:inline'>Statistics</span>
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
