// app/(routes)/health/admin/programs/[id]/responses/page.tsx
// Created: 2026-06-16 — Health → Wellness Programs admin response-viewer.
// Read the raw survey answers participants submitted through the day forms.
// Sibling of impact/. Gated on health.programs.manage; the data layer (hpp_select
// RLS) independently limits non-managers to their own rows.
// Spec: specs/health-program-response-viewer-2026-06-16.md

import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ResponsesViewer } from './_components/responses-viewer';
import { NoProgramsAccess } from '../../_components/no-access';

export const metadata: Metadata = {
  title: 'Wellness Program Responses',
  description:
    'Read the survey answers participants submitted through a wellness program’s daily forms.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HealthProgramResponsesPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <ContentLayout title="Wellness Program Responses">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Manage Programs', href: '/health/admin/programs' },
          { label: 'Responses' },
        ]}
      />
      <PermissionGuard
        module="health"
        action="programs.manage"
        fallback={<NoProgramsAccess />}
      >
        <div className="mt-4 space-y-2">
          <div>
            <h1 className="py-1 text-2xl font-bold text-slate-800">
              Form responses
            </h1>
            <p className="text-sm text-slate-500 sm:text-base">
              What people actually answered — every day’s survey, in their own
              words.
            </p>
          </div>
          <div className="pt-2">
            <Suspense fallback={null}>
              <ResponsesViewer programId={id} />
            </Suspense>
          </div>
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
