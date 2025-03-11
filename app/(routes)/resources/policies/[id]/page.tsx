'use client';

import { use } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
import { Loader2, PenSquare, Trash2, Share2 } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { SharingPolicy } from '@/types/resources';
import { SharingPolicyService } from '@/lib/services/resource/sharing-policy-service';

interface PolicyDetailsPageProps {
  params: Promise<{ id: string }>;
}

export default function PolicyDetailsPage({ params }: PolicyDetailsPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<SharingPolicy | null>(null);

  useEffect(() => {
    async function fetchPolicy() {
      try {
        setLoading(true);
        setError(null);
        const result = await SharingPolicyService.getSharingPolicy(id);
        setPolicy(result);
      } catch (err) {
        console.error('Error fetching policy:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch policy');
      } finally {
        setLoading(false);
      }
    }

    fetchPolicy();
  }, [id]);

  const handleDelete = async () => {
    if (!policy) return;

    if (
      window.confirm(`Are you sure you want to delete this sharing policy?`)
    ) {
      try {
        setLoading(true);
        await SharingPolicyService.deleteSharingPolicy(id);
        toast.success('Policy deleted successfully');
        router.push('/resources/policies');
      } catch (err) {
        console.error('Error deleting policy:', err);
        toast.error('Failed to delete policy');
        setLoading(false);
      }
    }
  };

  const formatDate = (date?: string) => {
    if (!date) return 'N/A';
    return format(new Date(date), 'MMM d, yyyy');
  };

  return (
    <ContentLayout title='Sharing Policy Details'>
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
              <Link href='/resources/policies'>Sharing Policies</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>
              {loading ? 'Loading...' : policy ? 'Policy Details' : 'Not Found'}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {loading ? (
        <div className='flex justify-center items-center py-12'>
          <Loader2 className='h-8 w-8 animate-spin' />
        </div>
      ) : error ? (
        <div className='text-center py-12'>
          <p className='text-destructive'>{error}</p>
          <Button
            variant='outline'
            onClick={() => router.push('/resources/policies')}
            className='mt-4'
          >
            Back to Policies
          </Button>
        </div>
      ) : policy ? (
        <div className='space-y-6 mt-6'>
          <div className='flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4'>
            <div>
              <h1 className='text-2xl font-bold'>
                {policy.resource_type?.category_name || 'All Types'} Sharing
                Policy
              </h1>
              <div className='flex items-center mt-2'>
                <Badge variant={policy.is_active ? 'default' : 'secondary'}>
                  {policy.is_active ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button variant='outline' asChild>
                <Link href={`/resources/policies/${id}/edit`}>
                  <PenSquare className='mr-2 h-4 w-4' />
                  Edit Policy
                </Link>
              </Button>
              <Button variant='destructive' onClick={handleDelete}>
                <Trash2 className='mr-2 h-4 w-4' />
                Delete Policy
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Policy Details</CardTitle>
              <CardDescription>
                Sharing configuration for resources
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div>
                  <h3 className='text-sm font-medium text-gray-500'>
                    Resource Type
                  </h3>
                  <p className='mt-1 text-lg'>
                    {policy.resource_type?.category_name || 'All Types'}
                  </p>
                </div>
                <div>
                  <h3 className='text-sm font-medium text-gray-500'>
                    Institution
                  </h3>
                  <p className='mt-1 text-lg'>
                    {policy.institution?.name || 'All Institutions'}
                  </p>
                </div>
              </div>

              <Separator />

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div>
                  <h3 className='text-sm font-medium text-gray-500'>
                    Approval Required
                  </h3>
                  <p className='mt-1 text-lg'>
                    {policy.approval_required ? 'Yes' : 'No'}
                  </p>
                </div>
                <div>
                  <h3 className='text-sm font-medium text-gray-500'>
                    Max Reservation Duration
                  </h3>
                  <p className='mt-1 text-lg'>
                    {policy.max_reservation_duration} hours
                  </p>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div>
                  <h3 className='text-sm font-medium text-gray-500'>
                    Advance Notice Required
                  </h3>
                  <p className='mt-1 text-lg'>
                    {policy.advance_notice_required} hours
                  </p>
                </div>
                <div>
                  <h3 className='text-sm font-medium text-gray-500'>Status</h3>
                  <div className='mt-1 text-lg'>
                    <Badge variant={policy.is_active ? 'default' : 'secondary'}>
                      {policy.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>
              </div>

              {policy.cancellation_policy && (
                <div>
                  <h3 className='text-sm font-medium text-gray-500'>
                    Cancellation Policy
                  </h3>
                  <p className='mt-1'>{policy.cancellation_policy}</p>
                </div>
              )}

              <Separator />

              <div>
                <h3 className='text-sm font-medium text-gray-500'>
                  Priority Levels
                </h3>
                <div className='mt-2 space-y-2'>
                  <div className='flex justify-between'>
                    <span>Owner Priority:</span>
                    <span>{policy.priority_levels.owner_priority}</span>
                  </div>
                  <div className='flex justify-between'>
                    <span>Same Institution Priority:</span>
                    <span>
                      {policy.priority_levels.same_institution_priority}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span>Other Institution Priority:</span>
                    <span>
                      {policy.priority_levels.other_institution_priority}
                    </span>
                  </div>
                </div>
              </div>

              {policy.pricing_model && (
                <>
                  <Separator />
                  <div>
                    <h3 className='text-sm font-medium text-gray-500'>
                      Pricing Model
                    </h3>
                    <div className='mt-2 space-y-2'>
                      <div className='flex justify-between'>
                        <span>Internal Rate:</span>
                        <span>
                          {policy.pricing_model.internal_rate}{' '}
                          {policy.pricing_model.rate_unit}
                        </span>
                      </div>
                      <div className='flex justify-between'>
                        <span>External Rate:</span>
                        <span>
                          {policy.pricing_model.external_rate}{' '}
                          {policy.pricing_model.rate_unit}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <Separator />

              <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
                <div>
                  <h3 className='text-sm font-medium text-gray-500'>
                    Created At
                  </h3>
                  <p className='mt-1'>{formatDate(policy.created_at)}</p>
                </div>
                <div>
                  <h3 className='text-sm font-medium text-gray-500'>
                    Last Updated
                  </h3>
                  <p className='mt-1'>{formatDate(policy.updated_at)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className='text-center py-12'>
          <Share2 className='h-12 w-12 mx-auto text-muted-foreground' />
          <h2 className='mt-4 text-xl font-semibold'>Policy Not Found</h2>
          <p className='mt-2 text-muted-foreground'>
            The sharing policy you're looking for doesn't exist or has been
            removed.
          </p>
          <Button
            variant='outline'
            onClick={() => router.push('/resources/policies')}
            className='mt-4'
          >
            Back to Policies
          </Button>
        </div>
      )}
    </ContentLayout>
  );
}
