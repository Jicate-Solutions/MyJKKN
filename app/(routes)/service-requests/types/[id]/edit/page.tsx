'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { ServiceTypeForm } from '../../../_components/service-type-form';
import {
  useServiceType,
  useUpdateServiceType,
} from '@/hooks/service-requests/use-service-types';
import type { CreateServiceTypeDto } from '@/types/service-request';

export default function EditServiceTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: serviceType, isLoading, error } = useServiceType(id);
  const updateServiceType = useUpdateServiceType();

  const handleSubmit = (data: CreateServiceTypeDto) => {
    updateServiceType.mutate(
      { id, data },
      {
        onSuccess: () => {
          router.push(`/service-requests/types/${id}`);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <ContentLayout title="Edit Service Type">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </ContentLayout>
    );
  }

  if (error || !serviceType) {
    return (
      <ContentLayout title="Edit Service Type">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-sm text-red-500">
            {error?.message || 'Service type not found'}
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={`Edit: ${serviceType.name}`}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/service-requests">Service Requests</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/service-requests/types">Types</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href={`/service-requests/types/${id}`}>{serviceType.name}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold">Edit Service Type</h1>
          <p className="text-muted-foreground">
            Update the configuration for &quot;{serviceType.name}&quot;
          </p>
        </div>

        <ServiceTypeForm
          initialData={serviceType}
          onSubmit={handleSubmit}
          isSubmitting={updateServiceType.isPending}
        />
      </div>
    </ContentLayout>
  );
}
