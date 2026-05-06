'use client';

// app/(routes)/admission/settings/fees-structure/page.tsx
//
// Fee Structures admin (Plan 2 / Task 13, redesigned 2026-05-06).
// Form-format layout: 8 cascading <Select> dropdowns at the top, fee-structure
// editor stacked below once all 8 dims are selected. Replaces the prior
// recursive tree-rail layout (kept in repo at fees-structure-tree-rail.tsx
// for reference — admins can still build their mental model from it).

import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { FeesStructureDimensionSelector } from './_components/fees-structure-dimension-selector';
import { FeesStructureForm } from './_components/fees-structure-form';
import { FeesStructureCloneDialog } from './_components/fees-structure-clone-dialog';
import type { FeeStructureMatrixDimensions } from '@/types/admission';

function FeesStructurePageContent() {
  const [selectedDims, setSelectedDims] = useState<Partial<FeeStructureMatrixDimensions>>({});
  const [cloneOpen, setCloneOpen] = useState(false);
  // Bumping this signals child components to refresh after a structure was
  // created or cloned. Cheap counter — no global state lib needed for v1.
  const [, setRefreshTick] = useState(0);

  const handleStructureChanged = () => setRefreshTick((t) => t + 1);

  const allDimsSelected = !!(
    selectedDims.institution_id
    && selectedDims.degree_id
    && selectedDims.department_id
    && selectedDims.programme_id
    && selectedDims.admission_year_id
    && selectedDims.quota_id
    && selectedDims.community_category_id
    && selectedDims.accommodation_type_id
  );

  return (
    <PermissionGuard module="admission.settings" action="view">
      <ContentLayout title="Fee Structures">
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
                <BreadcrumbPage>Fee Structures</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div>
            <h1 className="text-2xl font-bold py-1">Fee Structures</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Configure 8-dimension matrix-keyed fee structures (institution × degree
              × department × programme × admission year × quota × community × accommodation).
              Pick all 8 dropdowns to load the editor.
            </p>
          </div>

          {/* Top section — cascading dimension dropdowns */}
          <FeesStructureDimensionSelector
            selectedDims={selectedDims}
            onChange={setSelectedDims}
          />

          {/* Action bar — clone is enabled once an institution is picked */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCloneOpen(true)}
              disabled={!selectedDims.institution_id}
              title={
                !selectedDims.institution_id
                  ? 'Select an institution to enable clone'
                  : 'Clone an existing structure to a new academic year or with overrides'
              }
            >
              <Copy className="h-4 w-4 mr-1" />
              Clone…
            </Button>
          </div>

          {/* Editor — only shows once all 8 dims are selected */}
          {allDimsSelected && (
            <div className="border rounded-md p-4 bg-card">
              <FeesStructureForm dims={selectedDims} onChanged={handleStructureChanged} />
            </div>
          )}

          {!allDimsSelected && (
            <div className="border rounded-md p-8 bg-muted/30 text-center text-sm text-muted-foreground">
              Pick all 8 dimensions above to view, edit, or create a fee structure.
            </div>
          )}

          <FeesStructureCloneDialog
            open={cloneOpen}
            onOpenChange={setCloneOpen}
            sourceDims={selectedDims}
            onCloned={handleStructureChanged}
          />
        </div>
      </ContentLayout>
    </PermissionGuard>
  );
}

export default function FeesStructurePage() {
  return (
    <AdmissionErrorBoundary>
      <FeesStructurePageContent />
    </AdmissionErrorBoundary>
  );
}
