'use client';

// app/(routes)/admission/settings/fees-structure/new/page.tsx
//
// Create page for a new fee structure. Reuses the dimension-selector +
// FeesStructureForm components — when all 8 dims are selected, the form
// renders below. On successful save, the form's onChanged callback redirects
// the admin back to the list page so they can confirm the new row.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ContentLayout } from '@/components/layout/content-layout';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { FeesStructureDimensionSelector } from '../_components/fees-structure-dimension-selector';
import { FeesStructureForm } from '../_components/fees-structure-form';
import type { FeeStructureMatrixDimensions } from '@/types/admission';

function NewFeeStructurePageContent() {
  const router = useRouter();
  const [selectedDims, setSelectedDims] = useState<Partial<FeeStructureMatrixDimensions>>({});

  const allDimsSelected = !!(
    selectedDims.institution_id
    && selectedDims.degree_id
    && selectedDims.department_id
    && selectedDims.programme_id
    && selectedDims.admission_year_id
    && selectedDims.quota_id
    && selectedDims.accommodation_type_id
  );

  const handleSaved = () => {
    // After save, head back to the list. Admin sees their new row at the top
    // (list orders by updated_at desc).
    router.push('/admission/settings/fees-structure');
  };

  return (
    <PermissionGuard module="admission.settings" action="view">
      <ContentLayout title="New Fee Structure">
        <div className="space-y-4">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/">Dashboard</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admission/dashboard">Admission</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admission/settings">Settings</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admission/settings/fees-structure">Fee Structures</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>New</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold py-1">New Fee Structure</h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Pick the 8 dimensions, then add billing categories with amounts.
              </p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admission/settings/fees-structure">
                <ArrowLeft className="h-4 w-4 mr-1" /> Back to list
              </Link>
            </Button>
          </div>

          {/* Dimension selector */}
          <FeesStructureDimensionSelector
            selectedDims={selectedDims}
            onChange={setSelectedDims}
          />

          {/* Form — only renders when all 8 dims are selected */}
          {allDimsSelected ? (
            <div className="border rounded-md p-4 bg-card">
              <FeesStructureForm dims={selectedDims} onChanged={handleSaved} />
            </div>
          ) : (
            <div className="border rounded-md p-8 bg-muted/30 text-center text-sm text-muted-foreground">
              Pick all 8 dimensions above to start building the fee structure.
            </div>
          )}
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function NewFeeStructurePage() {
  return (
    <AdmissionErrorBoundary>
      <NewFeeStructurePageContent />
    </AdmissionErrorBoundary>
  );
}
