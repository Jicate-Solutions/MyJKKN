'use client';

import { useParams } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { Skeleton } from '@/components/ui/skeleton';
import { DailyReportForm } from '../../../_components/daily-report-form';
import { useExpoEvent } from '@/hooks/admission/use-expos';

function NewReportPageContent() {
  const params = useParams();
  const id = params.id as string;
  const { event: expoEvent, isLoading } = useExpoEvent(id);

  return (
    <PermissionGuard module="admission.marketing.expos" action="create">
      <ContentLayout title="Add Daily Report">
        <div className="space-y-6">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/dashboard">
                  Admission
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href="/admission/marketing/expos">
                  Expos
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink href={`/admission/marketing/expos/${id}`}>
                  {expoEvent?.event_name || 'Event'}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>New Daily Report</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-[150px] w-full" />
              <Skeleton className="h-[200px] w-full" />
              <Skeleton className="h-[200px] w-full" />
            </div>
          ) : expoEvent ? (
            <DailyReportForm expoEvent={expoEvent} />
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              Expo event not found.
            </div>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function NewReportPage() {
  return (
    <AdmissionErrorBoundary>
      <NewReportPageContent />
    </AdmissionErrorBoundary>
  );
}
