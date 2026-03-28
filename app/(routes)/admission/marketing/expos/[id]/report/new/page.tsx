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
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { DailyReportForm } from '../../../_components/daily-report-form';
import { useExpoEvent } from '@/hooks/admission/use-expos';
import { useExpoTeamAccess } from '@/hooks/admission/use-expo-capture';

function NewReportPageContent() {
  const params = useParams();
  const id = params.id as string;
  const { event: expoEvent, isLoading: eventLoading } = useExpoEvent(id);
  const access = useExpoTeamAccess(id);

  const isLoading = eventLoading || access.isLoading;

  // Only team leaders and admins can submit daily reports
  if (!isLoading && !access.canSubmitReport) {
    return (
      <Card className="mx-auto mt-8 max-w-md">
        <CardContent className="flex flex-col items-center py-8">
          <AlertCircle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">Access Restricted</h2>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Only team leaders and admission managers can submit daily reports.
          </p>
          <Link href={`/admission/marketing/expos/${id}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Event
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
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
    </>
  );
}

// No PermissionGuard — access controlled by useExpoTeamAccess (team leader + admin only)
export default function NewReportPage() {
  const params = useParams();
  const id = params.id as string;
  const { event: expoEvent } = useExpoEvent(id);

  return (
    <ContentLayout title="Add Daily Report">
      <div className="space-y-6">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/dashboard">Admission</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/admission/marketing/expos">Expos</BreadcrumbLink>
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

        <AdmissionErrorBoundary>
          <NewReportPageContent />
        </AdmissionErrorBoundary>
      </div>
    </ContentLayout>
  );
}
