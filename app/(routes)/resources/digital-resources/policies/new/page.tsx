'use client';

import React, { useState } from 'react';
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
import { toast } from 'react-hot-toast';
import { useDigitalSharingPolicies } from '@/hooks/resource/digital/use-digital-sharing-policies';
import type {
  CreateDigitalSharingPolicyDto,
  UpdateDigitalSharingPolicyDto
} from '@/types/digital-resources';
import { PolicyForm } from '../_components/policy-form';

export default function NewDigitalSharingPolicyPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createPolicy } = useDigitalSharingPolicies();

  const handleSubmit = async (
    data: CreateDigitalSharingPolicyDto | UpdateDigitalSharingPolicyDto
  ) => {
    try {
      setIsSubmitting(true);
      const success = await createPolicy(data as CreateDigitalSharingPolicyDto);
      if (success) {
        toast.success('Digital sharing policy created successfully');
        router.push('/resources/digital-resources/policies');
      }
    } catch (error) {
      console.error('Error creating digital sharing policy:', error);
      toast.error('Failed to create digital sharing policy');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ContentLayout title='New Digital Sharing Policy'>
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
            <BreadcrumbPage>New Policy</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className='mt-6'>
        <h1 className='text-2xl font-bold mb-4'>
          Create Digital Sharing Policy
        </h1>

        <Card>
          <CardHeader>
            <CardTitle>New Digital Sharing Policy</CardTitle>
            <CardDescription>
              Define how digital resources can be shared and accessed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PolicyForm
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              initialData={{
                category_id: '',
                approval_required: false,
                max_concurrent_users: 0,
                advance_notice_required: 0,
                is_active: true
              }}
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
