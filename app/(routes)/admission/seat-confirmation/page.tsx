'use client';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from '@/components/ui/breadcrumb';
import { AdmissionErrorBoundary } from '@/components/admission';
import { SeatConfirmationDataTable } from './_components/seat-confirmation-data-table';

function SeatConfirmationPageContent() {
  return (
    <ContentLayout title="Seat Confirmation">
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
              <BreadcrumbPage>Seat Confirmation</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <SeatConfirmationDataTable />
      </div>
    </ContentLayout>
  );
}

export default function SeatConfirmationPage() {
  return (
    <AdmissionErrorBoundary>
      <SeatConfirmationPageContent />
    </AdmissionErrorBoundary>
  );
}
