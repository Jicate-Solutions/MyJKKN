// app/(routes)/health/admin/programs/[id]/page.tsx
// Created: 2026-06-15 — Health → Wellness Programs admin (PR3/3).
// Edit a single program + manage its 7 days (with optional per-day quiz).
// Gated on health.programs.manage. Spec: specs/health-wellness-programs-2026-06-15.md

import type { Metadata } from 'next';

import { ContentLayout } from '@/components/layout/content-layout';
import { PageBreadcrumb } from '@/components/navigation';
import { PermissionGuard } from '@/components/auth/permission-guard';
import { ProgramEditor } from '../_components/program-editor';
import { NoProgramsAccess } from '../_components/no-access';

export const metadata: Metadata = {
  title: 'Edit Wellness Program',
  description: 'Edit a wellness program and author its daily videos and quizzes.',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HealthProgramEditPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <ContentLayout title="Edit Wellness Program">
      <PageBreadcrumb
        items={[
          { label: 'Home', href: '/' },
          { label: 'Health', href: '/health/dashboard' },
          { label: 'Manage Programs', href: '/health/admin/programs' },
          { label: 'Edit' },
        ]}
      />
      <PermissionGuard
        module="health"
        action="programs.manage"
        fallback={<NoProgramsAccess />}
      >
        <div className="mt-4">
          <ProgramEditor programId={id} />
        </div>
      </PermissionGuard>
    </ContentLayout>
  );
}
