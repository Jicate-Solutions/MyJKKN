'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import { Button } from '@/components/ui/button';
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
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Loader2,
  PenSquare,
  Trash2
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { toast } from 'react-hot-toast';
import { format } from 'date-fns';
import { DigitalSharingPolicyService } from '@/lib/services/resource/digital/digital-sharing-policy-service';
import type { DigitalSharingPolicy } from '@/types/digital-resources';

interface PolicyDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function PolicyDetailPage({ params }: PolicyDetailPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [policy, setPolicy] = useState<DigitalSharingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchPolicy = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await DigitalSharingPolicyService.getDigitalSharingPolicy(
          id
        );
        setPolicy(data);
      } catch (err) {
        console.error('Error fetching policy:', err);
        setError('Failed to load policy details');
      } finally {
        setLoading(false);
      }
    };

    fetchPolicy();
  }, [id]);

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await DigitalSharingPolicyService.deleteDigitalSharingPolicy(id);
      toast.success('Digital sharing policy deleted successfully');
      router.push('/resources/digital-resources/policies');
    } catch (err) {
      console.error('Error deleting policy:', err);
      toast.error('Failed to delete digital sharing policy');
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not specified';
    try {
      return format(new Date(dateString), 'MMM d, yyyy');
    } catch (e) {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <ContentLayout title='Loading Policy Details'>
        <div className='flex items-center justify-center h-64'>
          <Loader2 className='h-10 w-10 animate-spin text-primary' />
        </div>
      </ContentLayout>
    );
  }

  if (error || !policy) {
    return (
      <ContentLayout title='Error Loading Policy'>
        <div className='flex flex-col items-center justify-center h-64'>
          <AlertTriangle className='h-10 w-10 text-destructive mb-4' />
          <h2 className='text-xl font-bold mb-2'>Failed to Load Policy</h2>
          <p className='text-muted-foreground mb-4'>
            {error || 'Policy not found'}
          </p>
          <Button
            onClick={() => router.push('/resources/digital-resources/policies')}
          >
            Back to Policies
          </Button>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title='Digital Sharing Policy Details'>
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
              <Link href='/resources/digital-resources'>Digital Resources</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href='/resources/digital-resources/policies'>
                Sharing Policies
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Policy Details</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='flex items-center justify-between mt-6'>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => router.push('/resources/digital-resources/policies')}
          >
            <ArrowLeft className='mr-2 h-4 w-4' />
            Back to Policies
          </Button>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() =>
              router.push(`/resources/digital-resources/policies/${id}/edit`)
            }
          >
            <PenSquare className='mr-2 h-4 w-4' />
            Edit Policy
          </Button>
          <Button
            variant='destructive'
            size='sm'
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className='mr-2 h-4 w-4' />
            Delete Policy
          </Button>
        </div>
      </div>

      <Card className='mt-6'>
        <CardHeader>
          <div className='flex justify-between items-start'>
            <div>
              <CardTitle className='text-2xl'>
                {policy.category?.category_name || 'All Categories'} Policy
              </CardTitle>
              <CardDescription>
                Digital resource sharing policy details
              </CardDescription>
            </div>
            <Badge
              variant={policy.is_active ? 'default' : 'secondary'}
              className='text-sm'
            >
              {policy.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
            <div className='space-y-4'>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground'>
                  Resource Category
                </h3>
                <p className='text-base font-medium'>
                  {policy.category?.category_name || 'All Categories'}
                </p>
              </div>

              <div>
                <h3 className='text-sm font-medium text-muted-foreground'>
                  Institution
                </h3>
                <p className='text-base font-medium'>
                  {policy.institution?.name || 'Global (All Institutions)'}
                </p>
              </div>

              <div>
                <h3 className='text-sm font-medium text-muted-foreground'>
                  Approval Required
                </h3>
                <p className='text-base font-medium'>
                  {policy.approval_required ? 'Yes' : 'No'}
                </p>
              </div>

              <div>
                <h3 className='text-sm font-medium text-muted-foreground'>
                  Maximum Concurrent Users
                </h3>
                <p className='text-base font-medium'>
                  {policy.max_concurrent_users || 'Unlimited'}
                </p>
              </div>
            </div>

            <div className='space-y-4'>
              <div>
                <h3 className='text-sm font-medium text-muted-foreground'>
                  Advance Notice Required
                </h3>
                <p className='text-base font-medium'>
                  {policy.advance_notice_required
                    ? `${policy.advance_notice_required} hours`
                    : 'None'}
                </p>
              </div>

              {policy.pricing_model && (
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground'>
                    Pricing Model
                  </h3>
                  <div className='mt-1 space-y-1'>
                    <p className='text-sm'>
                      <span className='font-medium'>Internal Rate:</span>{' '}
                      {policy.pricing_model.internal_rate}{' '}
                      {policy.pricing_model.rate_unit}
                    </p>
                    <p className='text-sm'>
                      <span className='font-medium'>External Rate:</span>{' '}
                      {policy.pricing_model.external_rate}{' '}
                      {policy.pricing_model.rate_unit}
                    </p>
                  </div>
                </div>
              )}

              {policy.access_window && (
                <div>
                  <h3 className='text-sm font-medium text-muted-foreground'>
                    Access Window
                  </h3>
                  <div className='mt-1 space-y-1'>
                    <p className='text-sm'>
                      <span className='font-medium'>Start Date:</span>{' '}
                      {policy.access_window.start_date
                        ? formatDate(policy.access_window.start_date)
                        : 'Not specified'}
                    </p>
                    <p className='text-sm'>
                      <span className='font-medium'>End Date:</span>{' '}
                      {policy.access_window.end_date
                        ? formatDate(policy.access_window.end_date)
                        : 'Not specified'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className='border-t pt-4'>
            <h3 className='text-sm font-medium text-muted-foreground mb-2'>
              Policy Details
            </h3>
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <div>
                <p className='text-sm'>
                  <span className='font-medium'>Created:</span>{' '}
                  {formatDate(policy.created_at)}
                </p>
              </div>
              <div>
                <p className='text-sm'>
                  <span className='font-medium'>Last Updated:</span>{' '}
                  {formatDate(policy.updated_at)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
        <CardFooter className='flex justify-between'>
          <Button variant='outline' onClick={() => router.back()}>
            Back
          </Button>
          <Button
            onClick={() =>
              router.push(`/resources/digital-resources/policies/${id}/edit`)
            }
          >
            Edit Policy
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-destructive' />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this digital sharing policy? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant='destructive'
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                  Deleting...
                </>
              ) : (
                'Delete Policy'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
