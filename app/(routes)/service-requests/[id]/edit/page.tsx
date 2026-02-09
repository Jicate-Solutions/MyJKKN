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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useServiceRequest,
  useUpdateServiceRequest,
  useSubmitServiceRequest,
} from '@/hooks/service-requests/use-service-requests';
import { useServiceType } from '@/hooks/service-requests/use-service-types';
import { DynamicRequestForm } from '../../_components/dynamic-request-form';
import { RequestStatusBadge } from '../../_components/request-status-badge';
import type { ServiceRequestPriority } from '@/types/service-request';
import { useState } from 'react';

export default function EditServiceRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: request, isLoading, error } = useServiceRequest(id);
  const { data: serviceType } = useServiceType(request?.service_type_id || '');
  const updateRequest = useUpdateServiceRequest();
  const submitRequest = useSubmitServiceRequest();
  const [priority, setPriority] = useState<ServiceRequestPriority | undefined>();

  const canEdit =
    request?.status === 'draft' || request?.status === 'returned';

  const handleSubmit = (formData: Record<string, any>) => {
    updateRequest.mutate(
      {
        id,
        data: {
          form_data: formData,
          priority: priority || request?.priority || undefined,
        },
      },
      {
        onSuccess: () => {
          // Auto-submit after update
          submitRequest.mutate(id, {
            onSuccess: () => {
              router.push(`/service-requests/${id}`);
            },
          });
        },
      }
    );
  };

  const handleSaveDraft = (formData: Record<string, any>) => {
    updateRequest.mutate(
      {
        id,
        data: {
          form_data: formData,
          priority: priority || request?.priority || undefined,
        },
      },
      {
        onSuccess: () => {
          router.push(`/service-requests/${id}`);
        },
      }
    );
  };

  if (isLoading) {
    return (
      <ContentLayout title="Edit Request">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </ContentLayout>
    );
  }

  if (error || !request) {
    return (
      <ContentLayout title="Edit Request">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-sm text-red-500">
            {error?.message || 'Request not found'}
          </p>
        </div>
      </ContentLayout>
    );
  }

  if (!canEdit) {
    return (
      <ContentLayout title="Edit Request">
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <p className="text-sm text-red-500 mb-2">
              This request cannot be edited in its current status.
            </p>
            <RequestStatusBadge status={request.status} />
          </div>
        </div>
      </ContentLayout>
    );
  }

  const fields = serviceType?.fields || request.service_type?.fields || [];

  return (
    <ContentLayout title={`Edit ${request.request_number}`}>
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
              <Link href={`/service-requests/${id}`}>{request.request_number}</Link>
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
          <h1 className="text-2xl font-bold">Edit Request</h1>
          <p className="text-muted-foreground">
            Update and resubmit your {request.service_type?.name || 'service'} request
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {request.service_type?.name || 'Request'} - {request.request_number}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Priority */}
            {request.service_type?.enable_priority && (
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select
                  value={priority || request.priority || 'normal'}
                  onValueChange={(v) => setPriority(v as ServiceRequestPriority)}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Dynamic Form */}
            <DynamicRequestForm
              fields={fields}
              defaultValues={request.form_data}
              onSubmit={handleSubmit}
              onSaveDraft={handleSaveDraft}
              isSubmitting={updateRequest.isPending || submitRequest.isPending}
              submitLabel="Update & Submit"
            />
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}
