'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { ArrowLeft } from 'lucide-react';
import { useServiceTypes, useServiceType } from '@/hooks/service-requests/use-service-types';
import { useCreateServiceRequest } from '@/hooks/service-requests/use-service-requests';
import { ServiceTypeCard } from '../_components/service-type-card';
import { DynamicRequestForm } from '../_components/dynamic-request-form';
import { GatePassRequesterSummary } from '../_components/gate-pass-requester-summary';
import { withGatePassFields, todayIsoIndia, GATE_PASS_FIELD_KEYS } from '@/lib/gate-security/gate-pass-form-fields';
import type { ServiceType, ServiceRequestPriority } from '@/types/service-request';

/**
 * navMeta — documents that this page is invoked via a button click on the
 * parent listing page, not via a nav chip. Required by
 * `scripts/assert-nav-coverage.mjs` for discoverability tracking.
 */
export const navMeta = {
  invokedFrom: '/service-requests',
} as const;


export default function NewServiceRequestPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<ServiceType | null>(null);
  const [priority, setPriority] = useState<ServiceRequestPriority>('normal');

  const { data: serviceTypes, isLoading: typesLoading } = useServiceTypes({ is_active: true, scope: 'user' });
  const { data: typeDetail } = useServiceType(selectedType?.id || '');
  const createRequest = useCreateServiceRequest();

  // Deep link: /service-requests/new?type=<slug> (e.g. the "My Gate Pass"
  // page sends learners straight to the Gate Pass type).
  const searchParams = useSearchParams();
  const wantedSlug = searchParams.get('type');
  useEffect(() => {
    if (!wantedSlug || selectedType || !serviceTypes) return;
    const match = serviceTypes.find((t) => t.slug === wantedSlug);
    if (match) {
      setSelectedType(match);
      setStep(2);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedSlug, serviceTypes]);

  const handleSelectType = (type: ServiceType) => {
    setSelectedType(type);
    setStep(2);
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
        onSuccess: (data) => {
          router.push(`/service-requests/${data.id}`);
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
        onSuccess: (data) => {
          router.push(`/service-requests/${data.id}`);
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

      {/* Mobile bottom-nav (z-[80]) + AttentionBar (z-[75]) both fix to the
          bottom on <lg screens and would otherwise occlude the Next / Submit
          button. pb-28 = 112px clearance; lg:pb-6 resets at the breakpoint
          where both bars are hidden. */}
      <div className="space-y-6 mt-4 pb-28 lg:pb-6">
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

                {/* Gate Pass types: profile details are filled automatically */}
                {(typeDetail?.issues_gate_pass ?? selectedType.issues_gate_pass) && (
                  <GatePassRequesterSummary />
                )}

                {/* Dynamic Form */}
                <DynamicRequestForm
                  key={selectedType.id}
                  fields={withGatePassFields(
                    typeDetail?.issues_gate_pass ?? selectedType.issues_gate_pass,
                    typeDetail?.fields || selectedType.fields || []
                  )}
                  defaultValues={
                    (typeDetail?.issues_gate_pass ?? selectedType.issues_gate_pass)
                      ? { [GATE_PASS_FIELD_KEYS.date]: todayIsoIndia() }
                      : undefined
                  }
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
