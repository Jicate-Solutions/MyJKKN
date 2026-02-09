'use client';

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
import { ServiceTypeForm } from '../../_components/service-type-form';
import { useCreateServiceType } from '@/hooks/service-requests/use-service-types';
import type { CreateServiceTypeDto } from '@/types/service-request';

export default function NewServiceTypePage() {
  const router = useRouter();
  const createServiceType = useCreateServiceType();

  const handleSubmit = (data: CreateServiceTypeDto) => {
    createServiceType.mutate(data, {
      onSuccess: () => {
        router.push('/service-requests/types');
      },
    });
  };

  return (
    <ContentLayout title="Create Service Type">
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
            <BreadcrumbPage>New</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold">Create Service Type</h1>
          <p className="text-muted-foreground">
            Define a new service request type with custom fields and approval workflow
          </p>
        </div>

        <ServiceTypeForm
          onSubmit={handleSubmit}
          isSubmitting={createServiceType.isPending}
        />
      </div>
    </ContentLayout>
  );
}
