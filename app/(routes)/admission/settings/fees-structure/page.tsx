'use client';

// app/(routes)/admission/settings/fees-structure/page.tsx
//
// Fee Structures admin — list view (rewritten 2026-05-06).
// Pattern matches other admission settings modules (years, assignment-rules):
// list page with filters + table + "New" button → /new route for create
// → /[id] route for view/edit. Replaces the prior in-page form layout.

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
import { AdmissionErrorBoundary } from '@/components/admission';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { FeeStructuresListView } from './_components/fee-structures-list-view';

function FeesStructurePageContent() {
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
              Manage matrix-keyed fee structures (institution × degree × department × programme
              × admission year × quota × community × accommodation). Click any row to view or edit.
            </p>
          </div>

          <FeeStructuresListView />
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
