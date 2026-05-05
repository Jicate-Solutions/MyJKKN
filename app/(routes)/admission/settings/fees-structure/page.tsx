'use client';

// app/(routes)/admission/settings/fees-structure/page.tsx
//
// Fee Structures admin (Plan 2 / Task 13).
// Split-pane shell: left = recursive 8-dim tree-rail, right = Form mode editor.
// Clone dialog opens from a top-right button on the editor pane.

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
import { FeesStructureTreeRail } from './_components/fees-structure-tree-rail';
import { FeesStructureForm } from './_components/fees-structure-form';
import { FeesStructureCloneDialog } from './_components/fees-structure-clone-dialog';
import type { FeeStructureMatrixDimensions } from '@/types/admission';

function FeesStructurePageContent() {
  const [selectedDims, setSelectedDims] = useState<Partial<FeeStructureMatrixDimensions>>({});
  const [coverageOnly, setCoverageOnly] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  // Bumping this signals the tree-rail to invalidate its coverage cache and
  // re-fetch fee-structure summaries (e.g. after a structure was created or
  // cloned). Cheap counter — no global state lib needed for v1.
  const [refreshTick, setRefreshTick] = useState(0);

  const handleSelect = (dims: FeeStructureMatrixDimensions) => {
    setSelectedDims(dims);
  };

  const handleStructureChanged = () => setRefreshTick((t) => t + 1);

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
              × department × programme × quota × community × accommodation × academic year).
              Drill into the tree to view, create, edit, or clone.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 h-[calc(100vh-260px)] min-h-[500px]">
            <FeesStructureTreeRail
              selectedDims={selectedDims}
              onSelect={handleSelect}
              coverageOnly={coverageOnly}
              onToggleCoverage={() => setCoverageOnly((c) => !c)}
              refreshTick={refreshTick}
            />
            <div className="border rounded-md overflow-auto p-4 bg-card">
              <div className="flex justify-end gap-2 mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCloneOpen(true)}
                  disabled={!selectedDims.institution_id}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Clone…
                </Button>
              </div>
              <FeesStructureForm dims={selectedDims} onChanged={handleStructureChanged} />
            </div>
          </div>

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
