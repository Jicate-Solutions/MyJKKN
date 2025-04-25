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
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { DigitalSharingPolicyService } from '@/lib/services/resource/digital/digital-sharing-policy-service';
import type {
  DigitalSharingPolicy,
  UpdateDigitalSharingPolicyDto
} from '@/types/digital-resources';
import { PolicyForm } from '../../_components/policy-form';

interface EditPolicyPageProps {
  params: Promise<{ id: string }>;
}

export default function EditPolicyPage({ params }: EditPolicyPageProps) {
  const { id } = use
  (params);
  const router = useRouter();
  const [policy, setPolicy] = useState<DigitalSharingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleSubmit = async (data: UpdateDigitalSharingPolicyDto) => {
    try {
      setSubmitting(true);
      await DigitalSharingPolicyService.updateDigitalSharingPolicy(id, data);
      toast.success('Digital sharing policy updated successfully');
      router.push(`/resources/digital-resources/policies/${id}`);
    } catch (err) {
      console.error('Error updating policy:', err);
      toast.error('Failed to update digital sharing policy');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ContentLayout title='Loading Policy'>
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

  // Prepare initialData from the fetched policy
  const initialData = {
    category_id: policy.category_id,
    institution_id: policy.institution_id || 'global',
    approval_required: policy.approval_required,
    max_concurrent_users: policy.max_concurrent_users,
    advance_notice_required: policy.advance_notice_required,
    pricing_model: policy.pricing_model,
    access_window: policy.access_window,
    is_active: policy.is_active
  };

  return (
    <ContentLayout title='Edit Digital Sharing Policy'>
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
            <BreadcrumbLink asChild>
              <Link href={`/resources/digital-resources/policies/${id}`}>
                Policy Details
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit Policy</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='flex items-center mt-6'>
        <Button
          variant='outline'
          size='sm'
          onClick={() =>
            router.push(`/resources/digital-resources/policies/${id}`)
          }
          className='mr-2'
        >
          <ArrowLeft className='mr-2 h-4 w-4' />
          Back to Policy Details
        </Button>
      </div>

      <div className='mt-6'>
        <h1 className='text-2xl font-bold mb-4'>Edit Digital Sharing Policy</h1>

        <Card>
          <CardHeader>
            <CardTitle>Edit Digital Sharing Policy</CardTitle>
            <CardDescription>
              Update how digital resources can be shared and accessed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PolicyForm
              onSubmit={handleSubmit}
              isSubmitting={submitting}
              initialData={initialData}
              isEditing={true}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
