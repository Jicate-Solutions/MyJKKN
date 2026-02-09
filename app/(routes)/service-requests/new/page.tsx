'use client';

import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useServiceTypes, useServiceType } from '@/hooks/service-requests/use-service-types';
import { useCreateServiceRequest } from '@/hooks/service-requests/use-service-requests';
import { ServiceTypeCard } from '../_components/service-type-card';
import { DynamicRequestForm } from '../_components/dynamic-request-form';
import type { ServiceType, ServiceRequestPriority } from '@/types/service-request';

export default function NewServiceRequestPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<ServiceType | null>(null);
  const [priority, setPriority] = useState<ServiceRequestPriority>('normal');

  const { data: serviceTypes, isLoading: typesLoading } = useServiceTypes({ is_active: true });
  const { data: typeDetail } = useServiceType(selectedType?.id || '');
  const createRequest = useCreateServiceRequest();

  const handleSelectType = (type: ServiceType) => {
    setSelectedType(type);
  };

  const handleNext = () => {
    if (selectedType) setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setSelectedType(null);
  };

  const handleSubmit = (formData: Record<string, any>) => {
    if (!selectedType) return;
    createRequest.mutate(
      {
        service_type_id: selectedType.id,
        form_data: formData,
        priority,
        status: 'submitted',
      },
      {
        onSuccess: () => {
          router.push('/service-requests?tab=my-requests');
        },
      }
    );
  };

  const handleSaveDraft = (formData: Record<string, any>) => {
    if (!selectedType) return;
    createRequest.mutate(
      {
        service_type_id: selectedType.id,
        form_data: formData,
        priority,
        status: 'draft',
      },
      {
        onSuccess: () => {
          router.push('/service-requests?tab=my-requests');
        },
      }
    );
  };

  return (
    <ContentLayout title="New Service Request">
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
            <BreadcrumbPage>New Request</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        <div>
          <h1 className="text-2xl font-bold">New Service Request</h1>
          <p className="text-muted-foreground">
            {step === 1
              ? 'Select the type of service you need'
              : `Fill out the ${selectedType?.name} request form`}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
              step === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            1
          </div>
          <div className="h-0.5 w-12 bg-muted" />
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
              step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
          >
            2
          </div>
        </div>

        {/* Step 1: Select Service Type */}
        {step === 1 && (
          <>
            {typesLoading ? (
              <div className="flex justify-center items-center min-h-[300px]">
                <p className="text-sm text-muted-foreground">Loading service types...</p>
              </div>
            ) : serviceTypes && serviceTypes.length > 0 ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {serviceTypes.map((type) => (
                    <ServiceTypeCard
                      key={type.id}
                      serviceType={type}
                      onSelect={handleSelectType}
                      selected={selectedType?.id === type.id}
                    />
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleNext} disabled={!selectedType} className="gap-2">
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <p className="text-sm text-muted-foreground">
                    No service types are available at the moment
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Step 2: Fill Form */}
        {step === 2 && selectedType && (
          <>
            <Button variant="ghost" onClick={handleBack} className="gap-2 mb-2">
              <ArrowLeft className="h-4 w-4" />
              Back to service type selection
            </Button>

            <Card>
              <CardHeader>
                <CardTitle>{selectedType.name}</CardTitle>
                {selectedType.description && (
                  <p className="text-sm text-muted-foreground">{selectedType.description}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Priority Selection */}
                {selectedType.enable_priority && (
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select
                      value={priority}
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
                  fields={typeDetail?.fields || selectedType.fields || []}
                  onSubmit={handleSubmit}
                  onSaveDraft={handleSaveDraft}
                  isSubmitting={createRequest.isPending}
                  submitLabel="Submit Request"
                />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </ContentLayout>
  );
}
