'use client';

import { use } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useServiceType } from '@/hooks/service-requests/use-service-types';
import { Edit, FileText, CheckCircle } from 'lucide-react';

export default function ServiceTypeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: serviceType, isLoading, error } = useServiceType(id);

  if (isLoading) {
    return (
      <ContentLayout title="Service Type">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </ContentLayout>
    );
  }

  if (error || !serviceType) {
    return (
      <ContentLayout title="Service Type">
        <div className="flex justify-center items-center min-h-[400px]">
          <p className="text-sm text-red-500">
            {error?.message || 'Service type not found'}
          </p>
        </div>
      </ContentLayout>
    );
  }

  return (
    <ContentLayout title={serviceType.name}>
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
            <BreadcrumbPage>{serviceType.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-6 mt-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div className="flex items-center gap-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${serviceType.color}20` }}
            >
              <FileText className="h-6 w-6" style={{ color: serviceType.color }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{serviceType.name}</h1>
              <p className="text-sm text-muted-foreground font-mono">{serviceType.slug}</p>
            </div>
            {!serviceType.is_active && (
              <Badge variant="secondary">Inactive</Badge>
            )}
          </div>
          <Button asChild>
            <Link href={`/service-requests/types/${id}/edit`}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
          </Button>
        </div>

        {serviceType.description && (
          <p className="text-muted-foreground">{serviceType.description}</p>
        )}

        {/* Configuration */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <InfoRow label="Max Active Requests" value={String(serviceType.max_active_requests)} />
              <InfoRow label="Auto-Fulfill on Approval" value={serviceType.auto_fulfill_on_approval ? 'Yes' : 'No'} />
              <InfoRow label="Priority Enabled" value={serviceType.enable_priority ? 'Yes' : 'No'} />
              <InfoRow label="Attachments Enabled" value={serviceType.enable_attachments ? 'Yes' : 'No'} />
              <InfoRow label="Email Notifications" value={serviceType.enable_email_notifications ? 'Yes' : 'No'} />
              {serviceType.validity_period_days && (
                <InfoRow label="Validity Period" value={`${serviceType.validity_period_days} days`} />
              )}
              <div className="pt-2">
                <span className="text-sm text-muted-foreground">Allowed Roles:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {serviceType.allowed_roles.map((role) => (
                    <Badge key={role} variant="outline" className="text-xs capitalize">
                      {role.replace(/_/g, ' ')}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Fields */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Form Fields ({serviceType.fields?.length || 0})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {serviceType.fields && serviceType.fields.length > 0 ? (
                <div className="space-y-3">
                  {serviceType.fields
                    .sort((a, b) => a.display_order - b.display_order)
                    .map((field) => (
                      <div
                        key={field.id}
                        className="flex items-center justify-between p-3 rounded-md border"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{field.field_label}</span>
                            {field.is_required && (
                              <Badge variant="destructive" className="text-xs">Required</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {field.field_type} | key: {field.field_key}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-xs capitalize">
                          {field.field_type}
                        </Badge>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No fields configured</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Approval Steps */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Approval Workflow ({serviceType.approval_steps?.length || 0} steps)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {serviceType.approval_steps && serviceType.approval_steps.length > 0 ? (
              <div className="space-y-3">
                {serviceType.approval_steps
                  .sort((a, b) => a.step_order - b.step_order)
                  .map((step) => (
                    <div
                      key={step.id}
                      className="flex items-center gap-4 p-3 rounded-md border"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-semibold shrink-0">
                        {step.step_order}
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-medium">{step.step_name}</span>
                        <p className="text-xs text-muted-foreground capitalize">
                          Role: {step.approver_role.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {step.is_required && (
                          <Badge variant="outline" className="text-xs">Required</Badge>
                        )}
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No approval steps configured</p>
            )}
          </CardContent>
        </Card>
      </div>
    </ContentLayout>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
